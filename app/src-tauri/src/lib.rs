#[cfg(target_os = "linux")]
mod linux;
#[cfg(windows)]
mod taskbar;
#[cfg(windows)]
mod autostart;
use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
mod snapshot_watch;
mod collector;
mod runtime;
use std::io::Write;
use std::{fs, path::PathBuf, thread, time::Duration};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
struct Settings { #[cfg(target_os = "linux")] #[serde(default)] linux: linux::Options, #[serde(default="default_auto")] appearance: String, palette: String, accent: Option<String>, background: Option<String>, #[serde(rename="widgetOpacity")] widget_opacity: u8, #[serde(rename="backgroundOpacity")] background_opacity: u8, #[serde(default="default_fit_height")] #[serde(rename="fitHeight")] fit_height: bool, #[serde(default="default_scale")] scale: u16, #[serde(default="default_position")] position: String, #[serde(default, rename="showExtraWindows")] show_extra_windows: bool, #[serde(default)] taskbar: TaskbarSettings }
fn default_auto() -> String { "auto".into() }
fn default_fit_height() -> bool { true } fn default_scale() -> u16 { 100 } fn default_position() -> String { "Top right".into() }
impl Default for Settings { fn default() -> Self { Self { #[cfg(target_os = "linux")] linux: linux::Options::default(), appearance: default_auto(), palette: "signal-orange".into(), accent: None, background: None, widget_opacity: 100, background_opacity: 100, fit_height: true, scale: 100, position: "Top right".into(), show_extra_windows: false, taskbar: TaskbarSettings::default() } } }
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all="camelCase")]
struct TaskbarSettings { enabled: bool, providers: Vec<String>, window: String, show_bars: bool, offset_x: i32, style: String, theme: String, color_mode: String, dot_count: u8 }
impl Default for TaskbarSettings {
    fn default() -> Self { Self { enabled: false, providers: vec!["claude".into(), "codex".into(), "gemini".into()], window: "session".into(), show_bars: false, offset_x: 0, style: "transparent".into(), theme: default_auto(), color_mode: "calm".into(), dot_count: 20 } }
}
#[derive(Clone, Serialize)]
struct SnapshotEvent { snapshot: Option<Value> }

fn snapshot_path() -> PathBuf {
    if let Some(home) = std::env::var_os("QUOTACORE_HOME") { return PathBuf::from(home).join("snapshot.json"); }
    #[cfg(target_os = "windows")] { return std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| dirs::data_local_dir().unwrap_or_else(|| dirs::home_dir().unwrap())).join("quotacore").join("snapshot.json"); }
    #[cfg(not(target_os = "windows"))] { std::env::var_os("XDG_STATE_HOME").map(PathBuf::from).unwrap_or_else(|| dirs::home_dir().unwrap().join(".local").join("state")).join("quotacore").join("snapshot.json") }
}
fn settings_path() -> PathBuf { dirs::config_dir().unwrap_or_else(|| dirs::home_dir().unwrap()).join("ai-quota-widget").join("settings.json") }
fn window_path() -> PathBuf { settings_path().parent().unwrap().join("window.json") }
fn read_snapshot() -> Option<Value> { fs::read(snapshot_path()).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()) }
const COLLECTOR_TIMEOUT: u64 = 120;
fn collector(operation: &str, extra: &[String]) -> Result<Value, String> {
    let root = runtime::resources()?;
    let runtime = runtime::select(root)?;
    let bytes = collector::run(runtime.collector(root, operation, extra), Duration::from_secs(COLLECTOR_TIMEOUT))?;
    if bytes.is_empty() { Ok(Value::Null) } else { serde_json::from_slice(&bytes).map_err(|_| "Collector returned invalid JSON".into()) }
}
#[tauri::command]
fn get_runtime_diagnostics() -> Result<Value, String> { collector("doctor", &[]) }

fn refresh() -> Result<(), String> { collector("write", &[]).map(|_| ()) }
#[tauri::command]
fn get_provider_config() -> Result<Value, String> { collector("provider-config", &[]) }
#[tauri::command]
fn configure_providers(providers: Vec<String>) -> Result<(), String> {
    const IDS: &[&str] = &["claude", "codex", "gemini", "copilot", "openrouter", "deepseek", "jetbrains"];
    if providers.iter().any(|id| !IDS.contains(&id.as_str())) { return Err("Unknown provider".into()); }
    collector("configure", &providers).map(|_| ())
}
fn private_write(path: PathBuf, bytes: Vec<u8>) -> Result<(), String> {
    use std::fs::OpenOptions;
    fs::create_dir_all(path.parent().ok_or("Invalid data path")?).map_err(|e| e.to_string())?;
    let mut options = OpenOptions::new();
    options.write(true).create(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file = options.open(&path).map_err(|e| e.to_string())?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; file.set_permissions(fs::Permissions::from_mode(0o600)).map_err(|e|e.to_string())?; }
    file.set_len(0).map_err(|e|e.to_string())?;
    file.write_all(&bytes).map_err(|e|e.to_string())
}
fn configure_python(app: &tauri::App) {
    if let Ok(root) = app.path().resource_dir() {
        if root.join("quotacore/__main__.py").is_file() { runtime::configure(root); return; }
    }
    // Source development only; release builds never use a compile-machine path.
    #[cfg(debug_assertions)]
    runtime::configure(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."));
}

fn emit_snapshot(app: &tauri::AppHandle) {
    static LAST: std::sync::Mutex<Option<snapshot_watch::Fingerprint>> = std::sync::Mutex::new(None);
    let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
    let snapshot = read_snapshot();
    if !last.get_or_insert_with(Default::default).changed(&snapshot) { return; }
    #[cfg(windows)] taskbar::update_snapshot(snapshot.clone());
    if std::env::var_os("AI_USAGE_SNAPSHOT_TRACE").is_some() {
        eprintln!("snapshot-emit {}", snapshot.as_ref().and_then(|s|s["generated_at"].as_str()).unwrap_or("none"));
    }
    let _ = app.emit("snapshot", SnapshotEvent { snapshot });
}
#[tauri::command]
fn snapshot_rendered(generated_at: String) {
    if std::env::var_os("AI_USAGE_SNAPSHOT_TRACE").is_some() {
        eprintln!("snapshot-rendered {}", generated_at.chars().filter(|c| !c.is_control()).take(64).collect::<String>());
    }
}
#[tauri::command]
fn get_snapshot() -> Value { json!({"snapshot": read_snapshot()}) }
#[tauri::command]
fn refresh_now(app: tauri::AppHandle) -> Result<(), String> { refresh()?; emit_snapshot(&app); Ok(()) }
#[tauri::command]
fn load_settings() -> Settings { fs::read(settings_path()).ok().and_then(|data| serde_json::from_slice(&data).ok()).unwrap_or_default() }
#[tauri::command]
fn save_settings(window: tauri::WebviewWindow, settings: Settings) -> Result<(), String> { #[cfg(target_os = "linux")] { let options=settings.linux.clone(); let corner=settings.position.clone(); let target=window.clone(); let _=window.run_on_main_thread(move ||linux::apply(&target,&options,&corner)); } let path = settings_path(); fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?; private_write(path, serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?; #[cfg(windows)] taskbar::update_settings(settings.taskbar); Ok(()) }
fn current_monitor(window: &tauri::WebviewWindow) -> Result<tauri::Monitor, String> {
    #[cfg(target_os = "linux")]
    if linux::wayland() { let options=load_settings().linux; let monitors=window.available_monitors().map_err(|e|e.to_string())?; return options.monitor.as_ref().and_then(|selection| monitors.iter().enumerate().find(|(i,m)| selection.matches(*i as i32, m.name().map(String::as_str).unwrap_or(""))).map(|(_,m)|m.clone())).or_else(||window.primary_monitor().ok().flatten()).or_else(||monitors.into_iter().next()).ok_or_else(||"No monitor available".into()); }
    if let Some(monitor)=window.current_monitor().map_err(|e|e.to_string())? { return Ok(monitor); }
    let position = window.outer_position().map_err(|e| e.to_string())?;
    window.available_monitors().map_err(|e| e.to_string())?.into_iter().min_by_key(|monitor| { let area=monitor.work_area(); let cx=position.x+window.outer_size().map(|s|s.width as i32/2).unwrap_or(0); let cy=position.y+window.outer_size().map(|s|s.height as i32/2).unwrap_or(0); let x=(cx-(area.position.x+area.size.width as i32/2)).abs(); let y=(cy-(area.position.y+area.size.height as i32/2)).abs(); x.saturating_add(y) }).ok_or_else(||"No monitor available".into())
}
#[tauri::command]
fn get_monitor_scale(window: tauri::WebviewWindow) -> Result<f64, String> { window.scale_factor().map_err(|e|e.to_string()) }
#[tauri::command]
fn resize_widget(window: tauri::WebviewWindow, scale: u16) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if linux::layered() { return linux::resize_layer(&window, Some((340.0 * scale.clamp(10,300) as f64 / 100.0).round() as i32), None); }
    let scale=scale.clamp(10,300) as f64/100.0; let factor=window.scale_factor().map_err(|e|e.to_string())?;
    let old=window.inner_size().map_err(|e|e.to_string())?; let width=(340.0*scale*factor).round() as u32;
    window.set_size(tauri::PhysicalSize::new(width,old.height)).map_err(|e|e.to_string())?;
    let settings=load_settings(); if settings.position!="Free" { snap_window(window,settings.position)?; }
    Ok(())
}
#[tauri::command]
fn fit_window_height(window: tauri::WebviewWindow, height_css_px: f64) -> Result<(), String> {
    if !load_settings().fit_height { return Ok(()); }
    #[cfg(target_os = "linux")]
    if linux::layered() { return linux::resize_layer(&window, None, Some(height_css_px)); }
    let factor=window.scale_factor().map_err(|e|e.to_string())?; let monitor=current_monitor(&window)?; let area=monitor.work_area();
    let height=((height_css_px.max(80.0)*factor).round() as u32).min(area.size.height);
    let old_position=window.outer_position().unwrap_or(tauri::PhysicalPosition::new(0,0)); let old_size=window.inner_size().map_err(|e|e.to_string())?;
    if (old_size.height as i64 - height as i64).abs() <= 1 { return Ok(()); }
    window.set_size(tauri::PhysicalSize::new(old_size.width,height)).map_err(|e|e.to_string())?;
    let settings=load_settings(); if settings.position!="Free" { snap_window(window,settings.position) } else { let area=monitor.work_area(); let new_y=if old_position.y+old_size.height as i32/2 > area.position.y+area.size.height as i32/2 { area.position.y+area.size.height as i32-height as i32 } else { old_position.y }; window.set_position(tauri::PhysicalPosition::new(old_position.x,new_y)).map_err(|e|e.to_string()) }
}
#[tauri::command]
fn snap_window(window: tauri::WebviewWindow, corner: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if linux::layered() { if corner=="Free" { return Err("Free positioning requires an X11 window; choose a corner on Wayland".into()); } let options=load_settings().linux; let target=window.clone(); return window.run_on_main_thread(move ||linux::apply(&target,&options,&corner)).map_err(|e|e.to_string()); }
    if corner=="Free" { return Ok(()); }
    let monitor=current_monitor(&window)?; let area=monitor.work_area(); let size=window.outer_size().map_err(|e|e.to_string())?;
    let left=corner.ends_with("left"); let top=corner.starts_with("Top");
    #[cfg(target_os="linux")] let margin=(load_settings().linux.margin.clamp(0,64) as f64 * monitor.scale_factor()).round() as i32;
    #[cfg(not(target_os="linux"))] let margin=0;

    let x=if left {area.position.x+margin} else {area.position.x+area.size.width as i32-size.width as i32-margin};
    let y=if top {area.position.y+margin} else {area.position.y+area.size.height as i32-size.height as i32-margin};
    window.set_position(tauri::PhysicalPosition::new(x,y)).map_err(|e|e.to_string())
}
#[tauri::command]
fn save_window_state(app: tauri::AppHandle) -> Result<(), String> {
    // Layer geometry belongs to the compositor and settings, not window.json.
    #[cfg(target_os = "linux")]
    if linux::layered() { return Ok(()); }
    let window = app.get_webview_window("main").ok_or("Main window unavailable")?;
    let position = window.outer_position().map_err(|e| e.to_string())?; let size = window.outer_size().map_err(|e| e.to_string())?;
    let path = window_path(); fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    private_write(path, serde_json::to_vec(&json!({"x":position.x,"y":position.y,"width":size.width,"height":size.height})).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
fn restore_window(window: &tauri::WebviewWindow) {
    if let Ok(value) = fs::read(window_path()).and_then(|data| serde_json::from_slice::<Value>(&data).map_err(std::io::Error::other)) {
        if let (Some(x),Some(y))=(value["x"].as_i64(),value["y"].as_i64()) { let _=window.set_position(tauri::PhysicalPosition::new(x as i32,y as i32)); }
        if let (Some(w),Some(h))=(value["width"].as_u64(),value["height"].as_u64()) { let _=window.set_size(tauri::PhysicalSize::new(w as u32,h as u32)); }
    } else if let Some(monitor)=window.primary_monitor().ok().flatten() {
        let size=monitor.size(); let position=monitor.position(); let width=340_u32.min(size.width);
        let _=window.set_size(tauri::PhysicalSize::new(width,size.height));
        let _=window.set_position(tauri::PhysicalPosition::new(position.x+size.width as i32-width as i32,position.y));
    }
}
fn start_background(app: tauri::AppHandle) {
    let path = snapshot_path();
    if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let watcher = path.parent().and_then(|parent| {
        let target = path.clone();
        let mut watcher = notify::recommended_watcher(move |event: Result<notify::Event,notify::Error>| {
            if event.as_ref().map(|e| snapshot_watch::relevant(e, &target)).unwrap_or(false) {
                let _ = sender.try_send(());
            }
        }).ok()?;
        watcher.watch(parent, RecursiveMode::NonRecursive).ok()?;
        Some(watcher)
    });
    let reader = app.clone();
    thread::spawn(move || {
        let _watcher = watcher;
        emit_snapshot(&reader);
        loop {
            match receiver.recv_timeout(Duration::from_secs(300)) {
                Ok(()) => {
                    // Fixed coalescing window bounds latency even under continuous writes.
                    thread::sleep(Duration::from_millis(400));
                    while receiver.try_recv().is_ok() {}
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => thread::sleep(Duration::from_secs(300)),
                Err(_) => (),
            }
            emit_snapshot(&reader);
        }
    });
    thread::spawn(move || loop {
        if let Err(error) = refresh() { let _ = app.emit("refresh-error", error); }
        emit_snapshot(&app);
        thread::sleep(Duration::from_secs(300));
    });
}
#[tauri::command]
fn get_linux_hint() -> Option<&'static str> { #[cfg(target_os="linux")] { return linux::placement_hint(); } #[cfg(not(target_os="linux"))] { None } }
#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(),String> {
    #[cfg(target_os="linux")] { linux::set_autostart(enabled) }
    #[cfg(windows)] { autostart::set(enabled) }
    #[cfg(not(any(target_os="linux", windows)))] { let _=enabled; Err("Start at login is unavailable on this platform".into()) }
}
#[tauri::command]
fn get_autostart() -> Result<bool,String> {
    #[cfg(target_os="linux")] { linux::get_autostart() }
    #[cfg(windows)] { autostart::get() }
    #[cfg(not(any(target_os="linux", windows)))] { Err("Start at login is unavailable on this platform".into()) }
}
#[tauri::command]
async fn get_desktop_info(window: tauri::WebviewWindow) -> Result<Value,String> {
    #[cfg(target_os="linux")] {
        let (sender, receiver) = std::sync::mpsc::channel();
        window.run_on_main_thread(move || { let _ = sender.send(linux::desktop_info()); }).map_err(|e|e.to_string())?;
        receiver.recv().map_err(|e|e.to_string())
    }
    #[cfg(not(target_os="linux"))] { let _=window; Ok(json!({"platform": std::env::consts::OS, "layerShell": false, "monitors": []})) }
}
#[tauri::command]
fn set_linux_focus(window: tauri::WebviewWindow, open: bool) { #[cfg(target_os="linux")] linux::set_linux_focus(window,open); }
pub fn run() {
    tauri::Builder::default().invoke_handler(tauri::generate_handler![snapshot_rendered,get_runtime_diagnostics,get_snapshot,refresh_now,get_provider_config,configure_providers,load_settings,save_settings,save_window_state,get_monitor_scale,fit_window_height,resize_widget,snap_window,set_autostart,get_autostart,get_desktop_info,set_linux_focus,get_linux_hint]).on_page_load(|webview,payload| { #[cfg(target_os="linux")] if payload.event()==tauri::webview::PageLoadEvent::Finished { let _=webview.eval(linux::SCRIPT); } }).setup(|app| { configure_python(app); if let Some(window)=app.get_webview_window("main") { #[cfg(not(target_os="linux"))] restore_window(&window); #[cfg(target_os="linux")] { let settings=load_settings(); linux::initialize(&window,&settings.linux,&settings.position); if !linux::layered() { restore_window(&window); } if !linux::wayland() { let _=snap_window(window.clone(),settings.position); } } #[cfg(not(target_os="linux"))] { let _=window.show(); } let close_window=window.clone(); let _=window.on_window_event(move |event| { if matches!(event,tauri::WindowEvent::ScaleFactorChanged { .. } | tauri::WindowEvent::Moved(_)) { if let Ok(factor)=close_window.scale_factor() { let _=close_window.emit("monitor-scale",factor); } } if matches!(event,tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)) { let app=close_window.app_handle().clone(); let _=save_window_state(app); } }); } #[cfg(windows)] taskbar::start(app.handle().clone()); start_background(app.handle().clone()); Ok(()) }).run(tauri::generate_context!()).expect("error while running AI Quota Widget");
}

#[cfg(test)]
mod settings_tests {
    use super::*;

    #[test]
    #[cfg(target_os = "linux")]
    fn partial_settings_preserve_explicit_monitor() {
        let settings: Settings = serde_json::from_str(
            r#"{"linux":{"layer":"top","margin":16,"monitor":"HDMI-A-1"}}"#,
        ).unwrap();
        assert!(settings.linux.monitor.as_ref().unwrap().matches(1, "HDMI-A-1"));
        assert_eq!(settings.palette, Settings::default().palette);
        assert_eq!(settings.widget_opacity, 100);
        assert_eq!(settings.background_opacity, 100);
        assert_eq!(settings.position, "Top right");
        let settings: Settings = serde_json::from_str(r#"{"linux":{"monitor":2},"widgetOpacity":75}"#).unwrap();
        assert!(settings.linux.monitor.as_ref().unwrap().matches(2, "DP-2"));
        assert_eq!(settings.widget_opacity, 75);
        // Invalid explicit values must still be rejected.
        assert!(serde_json::from_str::<Settings>(r#"{"widgetOpacity":"invalid"}"#).is_err());
    }
}
