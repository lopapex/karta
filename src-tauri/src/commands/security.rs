use std::{
    fs,
    sync::atomic::{AtomicU32, Ordering},
    time::Duration,
};

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroizing;

use crate::{
    database::{initialize_files, storage_shape, with_crypto_stack, AppState, StorageShape},
    error::{CommandError, CommandResult},
    models::{AppPasswordInput, ChangePasswordInput, SecurityState, SecurityStatus},
    platform::{PlatformKeyStore, SystemKeyStore},
    validation::validate_app_password,
};

const KEY_MAGIC: &[u8; 8] = b"KARTKEY2";
const SALT_LENGTH: usize = 16;
const NONCE_LENGTH: usize = 12;
const KEY_HEADER_LENGTH: usize = KEY_MAGIC.len() + SALT_LENGTH + NONCE_LENGTH;
static FAILED_UNLOCKS: AtomicU32 = AtomicU32::new(0);

#[tauri::command]
pub fn get_security_status(state: State<'_, AppState>) -> CommandResult<SecurityStatus> {
    Ok(current_status(&state))
}

fn current_status(state: &AppState) -> SecurityStatus {
    SecurityStatus {
        state: security_state(state),
    }
}

fn security_state(state: &AppState) -> SecurityState {
    if state.is_unlocked() {
        return SecurityState::Unlocked;
    }
    match storage_shape(&state.paths) {
        StorageShape::Empty => SecurityState::NeedsInitialization,
        StorageShape::Complete => match fs::read(&state.paths.key) {
            Ok(bytes) if is_password_key(&bytes) => SecurityState::Locked,
            Ok(_) => SecurityState::NeedsPasswordMigration,
            Err(_) => SecurityState::Inconsistent,
        },
        StorageShape::Inconsistent => SecurityState::Inconsistent,
    }
}

#[tauri::command]
pub async fn initialize_secure_storage(
    input: AppPasswordInput,
    app: AppHandle,
) -> CommandResult<SecurityStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        validate_app_password(&input.password)?;
        match security_state(&state) {
            SecurityState::NeedsInitialization => {
                let mut database_key = Zeroizing::new(vec![0_u8; 32]);
                getrandom::fill(database_key.as_mut()).map_err(|_| CommandError::storage())?;
                let protected_key = wrap_database_key(&input.password, &database_key)?;
                with_crypto_stack(|| {
                    initialize_files(&state.paths, &database_key, &protected_key)?;
                    state.unlock(database_key.to_vec())
                })?;
            }
            SecurityState::NeedsPasswordMigration => {
                let legacy = fs::read(&state.paths.key).map_err(|_| CommandError::storage())?;
                let database_key = Zeroizing::new(SystemKeyStore.unprotect_legacy_key(&legacy)?);
                if database_key.len() != 32 {
                    return Err(CommandError::storage());
                }
                with_crypto_stack(|| state.unlock(database_key.to_vec()))?;
                let protected_key = wrap_database_key(&input.password, &database_key)?;
                replace_key_atomically(&state, &protected_key)?;
            }
            _ => {
                return Err(CommandError::new(
                    "storage_exists",
                    "Zabezpečené úložiště už existuje.",
                ))
            }
        }
        FAILED_UNLOCKS.store(0, Ordering::Relaxed);
        Ok(current_status(&state))
    })
    .await
    .map_err(|_| CommandError::storage())?
}

#[tauri::command]
pub async fn unlock_database(
    input: AppPasswordInput,
    app: AppHandle,
) -> CommandResult<SecurityStatus> {
    {
        let state = app.state::<AppState>();
        validate_app_password(&input.password)?;
        if state.is_unlocked() {
            return Ok(current_status(&state));
        }
        if !matches!(security_state(&state), SecurityState::Locked) {
            return Err(CommandError::new(
                "storage_inconsistent",
                "Databáze nebo její klíč chybí. KARTA zůstala zamčená.",
            ));
        }
    }
    let failures = FAILED_UNLOCKS.load(Ordering::Relaxed).min(5);
    if failures > 0 {
        let delay = Duration::from_millis(250 * ((1_u64 << failures) - 1));
        tauri::async_runtime::spawn_blocking(move || std::thread::sleep(delay))
            .await
            .map_err(|_| CommandError::storage())?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let wrapped = fs::read(&state.paths.key).map_err(|_| CommandError::storage())?;
        let database_key = match unwrap_database_key(&input.password, &wrapped) {
            Ok(key) => key,
            Err(error) => {
                FAILED_UNLOCKS.fetch_add(1, Ordering::Relaxed);
                return Err(error);
            }
        };
        if let Err(error) = with_crypto_stack(|| state.unlock(database_key.to_vec())) {
            FAILED_UNLOCKS.fetch_add(1, Ordering::Relaxed);
            return Err(error);
        }
        FAILED_UNLOCKS.store(0, Ordering::Relaxed);
        Ok(current_status(&state))
    })
    .await
    .map_err(|_| CommandError::storage())?
}

