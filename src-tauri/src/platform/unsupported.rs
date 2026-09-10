use crate::error::{CommandError, CommandResult};

use super::PlatformKeyStore;

#[derive(Default)]
pub struct UnsupportedKeyStore;

impl PlatformKeyStore for UnsupportedKeyStore {
    fn unprotect_legacy_key(&self, _protected: &[u8]) -> CommandResult<Vec<u8>> {
        Err(CommandError::new(
            "legacy_key_unavailable",
            "Starý klíč lze převést pouze na původním počítači s Windows.",
        ))
    }
}
