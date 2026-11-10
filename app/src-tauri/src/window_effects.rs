//! Theme effects are confined to the widget window on Windows.
use tauri::{utils::config::WindowEffectsConfig, window::Effect};
use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};

fn manifest(theme: &str) -> Option<&'static str> {
    match theme {
        "liquid-glass" => Some(include_str!("../../src/themes/liquid-glass/theme.json")),
        "layer" => Some(include_str!("../../src/themes/layer/theme.json")),
        _ => None,
    }
}
fn requested(theme: &str) -> bool {
    manifest(theme).and_then(|text| serde_json::from_str::<serde_json::Value>(text).ok())
        .is_some_and(|value| value["windowEffect"] == "acrylic")
}
fn effect(build: Option<u32>) -> Effect {
    if build.is_some_and(|build| build >= 22000) { Effect::Acrylic } else { Effect::Blur }
}
fn windows_build() -> Option<u32> {
    let key: Vec<u16> = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\0".encode_utf16().collect();
    let name: Vec<u16> = "CurrentBuildNumber\0".encode_utf16().collect();
    let mut buffer = [0u16; 32];
    let mut bytes = std::mem::size_of_val(&buffer) as u32;
    let status = unsafe { RegGetValueW(HKEY_LOCAL_MACHINE, key.as_ptr(), name.as_ptr(), RRF_RT_REG_SZ,
        std::ptr::null_mut(), buffer.as_mut_ptr().cast(), &mut bytes) };
    if status != 0 { return None; }
    String::from_utf16_lossy(&buffer).trim_end_matches('\0').parse().ok()
}
pub fn apply(window: &tauri::WebviewWindow, theme: &str) -> Result<(), String> {
    let config = requested(theme).then(|| WindowEffectsConfig {
        effects: vec![effect(windows_build())], ..Default::default()
    });
    window.set_effects(config).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manifests_opt_in_and_other_themes_clear() {
        assert!(requested("liquid-glass"));
        assert!(requested("layer"));
        assert!(!requested("system"));
        assert!(!requested("../liquid-glass"));
    }
    #[test]
    fn windows_10_and_unknown_build_use_blur() {
        assert!(matches!(effect(Some(22000)), Effect::Acrylic));
        assert!(matches!(effect(Some(19045)), Effect::Blur));
        assert!(matches!(effect(None), Effect::Blur));
    }
}
