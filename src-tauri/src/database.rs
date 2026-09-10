use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    thread,
};

use rusqlite::{Connection, OpenFlags};
use zeroize::Zeroizing;

use crate::error::{CommandError, CommandResult};

const CRYPTO_THREAD_STACK_SIZE: usize = 64 * 1024 * 1024;

pub fn with_crypto_stack<T, F>(operation: F) -> CommandResult<T>
where
    T: Send,
    F: FnOnce() -> CommandResult<T> + Send,
{
    thread::scope(|scope| {
        thread::Builder::new()
            .name("karta-crypto".to_owned())
            .stack_size(CRYPTO_THREAD_STACK_SIZE)
            .spawn_scoped(scope, operation)
            .map_err(|_| CommandError::storage())?
            .join()
            .map_err(|_| CommandError::storage())?
    })
}

pub const DATABASE_FILE: &str = "karta.db";
pub const KEY_FILE: &str = "karta.key";

#[derive(Debug, Clone)]
pub struct DatabasePaths {
    pub directory: PathBuf,
    pub database: PathBuf,
    pub key: PathBuf,
    pub pending_database: PathBuf,
    pub pending_key: PathBuf,
}

impl DatabasePaths {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            database: directory.join(DATABASE_FILE),
            key: directory.join(KEY_FILE),
            pending_database: directory.join("karta.db.pending"),
            pending_key: directory.join("karta.key.pending"),
            directory,
        }
    }
}

pub struct UnlockedDatabase {
    pub connection: Connection,
    pub key: Zeroizing<Vec<u8>>,
}

pub struct AppState {
    pub paths: DatabasePaths,
    pub database: Mutex<Option<UnlockedDatabase>>,
}

impl AppState {
    pub fn new(directory: PathBuf) -> CommandResult<Self> {
        fs::create_dir_all(&directory).map_err(|_| CommandError::storage())?;
        let paths = DatabasePaths::new(directory);
        recover_pending_initialization(&paths)?;
        Ok(Self {
            paths,
            database: Mutex::new(None),
        })
    }

    pub fn is_unlocked(&self) -> bool {
        self.database.lock().is_ok_and(|guard| guard.is_some())
    }

    pub fn with_connection<T>(
        &self,
        action: impl FnOnce(&Connection) -> CommandResult<T>,
    ) -> CommandResult<T> {
        let guard = self.database.lock().map_err(|_| CommandError::storage())?;
        let unlocked = guard.as_ref().ok_or_else(CommandError::locked)?;
        action(&unlocked.connection)
    }

    pub fn unlock(&self, key: Vec<u8>) -> CommandResult<()> {
        if key.len() != 32 {
            return Err(CommandError::storage());
        }
        let connection = open_encrypted_database(&self.paths.database, &key, true)?;
        let mut guard = self.database.lock().map_err(|_| CommandError::storage())?;
        *guard = Some(UnlockedDatabase {
            connection,
            key: Zeroizing::new(key),
        });
        Ok(())
    }

    pub fn lock(&self) -> CommandResult<()> {
        let mut guard = self.database.lock().map_err(|_| CommandError::storage())?;
        *guard = None;
        Ok(())
    }

    pub fn current_key(&self) -> CommandResult<Zeroizing<Vec<u8>>> {
        let guard = self.database.lock().map_err(|_| CommandError::storage())?;
        let unlocked = guard.as_ref().ok_or_else(CommandError::locked)?;
        Ok(Zeroizing::new(unlocked.key.to_vec()))
    }

    pub fn checkpoint_and_copy(&self) -> CommandResult<(Zeroizing<Vec<u8>>, Vec<u8>)> {
        let guard = self.database.lock().map_err(|_| CommandError::storage())?;
        let unlocked = guard.as_ref().ok_or_else(CommandError::locked)?;
        unlocked
            .connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|_| CommandError::storage())?;
        let bytes = fs::read(&self.paths.database).map_err(|_| CommandError::storage())?;
        Ok((Zeroizing::new(unlocked.key.to_vec()), bytes))
    }
}

