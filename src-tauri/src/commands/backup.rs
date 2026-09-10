use std::{fs, path::Path};

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use tauri::State;
use zeroize::Zeroizing;

use super::security::{unwrap_database_key, wrap_database_key};
use crate::{
    database::{install_imported_files, with_crypto_stack, AppState},
    error::{CommandError, CommandResult},
    models::{BackupPasswordInput, BackupResult},
    validation::{validate_app_password, validate_backup_password},
};

const MAGIC: &[u8; 8] = b"KARTABK1";
const SALT_LENGTH: usize = 16;
const NONCE_LENGTH: usize = 12;
const HEADER_LENGTH: usize = MAGIC.len() + SALT_LENGTH + NONCE_LENGTH;
const MAX_BACKUP_SIZE: u64 = 2 * 1024 * 1024 * 1024;

#[tauri::command]
pub async fn export_database(
    input: BackupPasswordInput,
    state: State<'_, AppState>,
) -> CommandResult<BackupResult> {
    validate_backup_password(&input.password)?;
    let Some(path) = rfd::FileDialog::new()
        .set_title("Uložit přenosnou zálohu KARTA")
        .add_filter("Záloha KARTA", &["karta-backup"])
        .set_file_name("KARTA.karta-backup")
        .save_file()
    else {
        return Err(CommandError::new(
            "dialog_canceled",
            "Výběr souboru byl zrušen.",
        ));
    };

    let (database_key, database_bytes) = state.checkpoint_and_copy()?;
    let encrypted = encrypt_backup(&input.password, &database_key, &database_bytes)?;
    write_backup_atomically(&path, &encrypted)?;
    Ok(BackupResult {
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("KARTA.karta-backup")
            .to_owned(),
    })
}

#[tauri::command]
pub async fn import_database(
    input: BackupPasswordInput,
    state: State<'_, AppState>,
) -> CommandResult<BackupResult> {
    validate_backup_password(&input.password)?;
    let Some(path) = rfd::FileDialog::new()
        .set_title("Obnovit přenosnou zálohu KARTA")
        .add_filter("Záloha KARTA", &["karta-backup"])
        .pick_file()
    else {
        return Err(CommandError::new(
            "dialog_canceled",
            "Výběr souboru byl zrušen.",
        ));
    };
    let metadata = fs::metadata(&path)
        .map_err(|_| CommandError::new("invalid_backup", "Zálohu nelze přečíst."))?;
    if metadata.len() > MAX_BACKUP_SIZE {
        return Err(CommandError::new(
            "invalid_backup",
            "Záloha je příliš velká.",
        ));
    }
    let encrypted = fs::read(&path)
        .map_err(|_| CommandError::new("invalid_backup", "Zálohu nelze přečíst."))?;
    let (database_key, database_bytes) = decrypt_backup(&input.password, &encrypted)?;
    let app_password = if state.is_unlocked() {
        input.app_password.as_deref().ok_or_else(|| {
            CommandError::new("app_password_required", "Zadejte současné heslo KARTA.")
        })?
    } else {
        input.new_app_password.as_deref().ok_or_else(|| {
            CommandError::new("new_password_required", "Nastavte nové heslo KARTA.")
        })?
    };
    validate_app_password(app_password)?;
    if state.is_unlocked() {
        let current_wrapped = fs::read(&state.paths.key).map_err(|_| CommandError::storage())?;
        let _ = unwrap_database_key(app_password, &current_wrapped)?;
    }
    let protected_key = wrap_database_key(app_password, &database_key)?;
    with_crypto_stack(|| {
        install_imported_files(&state, &database_bytes, &database_key, &protected_key)
    })?;
    Ok(BackupResult {
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("KARTA.karta-backup")
            .to_owned(),
    })
}

fn derive_key(password: &str, salt: &[u8]) -> CommandResult<Zeroizing<[u8; 32]>> {
    let params = Params::new(65_536, 3, 1, Some(32)).map_err(|_| CommandError::storage())?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new([0_u8; 32]);
    argon2
        .hash_password_into(password.as_bytes(), salt, key.as_mut())
        .map_err(|_| CommandError::storage())?;
    Ok(key)
}

