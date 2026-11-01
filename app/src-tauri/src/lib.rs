use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, process::{Command, Stdio}, thread, time::Duration};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize, Deserialize)]
struct Settings { palette: String, accent: Option<String>, background: Option<String>, #[serde(rename="widgetOpacity")] widget_opacity: u8, #[serde(rename="backgroundOpacity")] background_opacity: u8 }
impl Default for Settings { fn default() -> Self { Self { palette: "signal-orange".into(), accent: None, background: None, widget_opacity: 100, background_opacity: 94 } } }
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
fn refresh() -> Result<(), String> {
    let python_path = std::env::var_os("QUOTACORE_PYTHONPATH");
    #[cfg(target_os = "windows")]
    let mut candidates = vec![vec!["-3", "-m", "quotacore", "write"], vec!["-m", "quotacore", "write"]];
    #[cfg(not(target_os = "windows"))]
    let mut candidates = vec![vec!["-m", "quotacore", "write"]];
    #[cfg(target_os = "windows")] let executables = vec!["py", "python"];
    #[cfg(not(target_os = "windows"))] let executables = vec!["python3"];
    let cwd = python_path.as_ref().map(PathBuf::from);
    let mut last_error = String::from("No Python interpreter found");
    for (index, executable) in executables.iter().enumerate() {
        let args = candidates.remove(0);
        let mut command = Command::new(executable);
        command.args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
        if let Some(ref path) = cwd { command.current_dir(path).env("PYTHONPATH", path); }
        #[cfg(target_os = "windows")] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
        match command.output() {
            Ok(output) if output.status.success() => return Ok(()),
            Ok(output) => { last_error = String::from_utf8_lossy(&output.stderr).trim().to_string(); },
            Err(error) => last_error = error.to_string(),
        }
    }
    Err(last_error)
}
fn emit_snapshot(app: &tauri::AppHandle) { let _ = app.emit("snapshot", SnapshotEvent { snapshot: read_snapshot() }); }
#[tauri::command]
fn get_snapshot() -> Value { json!({"snapshot": read_snapshot()}) }
#[tauri::command]
fn refresh_now(app: tauri::AppHandle) -> Result<(), String> { refresh()?; emit_snapshot(&app); Ok(()) }
#[tauri::command]
fn load_settings() -> Settings { fs::read(settings_path()).ok().and_then(|data| serde_json::from_slice(&data).ok()).unwrap_or_default() }
#[tauri::command]
fn save_settings(settings: Settings) -> Result<(), String> { let path = settings_path(); fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?; fs::write(path, serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string()) }
#[tauri::command]
fn save_window_state(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window unavailable")?;
    let position = window.outer_position().map_err(|e| e.to_string())?; let size = window.outer_size().map_err(|e| e.to_string())?;
    let path = window_path(); fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(path, serde_json::to_vec(&json!({"x":position.x,"y":position.y,"width":size.width,"height":size.height})).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
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
    let path=snapshot_path(); let callback_app=app.clone();
    let watcher = path.parent().and_then(|parent| {
        let mut watcher=notify::recommended_watcher(move |_event: Result<notify::Event,notify::Error>| { emit_snapshot(&callback_app); }).ok()?;
        watcher.watch(parent,RecursiveMode::NonRecursive).ok()?;
        Some(watcher)
    });
    thread::spawn(move || {
        let _watcher=watcher;
        if let Err(error)=refresh() { let _=app.emit("refresh-error",error); }
        emit_snapshot(&app);
        let mut last=read_snapshot().and_then(|s| s.get("generated_at").cloned());
        let mut refresh_elapsed=0_u64;
        loop {
            thread::sleep(Duration::from_secs(30));
            let current=read_snapshot().and_then(|s| s.get("generated_at").cloned());
            if current!=last { emit_snapshot(&app); last=current; }
            refresh_elapsed+=30;
            if refresh_elapsed>=300 { if let Err(error)=refresh() { let _=app.emit("refresh-error",error); } refresh_elapsed=0; }
        }
    });
}
pub fn run() {
    tauri::Builder::default().invoke_handler(tauri::generate_handler![get_snapshot,refresh_now,load_settings,save_settings,save_window_state]).setup(|app| { if let Some(window)=app.get_webview_window("main") { restore_window(&window); let close_window=window.clone(); let _=window.on_window_event(move |event| { if matches!(event,tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)) { let app=close_window.app_handle().clone(); let _=save_window_state(app); } }); } start_background(app.handle().clone()); Ok(()) }).run(tauri::generate_context!()).expect("error while running AI Quota Widget");
}