pub fn storage_shape(paths: &DatabasePaths) -> StorageShape {
    match (paths.database.exists(), paths.key.exists()) {
        (false, false) => StorageShape::Empty,
        (true, true) => StorageShape::Complete,
        _ => StorageShape::Inconsistent,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StorageShape {
    Empty,
    Complete,
    Inconsistent,
}

pub fn initialize_files(
    paths: &DatabasePaths,
    key: &[u8],
    protected_key: &[u8],
) -> CommandResult<()> {
    if storage_shape(paths) != StorageShape::Empty {
        return Err(CommandError::new(
            "storage_exists",
            "Zabezpečené úložiště už existuje.",
        ));
    }
    remove_if_exists(&paths.pending_database)?;
    remove_if_exists(&paths.pending_key)?;
    remove_sqlite_sidecars(&paths.pending_database)?;

    write_new_file(&paths.pending_key, protected_key).map_err(|_| {
        CommandError::new(
            "initialization_write_failed",
            "Zabezpečené úložiště nelze připravit.",
        )
    })?;
    let connection = open_encrypted_database(&paths.pending_database, key, true).map_err(|_| {
        CommandError::new(
            "initialization_database_failed",
            "Šifrovanou databázi nelze vytvořit.",
        )
    })?;
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|_| CommandError::storage())?;
    drop(connection);
    remove_sqlite_sidecars(&paths.pending_database).map_err(|_| {
        CommandError::new(
            "initialization_cleanup_failed",
            "Dočasnou databázi nelze dokončit.",
        )
    })?;
    sync_file(&paths.pending_database).map_err(|_| {
        CommandError::new(
            "initialization_sync_failed",
            "Dočasnou databázi nelze uložit.",
        )
    })?;

    // Key first is deliberate: startup recovery can finish the database rename.
    fs::rename(&paths.pending_key, &paths.key).map_err(|_| {
        CommandError::new(
            "initialization_key_commit_failed",
            "Klíč databáze nelze dokončit.",
        )
    })?;
    fs::rename(&paths.pending_database, &paths.database).map_err(|_| {
        CommandError::new("initialization_commit_failed", "Databázi nelze dokončit.")
    })?;
    Ok(())
}

pub fn install_imported_files(
    state: &AppState,
    database_bytes: &[u8],
    key: &[u8],
    protected_key: &[u8],
) -> CommandResult<()> {
    let previous_key = if state.is_unlocked() {
        Some(state.current_key()?)
    } else {
        None
    };
    remove_if_exists(&state.paths.pending_database)?;
    remove_if_exists(&state.paths.pending_key)?;
    remove_sqlite_sidecars(&state.paths.pending_database)?;
    write_new_file(&state.paths.pending_database, database_bytes)?;
    write_new_file(&state.paths.pending_key, protected_key)?;

    let test = open_encrypted_database(&state.paths.pending_database, key, false)?;
    test.query_row("SELECT COUNT(*) FROM schema_migrations", [], |_| Ok(()))
        .map_err(|_| CommandError::new("invalid_backup", "Záloha není platná databáze KARTA."))?;
    drop(test);
    remove_sqlite_sidecars(&state.paths.pending_database)?;

    // The live connection remains available until the imported database has
    // been completely written and verified.
    state.lock()?;
    remove_sqlite_sidecars(&state.paths.database)?;

    let old_database = state.paths.directory.join("karta.db.replacing");
    let old_key = state.paths.directory.join("karta.key.replacing");
    remove_if_exists(&old_database)?;
    remove_if_exists(&old_key)?;

    let had_database = state.paths.database.exists();
    let had_key = state.paths.key.exists();
    if had_database {
        fs::rename(&state.paths.database, &old_database).map_err(|_| CommandError::storage())?;
    }
    if had_key {
        fs::rename(&state.paths.key, &old_key).map_err(|_| CommandError::storage())?;
    }

    let install_result = (|| {
        fs::rename(&state.paths.pending_key, &state.paths.key)
            .map_err(|_| CommandError::storage())?;
        fs::rename(&state.paths.pending_database, &state.paths.database)
            .map_err(|_| CommandError::storage())?;
        state.unlock(key.to_vec())
    })();

    if install_result.is_err() {
        let _ = remove_if_exists(&state.paths.database);
        let _ = remove_if_exists(&state.paths.key);
        if had_database {
            let _ = fs::rename(&old_database, &state.paths.database);
        }
        if had_key {
            let _ = fs::rename(&old_key, &state.paths.key);
        }
        if let Some(previous_key) = previous_key {
            let _ = state.unlock(previous_key.to_vec());
        }
        return install_result;
    }

    remove_if_exists(&old_database)?;
    remove_if_exists(&old_key)?;
    Ok(())
}

pub fn open_encrypted_database(
    path: &Path,
    key: &[u8],
    migrate: bool,
) -> CommandResult<Connection> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )
    .map_err(|_| CommandError::storage())?;
    let encoded_key = hex::encode(key);
    connection
        .execute_batch(&format!("PRAGMA key = \"x'{encoded_key}'\";"))
        .map_err(|_| CommandError::storage())?;

    let cipher_version: String = connection
        .query_row("PRAGMA cipher_version", [], |row| row.get(0))
        .map_err(|_| CommandError::new("sqlcipher_unavailable", "SQLCipher není dostupný."))?;
    if cipher_version.trim().is_empty() {
        return Err(CommandError::new(
            "sqlcipher_unavailable",
            "SQLCipher není dostupný.",
        ));
    }

    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| CommandError::storage())?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys=ON;
             PRAGMA temp_store=MEMORY;
             PRAGMA journal_mode=WAL;
             PRAGMA synchronous=FULL;",
        )
        .map_err(|_| CommandError::storage())?;
    connection
        .query_row("SELECT COUNT(*) FROM sqlite_master", [], |_| Ok(()))
        .map_err(|_| CommandError::new("invalid_database_key", "Databázi nelze odemknout."))?;
    if migrate {
        migrate_database(&connection)?;
    }
    Ok(connection)
}

