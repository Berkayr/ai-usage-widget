//! Per-user Windows login registration. Only the application's own Run value is changed.
use std::{ffi::OsStr, os::windows::ffi::OsStrExt, ptr};
use windows_sys::Win32::{Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS}, System::Registry::*};

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const NAME: &str = "AI Usage";
fn wide(value: &OsStr) -> Vec<u16> { value.encode_wide().chain(Some(0)).collect() }
struct Key(HKEY);
impl Drop for Key { fn drop(&mut self) { unsafe { RegCloseKey(self.0); } } }
fn command() -> Result<Vec<u16>, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut value = vec![b'"' as u16];
    value.extend(exe.as_os_str().encode_wide());
    value.extend([b'"' as u16, 0]);
    Ok(value)
}
pub fn set(enabled: bool) -> Result<(), String> {
    let path = wide(OsStr::new(RUN));
    let name = wide(OsStr::new(NAME));
    let mut handle = ptr::null_mut();
    unsafe {
        let status = if enabled {
            RegCreateKeyExW(HKEY_CURRENT_USER, path.as_ptr(), 0, ptr::null(), 0, KEY_SET_VALUE, ptr::null(), &mut handle, ptr::null_mut())
        } else {
            RegOpenKeyExW(HKEY_CURRENT_USER, path.as_ptr(), 0, KEY_SET_VALUE, &mut handle)
        };
        if !enabled && status == ERROR_FILE_NOT_FOUND { return Ok(()); }
        if status != ERROR_SUCCESS { return Err(format!("Unable to open login registration ({status})")); }
        let key = Key(handle);
        let status = if enabled {
            let value = command()?;
            RegSetValueExW(key.0, name.as_ptr(), 0, REG_SZ, value.as_ptr().cast(), (value.len() * 2) as u32)
        } else { RegDeleteValueW(key.0, name.as_ptr()) };
        if status == ERROR_SUCCESS || (!enabled && status == ERROR_FILE_NOT_FOUND) { Ok(()) }
        else { Err(format!("Unable to update login registration ({status})")) }
    }
}
pub fn get() -> Result<bool, String> {
    let path = wide(OsStr::new(RUN));
    let name = wide(OsStr::new(NAME));
    let mut bytes = 0;
    unsafe {
        let status = RegGetValueW(HKEY_CURRENT_USER, path.as_ptr(), name.as_ptr(), RRF_RT_REG_SZ, ptr::null_mut(), ptr::null_mut(), &mut bytes);
        if status == ERROR_FILE_NOT_FOUND { return Ok(false); }
        if status != ERROR_SUCCESS { return Err(format!("Unable to read login registration ({status})")); }
        Ok(bytes > 2)
    }
}

/// Copy the enabled registration to the current executable before deleting its legacy value.
pub fn migrate() -> Result<(), String> {
    let path = wide(OsStr::new(RUN));
    let old = wide(OsStr::new(crate::migration::OLD_RUN_NAME));
    unsafe {
        let mut bytes = 0;
        let status = RegGetValueW(HKEY_CURRENT_USER, path.as_ptr(), old.as_ptr(), RRF_RT_REG_SZ, ptr::null_mut(), ptr::null_mut(), &mut bytes);
        if status == ERROR_FILE_NOT_FOUND { return Ok(()); }
        if status != ERROR_SUCCESS { return Err(format!("Unable to read old login registration ({status})")); }
        if bytes > 2 && !get()? { set(true)?; }
        let mut handle = ptr::null_mut();
        let status = RegOpenKeyExW(HKEY_CURRENT_USER, path.as_ptr(), 0, KEY_SET_VALUE, &mut handle);
        if status != ERROR_SUCCESS { return Err(format!("Unable to migrate login registration ({status})")); }
        let key = Key(handle);
        let status = RegDeleteValueW(key.0, old.as_ptr());
        if status != ERROR_SUCCESS && status != ERROR_FILE_NOT_FOUND { return Err(format!("Unable to remove old login registration ({status})")); }
    }
    Ok(())
}
