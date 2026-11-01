//! Legacy names are confined to this one-time migration module.
use std::{fs, io, path::Path};

pub fn run() -> Result<(), io::Error> {
    let root = dirs::config_dir().ok_or_else(|| io::Error::other("Config directory unavailable"))?;
    copy_settings(&root)?;
    #[cfg(target_os="linux")]
    migrate_login(&root)?;
    #[cfg(windows)]
    crate::autostart::migrate().map_err(io::Error::other)?;
    Ok(())
}
fn copy_settings(root: &Path) -> io::Result<()> {
    let dest = root.join("ai-usage");
    let marker = dest.join(".migration-v1");
    if marker.exists() { return Ok(()); }
    fs::create_dir_all(&dest)?;
    for name in ["settings.json", "window.json"] {
        let source = root.join("ai-quota-widget").join(name);
        let target = dest.join(name);
        if source.is_file() && !target.exists() {
            let mut input = fs::File::open(source)?;
            let mut options = fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
            io::copy(&mut input, &mut options.open(target)?)?;
        }
    }
    fs::write(marker, b"1")
}
#[cfg(target_os="linux")]
fn migrate_login(root: &Path) -> io::Result<()> {
    for name in ["ai-quota-widget.desktop", "dev.aiquota.widget.desktop"] {
        let old = root.join("autostart").join(name);
        if !old.is_file() { continue; }
        let text = fs::read_to_string(&old)?;
        // Only claim entries bearing our old application name and an Exec field.
        if !text.lines().any(|l| l == "Name=AI Quota Widget") || !text.lines().any(|l| l.starts_with("Exec=")) { continue; }
        let new = root.join("autostart/ai-usage.desktop");
        if !new.exists() {
            let enabled = !text.lines().any(|l| matches!(l.trim(), "Hidden=true" | "X-GNOME-Autostart-enabled=false"));
            crate::linux::write_autostart(&new, &std::env::var_os("APPIMAGE").map(std::path::PathBuf::from).unwrap_or(std::env::current_exe()?), enabled).map_err(io::Error::other)?;
        }
        fs::remove_file(old)?;
    }
    Ok(())
}
#[cfg(windows)]
pub const OLD_RUN_NAME: &str = "AI Quota Widget";

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copies_once_preserves_source_and_existing_settings() {
        let root = std::env::temp_dir().join(format!("ai-usage-migration-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("ai-quota-widget")).unwrap();
        fs::create_dir_all(root.join("ai-usage")).unwrap();
        fs::write(root.join("ai-quota-widget/settings.json"), b"old").unwrap();
        fs::write(root.join("ai-quota-widget/window.json"), b"geometry").unwrap();
        fs::write(root.join("ai-usage/settings.json"), b"new").unwrap();
        copy_settings(&root).unwrap();
        assert_eq!(fs::read(root.join("ai-usage/settings.json")).unwrap(), b"new");
        assert_eq!(fs::read(root.join("ai-usage/window.json")).unwrap(), b"geometry");
        assert_eq!(fs::read(root.join("ai-quota-widget/settings.json")).unwrap(), b"old");
        fs::remove_file(root.join("ai-usage/window.json")).unwrap();
        copy_settings(&root).unwrap();
        assert!(!root.join("ai-usage/window.json").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(target_os="linux")]
    #[test]
    fn migrates_only_our_login_entries() {
        let root = std::env::temp_dir().join(format!("ai-usage-login-migration-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("autostart")).unwrap();
        let old = root.join("autostart/ai-quota-widget.desktop");
        fs::write(&old, "[Desktop Entry]\nName=Other\nExec=other\n").unwrap();
        migrate_login(&root).unwrap(); assert!(old.exists());
        fs::write(&old, "[Desktop Entry]\nName=AI Quota Widget\nExec=old\n").unwrap();
        migrate_login(&root).unwrap(); assert!(!old.exists());
        let new = fs::read_to_string(root.join("autostart/ai-usage.desktop")).unwrap();
        assert!(new.contains("Name=AI Usage")); assert!(!new.contains("Exec=old"));
        fs::remove_dir_all(root).unwrap();
    }
}
