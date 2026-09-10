use std::slice;

use windows::Win32::{
    Foundation::{LocalFree, HLOCAL},
    Security::Cryptography::{CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB},
};

use crate::error::{CommandError, CommandResult};

use super::PlatformKeyStore;

#[derive(Default)]
pub struct WindowsKeyStore;

impl PlatformKeyStore for WindowsKeyStore {
    fn unprotect_legacy_key(&self, protected: &[u8]) -> CommandResult<Vec<u8>> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: u32::try_from(protected.len()).map_err(|_| CommandError::storage())?,
            pbData: protected.as_ptr().cast_mut(),
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
        .map_err(|_| {
            CommandError::new(
                "legacy_key_unavailable",
                "Starý klíč databáze nelze převést.",
            )
        })?;
        if output.pbData.is_null() || output.cbData == 0 {
            return Err(CommandError::storage());
        }
        let result =
            unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
        unsafe {
            let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        }
        Ok(result)
    }
}