fn migrate_database(connection: &Connection) -> CommandResult<()> {
    let template_existed: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='templates')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);
    let template_has_default = connection
        .prepare("PRAGMA table_info(templates)")
        .and_then(|mut statement| {
            let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
            Ok(columns
                .filter_map(Result::ok)
                .any(|name| name == "is_default"))
        })
        .unwrap_or(false);
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| CommandError::storage())?;
    transaction
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                fields_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1))
             );
             CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                source_template_id TEXT,
                fields_json TEXT NOT NULL,
                archived_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_clients_archived_updated
               ON clients(archived_at, updated_at DESC);
             CREATE TABLE IF NOT EXISTS client_visits (
                id TEXT PRIMARY KEY NOT NULL,
                client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                visit_date TEXT NOT NULL,
                notes TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_client_visits_client_date
               ON client_visits(client_id, visit_date DESC, created_at DESC);
             INSERT OR IGNORE INTO schema_migrations(version, applied_at)
               VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
        )
        .map_err(|_| CommandError::storage())?;
    if template_existed && !template_has_default {
        transaction
            .execute("ALTER TABLE templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1))", [])
            .map_err(|_| CommandError::storage())?;
    }
    let template_count: i64 = transaction
        .query_row("SELECT COUNT(*) FROM templates", [], |row| row.get(0))
        .map_err(|_| CommandError::storage())?;
    if template_count == 0 {
        let fields = serde_json::to_string(&vec![
            crate::models::CardField {
                id: "1b75d861-6067-48db-8277-a5bd5bf292af".into(),
                label: "E-mail".into(),
                field_type: crate::models::FieldType::Email,
                required: false,
                options: vec![],
                is_custom: false,
                value: None,
            },
            crate::models::CardField {
                id: "a68e76ba-165f-45a1-a0a2-0df995de2a40".into(),
                label: "Telefon".into(),
                field_type: crate::models::FieldType::Phone,
                required: false,
                options: vec![],
                is_custom: false,
                value: None,
            },
            crate::models::CardField {
                id: "4086883a-c5a8-43cd-b43c-a14519f38ba4".into(),
                label: "Bydliště".into(),
                field_type: crate::models::FieldType::Text,
                required: false,
                options: vec![],
                is_custom: false,
                value: None,
            },
        ])
        .map_err(|_| CommandError::storage())?;
        transaction.execute(
            "INSERT INTO templates(id, name, description, fields_json, created_at, updated_at, is_default)
             VALUES (?1, 'Základní karta', 'Základní kontaktní údaje klienta.', ?2,
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1)",
            rusqlite::params!["f95c7638-b1c1-47a6-a684-003465a797e0", fields],
        ).map_err(|_| CommandError::storage())?;
    } else {
        let default_count: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM templates WHERE is_default=1",
                [],
                |row| row.get(0),
            )
            .map_err(|_| CommandError::storage())?;
        if default_count == 0 {
            transaction.execute("UPDATE templates SET is_default=1 WHERE id=(SELECT id FROM templates ORDER BY created_at, id LIMIT 1)", []).map_err(|_| CommandError::storage())?;
        }
    }
    transaction.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_single_default ON templates(is_default) WHERE is_default=1;
         INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));"
    ).map_err(|_| CommandError::storage())?;
    transaction.commit().map_err(|_| CommandError::storage())
}