fn encrypt_backup(password: &str, database_key: &[u8], database: &[u8]) -> CommandResult<Vec<u8>> {
    let mut salt = [0_u8; SALT_LENGTH];
    let mut nonce_bytes = [0_u8; NONCE_LENGTH];
    getrandom::fill(&mut salt).map_err(|_| CommandError::storage())?;
    getrandom::fill(&mut nonce_bytes).map_err(|_| CommandError::storage())?;
    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| CommandError::storage())?;
    let mut plaintext = Zeroizing::new(Vec::with_capacity(32 + database.len()));
    plaintext.extend_from_slice(database_key);
    plaintext.extend_from_slice(database);
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce_bytes),
            Payload {
                msg: plaintext.as_ref(),
                aad: MAGIC,
            },
        )
        .map_err(|_| CommandError::storage())?;
    let mut result = Vec::with_capacity(HEADER_LENGTH + ciphertext.len());
    result.extend_from_slice(MAGIC);
    result.extend_from_slice(&salt);
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

fn decrypt_backup(
    password: &str,
    encrypted: &[u8],
) -> CommandResult<(Zeroizing<Vec<u8>>, Vec<u8>)> {
    if encrypted.len() <= HEADER_LENGTH + 32 || &encrypted[..MAGIC.len()] != MAGIC {
        return Err(CommandError::new(
            "invalid_backup",
            "Záloha nemá platný formát KARTA.",
        ));
    }
    let salt = &encrypted[MAGIC.len()..MAGIC.len() + SALT_LENGTH];
    let nonce_start = MAGIC.len() + SALT_LENGTH;
    let nonce = &encrypted[nonce_start..nonce_start + NONCE_LENGTH];
    let ciphertext = &encrypted[HEADER_LENGTH..];
    let key = derive_key(password, salt)?;
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| CommandError::storage())?;
    let plaintext = cipher
        .decrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad: MAGIC,
            },
        )
        .map_err(|_| {
            CommandError::new(
                "invalid_backup_password",
                "Heslo zálohy není správné nebo je soubor poškozený.",
            )
        })?;
    let (database_key, database) = plaintext.split_at(32);
    Ok((Zeroizing::new(database_key.to_vec()), database.to_vec()))
}

fn write_backup_atomically(path: &Path, bytes: &[u8]) -> CommandResult<()> {
    let pending = path.with_extension("karta-backup.pending");
    let previous = path.with_extension("karta-backup.previous");
    let _ = fs::remove_file(&pending);
    let _ = fs::remove_file(&previous);
    fs::write(&pending, bytes)
        .map_err(|_| CommandError::new("backup_write_failed", "Zálohu nelze uložit."))?;
    fs::File::open(&pending)
        .and_then(|file| file.sync_all())
        .map_err(|_| CommandError::new("backup_write_failed", "Zálohu nelze dokončit."))?;
    if path.exists() {
        fs::rename(path, &previous)
            .map_err(|_| CommandError::new("backup_write_failed", "Zálohu nelze přepsat."))?;
    }
    if fs::rename(&pending, path).is_err() {
        let _ = fs::rename(&previous, path);
        return Err(CommandError::new(
            "backup_write_failed",
            "Zálohu nelze dokončit.",
        ));
    }
    let _ = fs::remove_file(previous);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portable_backup_round_trip_and_wrong_password_fails() {
        let key = [9_u8; 32];
        let database = b"encrypted database bytes";
        let backup = encrypt_backup("correct horse battery", &key, database).unwrap();
        let (restored_key, restored_database) =
            decrypt_backup("correct horse battery", &backup).unwrap();
        assert_eq!(restored_key.as_slice(), key);
        assert_eq!(restored_database, database);
        assert!(decrypt_backup("wrong password value", &backup).is_err());
    }
}
