use crate::error::CommandResult;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::WindowsKeyStore as SystemKeyStore;

#[cfg(not(windows))]
mod unsupported;
#[cfg(not(windows))]
pub use unsupported::UnsupportedKeyStore as SystemKeyStore;

pub trait PlatformKeyStore: Send + Sync {
    fn unprotect_legacy_key(&self, protected: &[u8]) -> CommandResult<Vec<u8>>;
}