fn recover_pending_initialization(paths: &DatabasePaths) -> CommandResult<()> {
    if paths.key.exists() && !paths.database.exists() && paths.pending_database.exists() {
        fs::rename(&paths.pending_database, &paths.database)
            .map_err(|_| CommandError::storage())?;
    }
    if paths.database.exists() && !paths.key.exists() && paths.pending_key.exists() {
        fs::rename(&paths.pending_key, &paths.key).map_err(|_| CommandError::storage())?;
    }
    if storage_shape(paths) == StorageShape::Complete {
        remove_if_exists(&paths.pending_database)?;
        remove_if_exists(&paths.pending_key)?;
        remove_sqlite_sidecars(&paths.pending_database)?;
    }
    Ok(())
}

fn write_new_file(path: &Path, bytes: &[u8]) -> CommandResult<()> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| CommandError::storage())?;
    file.write_all(bytes).map_err(|_| CommandError::storage())?;
    file.sync_all().map_err(|_| CommandError::storage())
}

fn sync_file(path: &Path) -> CommandResult<()> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .and_then(|file| file.sync_all())
        .map_err(|_| CommandError::storage())
}

fn remove_if_exists(path: &Path) -> CommandResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(CommandError::storage()),
    }
}

fn remove_sqlite_sidecars(database: &Path) -> CommandResult<()> {
    for suffix in ["-wal", "-shm"] {
        let mut sidecar = database.as_os_str().to_os_string();
        sidecar.push(suffix);
        remove_if_exists(Path::new(&sidecar))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use tempfile::tempdir;

    use super::*;

    static DATABASE_TEST_LOCK: Mutex<()> = Mutex::new(());

    fn with_large_stack(test: impl FnOnce() + Send + 'static) {
        std::thread::Builder::new()
            .name("sqlcipher-test".to_owned())
            .stack_size(CRYPTO_THREAD_STACK_SIZE)
            .spawn(test)
            .unwrap()
            .join()
            .unwrap();
    }

    #[test]
    fn encrypted_database_has_no_plain_sqlite_header() {
        with_large_stack(|| {
            let _guard = DATABASE_TEST_LOCK.lock().unwrap();
            let directory = tempdir().unwrap();
            let paths = DatabasePaths::new(directory.path().to_path_buf());
            let key = [7_u8; 32];
            std::fs::write(directory.path().join("karta.db.pending-wal"), b"stale").unwrap();
            std::fs::write(directory.path().join("karta.db.pending-shm"), b"stale").unwrap();
            initialize_files(&paths, &key, b"protected-key").unwrap();
            assert_eq!(storage_shape(&paths), StorageShape::Complete);
            assert!(!directory.path().join("karta.db.pending-wal").exists());
            assert!(!directory.path().join("karta.db.pending-shm").exists());

            let connection = open_encrypted_database(&paths.database, &key, false).unwrap();
            let default_template: (String, i64, usize) = connection
                .query_row(
                    "SELECT name, is_default, fields_json FROM templates WHERE is_default=1",
                    [],
                    |row| {
                        let fields_json: String = row.get(2)?;
                        let fields: Vec<crate::models::CardField> =
                            serde_json::from_str(&fields_json).unwrap();
                        Ok((row.get(0)?, row.get(1)?, fields.len()))
                    },
                )
                .unwrap();
            assert_eq!(default_template, ("Základní karta".to_owned(), 1, 3));
            let client_id = uuid::Uuid::new_v4().to_string();
            connection
                .execute(
                    "INSERT INTO clients(id, title, fields_json, created_at, updated_at)
                     VALUES (?1, ?2, '[]', 'now', 'now')",
                    (&client_id, "NEVER_PLAINTEXT_TEST_VALUE"),
                )
                .unwrap();
            connection
                .execute(
                    "UPDATE clients SET title='Upravená karta', archived_at='now' WHERE id=?1",
                    [&client_id],
                )
                .unwrap();
            let (title, archived): (String, Option<String>) = connection
                .query_row(
                    "SELECT title, archived_at FROM clients WHERE id=?1",
                    [&client_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!(title, "Upravená karta");
            assert_eq!(archived.as_deref(), Some("now"));
            connection
                .execute(
                    "UPDATE clients SET title='NEVER_PLAINTEXT_TEST_VALUE', archived_at=NULL WHERE id=?1",
                    [&client_id],
                )
                .unwrap();
            connection
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                .unwrap();
            drop(connection);
            let bytes = std::fs::read(paths.database).unwrap();
            assert!(!bytes.starts_with(b"SQLite format 3"));
            assert!(!bytes
                .windows(b"NEVER_PLAINTEXT_TEST_VALUE".len())
                .any(|window| window == b"NEVER_PLAINTEXT_TEST_VALUE"));
        });
    }

    #[test]
    fn missing_key_is_inconsistent() {
        let directory = tempdir().unwrap();
        let paths = DatabasePaths::new(directory.path().to_path_buf());
        std::fs::write(&paths.database, b"database").unwrap();
        assert_eq!(storage_shape(&paths), StorageShape::Inconsistent);
    }

    #[test]
    fn invalid_import_keeps_existing_database_unlocked() {
        with_large_stack(|| {
            let _guard = DATABASE_TEST_LOCK.lock().unwrap();
            let directory = tempdir().unwrap();
            let state = AppState::new(directory.path().to_path_buf()).unwrap();
            let key = [11_u8; 32];
            initialize_files(&state.paths, &key, b"protected-key").unwrap();
            state.unlock(key.to_vec()).unwrap();

            let result = install_imported_files(&state, b"not a database", &key, b"replacement");
            assert!(result.is_err());
            assert!(state.is_unlocked());
            state
                .with_connection(|connection| {
                    connection
                        .query_row("SELECT COUNT(*) FROM templates", [], |_| Ok(()))
                        .map_err(|_| CommandError::storage())
                })
                .unwrap();
        });
    }
}
