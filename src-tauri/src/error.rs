use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: &'static str,
}

impl CommandError {
    pub const fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }

    pub const fn storage() -> Self {
        Self::new(
            "storage_error",
            "Zabezpečené úložiště se nepodařilo otevřít.",
        )
    }

    pub const fn locked() -> Self {
        Self::new("database_locked", "KARTA je zamčená.")
    }

    pub const fn validation() -> Self {
        Self::new("validation_error", "Zadané údaje nejsou platné.")
    }

    pub const fn not_found() -> Self {
        Self::new("not_found", "Požadovaný záznam nebyl nalezen.")
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
