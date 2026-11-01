#[cfg(target_os = "linux")]
mod linux;
#[cfg(windows)]
mod taskbar;
#[cfg(windows)]
mod autostart;
use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, process::{Command, Stdio}, thread, time::Duration};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize, Deserialize)]
struct Settings { #[cfg(target_os = "linux")] #[serde(default)] linux: linux::Options, #[serde(default="default_auto")] appearance: String, palette: String, accent: Option<String>, background: Option<String>, #[serde(rename="widgetOpacity")] widget_opacity: u8, #[serde(rename="backgroundOpacity")] background_opacity: u8, #[serde(default="default_fit_height")] #[serde(rename="fitHeight")] fit_height: bool, #[serde(default="default_scale")] scale: u16, #[serde(default="default_position")] position: String, #[serde(default, rename="showExtraWindows")] show_extra_windows: bool, #[serde(default)] taskbar: TaskbarSettings }
fn default_auto() -> String { "auto".into() }
fn default_fit_height() -> bool { true } fn default_scale() -> u16 { 100 } fn default_position() -> String { "Top right".into() }
impl Default for Settings { fn default() -> Self { Self { #[cfg(target_os = "linux")] linux: linux::Options::default(), appearance: default_auto(), palette: "signal-orange".into(), accent: None, background: None, widget_opacity: 100, background_opacity: 94, fit_height: true, scale: 100, position: "Top right".into(), show_extra_windows: false, taskbar: TaskbarSettings::default() } } }
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all="camelCase")]
struct TaskbarSettings { enabled: bool, providers: Vec<String>, window: String, show_bars: bool, offset_x: i32, style: String, theme: String }
impl Default for TaskbarSettings {
    fn default() -> Self { Self { enabled: false, providers: vec!["claude".into(), "codex".into(), "gemini".into()], window: "session".into(), show_bars: false, offset_x: 0, style: "transparent".into(), theme: default_auto() } }
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
fn emit_snapshot(app: &tauri::AppHandle) { let snapshot = read_snapshot(); #[cfg(windows)] taskbar::update_snapshot(snapshot.clone()); let _ = app.emit("snapshot", SnapshotEvent { snapshot }); }
#[tauri::command]
fn get_snapshot() -> Value { json!({"snapshot": read_snapshot()}) }
#[tauri::command]
fn refresh_now(app: tauri::AppHandle) -> Result<(), String> { refresh()?; emit_snapshot(&app); Ok(()) }
#[tauri::command]
fn load_settings() -> Settings { fs::read(settings_path()).ok().and_then(|data| serde_json::from_slice(&data).ok()).unwrap_or_default() }
#[tauri::command]
fn save_settings(window: tauri::WebviewWindow, settings: Settings) -> Result<(), String> { #[cfg(target_os = "linux")] { let options=settings.linux.clone(); let corner=settings.position.clone(); let target=window.clone(); let _=window.run_on_main_thread(move ||linux::apply(&target,&options,&corner)); } let path = settings_path(); fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?; fs::write(path, serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?; #[cfg(windows)] taskbar::update_settings(settings.taskbar); Ok(()) }
fn current_monitor(window: &tauri::WebviewWindow) -> Result<tauri::Monitor, String> {
    #[cfg(target_os = "linux")]
    if linux::wayland() { let options=load_settings().linux; let monitors=window.available_monitors().map_err(|e|e.to_string())?; return options.monitor.and_then(|i|monitors.get(i as usize).cloned()).or_else(||window.primary_monitor().ok().flatten()).or_else(||monitors.into_iter().next()).ok_or_else(||"No monitor available".into()); }
    if let Some(monitor)=window.current_monitor().map_err(|e|e.to_string())? { return Ok(monitor); }
    let position = window.outer_position().map_err(|e| e.to_string())?;
    window.available_monitors().map_err(|e| e.to_string())?.into_iter().min_by_key(|monitor| { let area=monitor.work_area(); let cx=position.x+window.outer_size().map(|s|s.width as i32/2).unwrap_or(0); let cy=position.y+window.outer_size().map(|s|s.height as i32/2).unwrap_or(0); let x=(cx-(area.position.x+area.size.width as i32/2)).abs(); let y=(cy-(area.position.y+area.size.height as i32/2)).abs(); x.saturating_add(y) }).ok_or_else(||"No monitor available".into())
}
#[tauri::command]
fn resize_widget(window: tauri::WebviewWindow, scale: u16) -> Result<(), String> {
    let scale=scale.clamp(50,300) as f64/100.0; let factor=window.scale_factor().map_err(|e|e.to_string())?;
    let old=window.inner_size().map_err(|e|e.to_string())?; let width=(340.0*scale*factor).round() as u32;
    window.set_size(tauri::PhysicalSize::new(width,old.height)).map_err(|e|e.to_string())?;
    let settings=load_settings(); if settings.position!="Free" { snap_window(window,settings.position)?; }
    Ok(())
}
#[tauri::command]
fn fit_window_height(window: tauri::WebviewWindow, height_css_px: f64) -> Result<(), String> {
    if !load_settings().fit_height { return Ok(()); }
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
    tauri::Builder::default().invoke_handler(tauri::generate_handler![get_snapshot,refresh_now,load_settings,save_settings,save_window_state,fit_window_height,resize_widget,snap_window,set_autostart,get_autostart,get_desktop_info,set_linux_focus,get_linux_hint]).on_page_load(|webview,payload| { #[cfg(target_os="linux")] if payload.event()==tauri::webview::PageLoadEvent::Finished { let _=webview.eval(linux::SCRIPT); } }).setup(|app| { #[cfg(target_os="linux")] linux::configure_python(app); if let Some(window)=app.get_webview_window("main") { restore_window(&window); #[cfg(target_os="linux")] { let settings=load_settings(); linux::initialize(&window,&settings.linux,&settings.position); if !linux::wayland() { let _=snap_window(window.clone(),settings.position); } } #[cfg(not(target_os="linux"))] { let _=window.show(); } let close_window=window.clone(); let _=window.on_window_event(move |event| { if matches!(event,tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)) { let app=close_window.app_handle().clone(); let _=save_window_state(app); } }); } #[cfg(windows)] taskbar::start(app.handle().clone()); start_background(app.handle().clone()); Ok(()) }).run(tauri::generate_context!()).expect("error while running AI Quota Widget");
}