#[tauri::command]
pub async fn change_password(
    input: ChangePasswordInput,
    app: AppHandle,
) -> CommandResult<SecurityStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        validate_app_password(&input.current_password)?;
        validate_app_password(&input.new_password)?;
        if !state.is_unlocked() {
            return Err(CommandError::locked());
        }
        let wrapped = fs::read(&state.paths.key).map_err(|_| CommandError::storage())?;
        let database_key = unwrap_database_key(&input.current_password, &wrapped)?;
        let replacement = wrap_database_key(&input.new_password, &database_key)?;
        replace_key_atomically(&state, &replacement)?;
        Ok(SecurityStatus {
            state: SecurityState::Unlocked,
        })
    })
    .await
    .map_err(|_| CommandError::storage())?
}

pub(crate) fn is_password_key(bytes: &[u8]) -> bool {
    bytes.starts_with(KEY_MAGIC)
}

pub(crate) fn wrap_database_key(password: &str, database_key: &[u8]) -> CommandResult<Vec<u8>> {
    validate_app_password(password)?;
    let mut salt = [0_u8; SALT_LENGTH];
    let mut nonce_bytes = [0_u8; NONCE_LENGTH];
    getrandom::fill(&mut salt).map_err(|_| CommandError::storage())?;
    getrandom::fill(&mut nonce_bytes).map_err(|_| CommandError::storage())?;
    let wrapping_key = derive_wrapping_key(password, &salt)?;
    let cipher =
        Aes256Gcm::new_from_slice(wrapping_key.as_ref()).map_err(|_| CommandError::storage())?;
    let encrypted = cipher
        .encrypt(
            Nonce::from_slice(&nonce_bytes),
            Payload {
                msg: database_key,
                aad: KEY_MAGIC,
            },
        )
        .map_err(|_| CommandError::storage())?;
    let mut result = Vec::with_capacity(KEY_HEADER_LENGTH + encrypted.len());
    result.extend_from_slice(KEY_MAGIC);
    result.extend_from_slice(&salt);
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&encrypted);
    Ok(result)
}

pub(crate) fn unwrap_database_key(
    password: &str,
    wrapped: &[u8],
) -> CommandResult<Zeroizing<Vec<u8>>> {
    if wrapped.len() <= KEY_HEADER_LENGTH || !is_password_key(wrapped) {
        return Err(CommandError::new(
            "invalid_key_file",
            "Soubor klíče KARTA není platný.",
        ));
    }
    let salt = &wrapped[KEY_MAGIC.len()..KEY_MAGIC.len() + SALT_LENGTH];
    let nonce_start = KEY_MAGIC.len() + SALT_LENGTH;
    let nonce = &wrapped[nonce_start..nonce_start + NONCE_LENGTH];
    let wrapping_key = derive_wrapping_key(password, salt)?;
    let cipher =
        Aes256Gcm::new_from_slice(wrapping_key.as_ref()).map_err(|_| CommandError::storage())?;
    let key = cipher
        .decrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: &wrapped[KEY_HEADER_LENGTH..],
                aad: KEY_MAGIC,
            },
        )
        .map_err(|_| CommandError::new("invalid_password", "Heslo KARTA není správné."))?;
    if key.len() != 32 {
        return Err(CommandError::storage());
    }
    Ok(Zeroizing::new(key))
}

fn derive_wrapping_key(password: &str, salt: &[u8]) -> CommandResult<Zeroizing<[u8; 32]>> {
    let params = Params::new(65_536, 3, 1, Some(32)).map_err(|_| CommandError::storage())?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new([0_u8; 32]);
    argon2
        .hash_password_into(password.as_bytes(), salt, key.as_mut())
        .map_err(|_| CommandError::storage())?;
    Ok(key)
}

pub(crate) fn replace_key_atomically(state: &AppState, bytes: &[u8]) -> CommandResult<()> {
    let pending = state.paths.directory.join("karta.key.changing");
    let previous = state.paths.directory.join("karta.key.previous");
    let _ = fs::remove_file(&pending);
    let _ = fs::remove_file(&previous);
    fs::write(&pending, bytes).map_err(|_| CommandError::storage())?;
    fs::File::open(&pending)
        .and_then(|file| file.sync_all())
        .map_err(|_| CommandError::storage())?;
    fs::rename(&state.paths.key, &previous).map_err(|_| CommandError::storage())?;
    if fs::rename(&pending, &state.paths.key).is_err() {
        let _ = fs::rename(&previous, &state.paths.key);
        return Err(CommandError::storage());
    }
    let _ = fs::remove_file(previous);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_key_round_trip_and_wrong_password() {
        let key = [7_u8; 32];
        let wrapped = wrap_database_key("dlouhe heslo", &key).unwrap();
        assert_eq!(
            unwrap_database_key("dlouhe heslo", &wrapped)
                .unwrap()
                .as_slice(),
            key
        );
        assert!(unwrap_database_key("spatne heslo", &wrapped).is_err());
    }
}
