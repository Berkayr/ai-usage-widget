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
mod migration;
mod placement;
mod widgets;
#[cfg(target_os="linux")]
mod work_area;
mod settings_window;
mod user_palettes;
mod shape_region;
#[cfg(any(target_os = "windows", target_os = "linux"))]
mod window_effects;
#[cfg(target_os = "linux")]
mod linux_blur;
use std::io::Write;
use std::{fs, path::PathBuf, thread, time::Duration};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct Settings {
    #[serde(default, skip_serializing_if="Vec::is_empty", deserialize_with="widgets::deserialize")]
    widgets: Vec<widgets::Widget>,
    #[serde(default, flatten)] history: HistorySettings,
    #[serde(default, rename="userPalettes", deserialize_with="user_palettes::deserialize")]
    user_palettes: Vec<user_palettes::UserPalette>,
    #[serde(skip_deserializing, rename="paletteLoadError", skip_serializing_if="Option::is_none")]
    palette_load_error: Option<String>,
    #[serde(rename="sizeMode")] size_mode: String,
    #[serde(rename="fitFraction")] fit_fraction: f64,
    #[serde(rename="fitFineTune")] fit_fine_tune: f64,
    #[serde(rename="reservedTop")] reserved_top: Option<u32>,
    #[serde(rename="reservedBottom")] reserved_bottom: Option<u32>,
    #[serde(rename="providerOrder")] provider_order: Vec<String>,
    #[serde(rename="hiddenProviders")] hidden_providers: Vec<String>,
    #[serde(rename="featuredProvider")] featured_provider: Option<String>,
    #[serde(rename="featuredPosition")] featured_position: Option<String>,
    #[serde(rename="reactorMotion")] reactor_motion: bool, #[serde(rename="quoteEnabled")] quote_enabled: bool, #[serde(rename="quoteMode")] quote_mode: String, #[serde(default="default_quote_position", rename="quotePosition")] quote_position: String, #[serde(rename="quoteNavigation")] quote_navigation: bool, #[serde(default, rename="providerColors")] provider_colors: std::collections::BTreeMap<String,String>, #[serde(default, rename="widgetProviders")] widget_providers: Option<Vec<String>>, #[serde(default, rename="providerPreview")] provider_preview: Option<Vec<String>>, #[serde(default, rename="placementEditing")] placement_editing: bool, theme: String, #[serde(default)] shape: Shape, #[serde(rename="colorMode")] color_mode: String, #[serde(rename="dotCount")] dot_count: u8, #[serde(default, rename="matchPhysicalSize")] match_physical_size: bool, #[serde(rename="accentEdge")] accent_edge: String, #[serde(default="default_fit_height", rename="lockPosition")] lock_position: bool, #[serde(default)] placement: placement::Placement, #[cfg(target_os = "linux")] #[serde(default)] linux: linux::Options, #[cfg(not(target_os = "linux"))] #[serde(default="default_linux_options")] linux: serde_json::Value, #[serde(default="default_auto")] appearance: String, palette: String, accent: Option<String>, background: Option<String>, #[serde(rename="widgetOpacity")] widget_opacity: u8, #[serde(rename="backgroundOpacity")] background_opacity: u8, #[serde(default="default_fit_height")] #[serde(rename="fitHeight")] fit_height: bool, #[serde(default="default_scale", deserialize_with="deserialize_scale")] scale: f64, #[serde(default, rename="sizePreset")] size_preset: Option<String>, #[serde(default, rename="fineTune")] fine_tune: Option<f64>, #[serde(default="default_position")] position: String, #[serde(default, rename="showExtraWindows")] show_extra_windows: bool, #[serde(default)] taskbar: TaskbarSettings }
#[derive(Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all="lowercase")]
pub(crate) enum Shape { #[default] Portrait, Landscape, Square, Circle, Pill }
#[cfg(not(target_os = "linux"))]
fn default_linux_options() -> serde_json::Value { serde_json::json!({"layer":"bottom","margin":12,"monitor":null}) }
fn default_auto() -> String { "auto".into() }
fn default_fit_height() -> bool { true } fn default_scale() -> f64 { 100.0 } fn default_position() -> String { "Top right".into() }
fn default_quote_position() -> String { "bottom".into() }
fn normalize_scale(scale: f64) -> f64 {
    if scale.is_finite() { scale.clamp(10.0, 300.0) } else { default_scale() }
}
fn deserialize_scale<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<f64, D::Error> {
    // JSON encodes non-finite JavaScript numbers as null.
    Ok(normalize_scale(Option::<f64>::deserialize(deserializer)?.unwrap_or_else(default_scale)))
}

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all="camelCase")]
struct HistorySettings { history_enabled: bool, history_mode: String, history_cost: bool, history_models: bool, history_heatmap: bool, history_machines: bool, history_panel_open: bool }
impl Default for HistorySettings { fn default() -> Self { Self { history_enabled:true, history_mode:"card".into(), history_cost:true, history_models:true, history_heatmap:true, history_machines:false, history_panel_open:false } } }
impl Default for Settings { fn default() -> Self { Self { widgets: vec![], history: HistorySettings::default(), user_palettes: vec![], palette_load_error: None, size_mode: "fixed".into(), fit_fraction: 1., fit_fine_tune: 100., reserved_top: None, reserved_bottom: None, provider_order: vec![], hidden_providers: vec![], featured_provider: None, featured_position: None, reactor_motion: false, quote_enabled: false, quote_mode: "qotd".into(), quote_position: default_quote_position(), quote_navigation: true, provider_colors: Default::default(), widget_providers: None, provider_preview: None, placement_editing: false, theme: "system".into(), shape: Shape::default(), color_mode: "calm".into(), dot_count: 20, match_physical_size: false, accent_edge: "off".into(), lock_position: true, placement: Default::default(), #[cfg(target_os = "linux")] linux: linux::Options::default(), #[cfg(not(target_os = "linux"))] linux: default_linux_options(), appearance: default_auto(), palette: "signal-orange".into(), accent: None, background: None, widget_opacity: 100, background_opacity: 100, fit_height: true, scale: 100.0, size_preset: None, fine_tune: None, position: "Top right".into(), show_extra_windows: false, taskbar: TaskbarSettings::default() } } }
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
fn settings_path() -> PathBuf {
    // Windows known folders ignore HOME/APPDATA overrides; isolate debug CI explicitly.
    #[cfg(debug_assertions)]
    if let Some(root) = std::env::var_os("AI_USAGE_TEST_CONFIG_HOME") {
        return PathBuf::from(root).join("ai-usage/settings.json");
    }
    dirs::config_dir().unwrap_or_else(|| dirs::home_dir().unwrap()).join("ai-usage").join("settings.json")
}
fn window_state_filename(label: &str) -> Result<String, String> {
    let id = widgets::id_from_label(label)?;
    Ok(if id == widgets::MAIN_ID { "window.json".into() } else { format!("window-{id}.json") })
}
fn window_path(label: &str) -> Result<PathBuf, String> {
    Ok(settings_path().parent().unwrap().join(window_state_filename(label)?))
}
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

fn quote_if_enabled(settings: Settings, collect: impl FnOnce(&str, &[String]) -> Result<Value, String>) -> Result<Value, String> {
    if !settings.quote_enabled { return Ok(json!({"status":"disabled","cards":[]})); }
    let mode = settings.quote_mode;
    if !["qotd","born","died","on-this-day","mixed"].contains(&mode.as_str()) { return Err("Unknown quote mode".into()); }
    collect("quote", &["--json".into(),"--mode".into(),mode])
}
#[tauri::command]
async fn get_quote(window: tauri::WebviewWindow) -> Result<Value, String> {
    let settings = settings_window::current_for(window.label());
    tauri::async_runtime::spawn_blocking(move || quote_if_enabled(settings, collector)).await.map_err(|_| "Quote worker unavailable".to_string())?
}
fn refresh() -> Result<(), String> { collector("write", &[]).map(|_| ()) }
#[tauri::command]
fn get_provider_config() -> Result<Value, String> { collector("provider-config", &[]) }
#[tauri::command]
fn configure_providers(app: tauri::AppHandle, providers: Vec<String>) -> Result<(), String> {
    const IDS: &[&str] = &["claude", "codex", "gemini", "copilot", "openrouter", "deepseek", "jetbrains", "zai", "moonshot", "siliconflow", "openai_admin", "anthropic_admin"];
    if providers.iter().any(|id| !IDS.contains(&id.as_str())) { return Err("Unknown provider".into()); }
    collector("configure", &providers)?;
    let _=app.emit("provider-config-changed", ());
    Ok(())
}
#[tauri::command]
fn set_local_history(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    collector("local-history", &[if enabled {"on".into()} else {"off".into()}])?;
    let _=app.emit("provider-config-changed", ());
    Ok(())
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
fn snapshot_rendered(window: tauri::WebviewWindow, generated_at: String) {
    if std::env::var_os("AI_USAGE_SNAPSHOT_TRACE").is_some() {
        eprintln!("snapshot-rendered {} [{}]", generated_at.chars().filter(|c| !c.is_control()).take(64).collect::<String>(), window.label());
    }
}
#[tauri::command]
fn get_snapshot() -> Value { json!({"snapshot": read_snapshot()}) }
#[tauri::command]
fn refresh_now(app: tauri::AppHandle) -> Result<(), String> { refresh()?; emit_snapshot(&app); Ok(()) }
fn initial_settings() -> Settings {
    Settings { featured_provider: Some("first".into()), ..Settings::default() }
}
fn load_settings() -> Settings { fs::read(settings_path()).ok().map(|data| parse_settings(&data)).unwrap_or_else(initial_settings) }

// Recover persisted fields independently; IPC deserialization remains strict.
fn parse_settings(data: &[u8]) -> Settings {
    if let Ok(settings) = serde_json::from_slice::<Settings>(data) { return settings; }
    fn overlay(current: &mut Value, path: &mut Vec<String>, incoming: &Value) {
        if let Value::Object(fields) = incoming {
            for (key, value) in fields {
                let key = match (path.as_slice(), key.as_str()) {
                    ([parent], "xRatio") if parent == "placement" => "x_ratio",
                    ([parent], "yRatio") if parent == "placement" => "y_ratio",
                    _ => key,
                };
                path.push(key.to_owned());
                overlay(current, path, value);
                path.pop();
            }
            return;
        }
        let mut candidate = current.clone();
        let mut slot = &mut candidate;
        for key in path.iter() {
            let Some(next) = slot.as_object_mut().and_then(|object| object.get_mut(key)) else { return; };
            slot = next;
        }
        *slot = incoming.clone();
        if serde_json::from_value::<Settings>(candidate.clone()).is_ok() { *current = candidate; }
    }
    let mut value = serde_json::to_value(Settings::default()).expect("Settings serialize");
    if let Ok(Value::Object(fields)) = serde_json::from_slice::<Value>(data) {
        overlay(&mut value, &mut Vec::new(), &Value::Object(fields));
    }
    let mut settings: Settings = serde_json::from_value(value).unwrap_or_default();
    if let Ok(Value::Object(fields)) = serde_json::from_slice::<Value>(data) {
        if let Some(widgets) = fields.get("widgets") {
            match serde_json::from_value::<Settings>(json!({"widgets": widgets})) {
                Ok(valid) => settings.widgets = valid.widgets,
                Err(_) => eprintln!("Settings: skipped invalid widgets list"),
            }
        }
        if let Some(palettes) = fields.get("userPalettes") {
            let check = serde_json::from_value::<Settings>(json!({"userPalettes":palettes}));
            match check {
                Ok(valid) => settings.user_palettes = valid.user_palettes,
                Err(error) => settings.palette_load_error = Some(format!("User palettes rejected: {error}")),
            }
        }
    }
    settings
}
fn save_settings(app: tauri::AppHandle, mut settings: Settings) -> Result<(), String> {
    user_palettes::validate(&settings.user_palettes)?;
    settings.taskbar.color_mode=settings.color_mode.clone();
    settings.taskbar.dot_count=settings.dot_count;
    private_write(settings_path(), serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?)?;
    settings_window::set_preview(&app, settings)?;
    widgets::sync(app);
    Ok(())
}

fn current_monitor(window: &tauri::WebviewWindow) -> Result<tauri::Monitor, String> {
    #[cfg(target_os = "linux")]
    if linux::wayland() { let options=settings_window::current_for(window.label()).linux; let monitors=window.available_monitors().map_err(|e|e.to_string())?; return options.monitor.as_ref().and_then(|selection| monitors.iter().enumerate().find(|(i,m)| selection.matches(*i as i32, m.name().map(String::as_str).unwrap_or(""))).map(|(_,m)|m.clone())).or_else(||window.primary_monitor().ok().flatten()).or_else(||monitors.into_iter().next()).ok_or_else(||"No monitor available".into()); }
    if let Some(monitor)=window.current_monitor().map_err(|e|e.to_string())? { return Ok(monitor); }
    let position = window.outer_position().map_err(|e| e.to_string())?;
    window.available_monitors().map_err(|e| e.to_string())?.into_iter().min_by_key(|monitor| { let area=monitor.work_area(); let cx=position.x+window.outer_size().map(|s|s.width as i32/2).unwrap_or(0); let cy=position.y+window.outer_size().map(|s|s.height as i32/2).unwrap_or(0); let x=(cx-(area.position.x+area.size.width as i32/2)).abs(); let y=(cy-(area.position.y+area.size.height as i32/2)).abs(); x.saturating_add(y) }).ok_or_else(||"No monitor available".into())
}
#[tauri::command]
fn get_monitor_scale(window: tauri::WebviewWindow) -> Result<f64, String> { window.scale_factor().map_err(|e|e.to_string()) }
// Only ever shrinks: re-sending the current height would overwrite a pending fit_window_height.
fn height_cap(current: u32, max_css_px: Option<f64>, factor: f64) -> Option<u32> {
    max_css_px.filter(|h|h.is_finite()).map(|h|(h.max(1.0)*factor).round() as u32).filter(|&h|current>h)
}
// X11 applies a resize later, so inner_size can still report the previous one.
// Last requested (width, height); a zero height means the user owns it.
static REQUESTED_SIZE: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, (u32,u32)>>> = std::sync::LazyLock::new(std::sync::Mutex::default);
#[tauri::command]
fn resize_widget(window: tauri::WebviewWindow, scale: f64, width_css_px: Option<f64>, max_height_css_px: Option<f64>, onboarding: Option<bool>, corner_radius_css_px: Option<f64>) -> Result<(), String> {
    shape_region::set_onboarding(&window, onboarding.unwrap_or(false));
    let scale = normalize_scale(scale) / 100.0;
    // Even with content fitting off, a retained manual height must respect
    // the same fitted box used by the frontend and settings map.
    let factor = window.scale_factor().map_err(|e|e.to_string())?;
    #[cfg(target_os = "linux")]
    linux_blur::set_corner_radius(&window, corner_radius_css_px, factor);
    #[cfg(not(target_os = "linux"))]
    let _ = corner_radius_css_px;
    let old = window.inner_size().map_err(|e|e.to_string())?;
    let requested_height = REQUESTED_SIZE.lock().map_err(|e|e.to_string())?.entry(window.label().into()).or_default().1;
    let current_height = if requested_height > 0 { requested_height } else { old.height };
    let cap = height_cap(current_height, max_height_css_px, factor);
    #[cfg(target_os = "linux")]
    if linux::layered(window.label()) { return linux::resize_layer(&window, Some((width_css_px.unwrap_or(340.0 * scale).clamp(1.0, 10000.0)).round() as i32), cap.map(|h| h as f64 / factor)); }
    let height = cap.unwrap_or(current_height);
    let width=(width_css_px.unwrap_or(340.0*scale).clamp(1.0,10000.0)*factor).round() as u32;
    REQUESTED_SIZE.lock().map_err(|e|e.to_string())?.insert(window.label().into(), (width, if requested_height > 0 || cap.is_some() { height } else { 0 }));
    let settings=settings_window::current_for(window.label()); placement::resize(&window, &settings, width, height)?;
    Ok(())
}
#[tauri::command]
fn fit_window_height(window: tauri::WebviewWindow, height_css_px: f64) -> Result<(), String> {
    let settings = settings_window::current_for(window.label());
    if !settings.fit_height && settings.size_mode != "screen" && settings.shape == Shape::Portrait {
        REQUESTED_SIZE.lock().map_err(|e|e.to_string())?.entry(window.label().into()).or_default().1 = 0;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    if linux::layered(window.label()) { return linux::resize_layer(&window, None, Some(height_css_px)); }
    let factor=window.scale_factor().map_err(|e|e.to_string())?;
    // Shared placement caps the configured work area, including manual overrides.
    let height=(height_css_px.max(1.0)*factor).round() as u32;
    let old_size=window.inner_size().map_err(|e|e.to_string())?;
    let mut sizes=REQUESTED_SIZE.lock().map_err(|e|e.to_string())?;
    let requested=sizes.entry(window.label().into()).or_default();
    let current=if requested.1 > 0 { requested.1 } else { old_size.height };
    if (current as i64 - height as i64).abs() <= 1 { return Ok(()); }
    let width=if requested.0 > 0 { requested.0 } else { old_size.width };
    *requested=(width,height);
    drop(sizes);
    placement::resize(&window, &settings_window::current_for(window.label()), width, height)
}
#[tauri::command]
fn snap_window(window: tauri::WebviewWindow, corner: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if linux::layered(window.label()) { if corner=="Free" { return Err("Free positioning requires an X11 window; choose a corner on Wayland".into()); } let options=settings_window::current_for(window.label()).linux; let target=window.clone(); return window.run_on_main_thread(move ||linux::apply(&target,&options,&corner)).map_err(|e|e.to_string()); }
    if corner=="Free" { return Ok(()); }
    let monitor=current_monitor(&window)?; let area=monitor.work_area(); let size=window.outer_size().map_err(|e|e.to_string())?;
    let left=corner.ends_with("left"); let top=corner.starts_with("Top");
    #[cfg(target_os="linux")] let margin=(settings_window::current_for(window.label()).linux.margin.clamp(0,64) as f64 * monitor.scale_factor()).round() as i32;
    #[cfg(not(target_os="linux"))] let margin=0;

    let x=if left {area.position.x+margin} else {area.position.x+area.size.width as i32-size.width as i32-margin};
    let y=if top {area.position.y+margin} else {area.position.y+area.size.height as i32-size.height as i32-margin};
    window.set_position(tauri::PhysicalPosition::new(x,y)).map_err(|e|e.to_string())
}
#[tauri::command]
fn save_window_state(window: tauri::WebviewWindow) -> Result<(), String> {
    if settings_window::is_previewing() { return Ok(()); }
    // Layer geometry belongs to the compositor and settings, not window.json.
    #[cfg(target_os = "linux")]
    if linux::layered(window.label()) { return Ok(()); }
    let position = window.outer_position().map_err(|e| e.to_string())?; let size = window.outer_size().map_err(|e| e.to_string())?;
    let path = window_path(window.label())?; fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    private_write(path, serde_json::to_vec(&json!({"x":position.x,"y":position.y,"width":size.width,"height":size.height})).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
fn restore_window(window: &tauri::WebviewWindow) {
    if let Ok(value) = window_path(window.label()).map_err(std::io::Error::other).and_then(fs::read).and_then(|data| serde_json::from_slice::<Value>(&data).map_err(std::io::Error::other)) {
        if let (true,Some(x),Some(y))=(window.label()==widgets::MAIN_ID,value["x"].as_i64(),value["y"].as_i64()) { let _=window.set_position(tauri::PhysicalPosition::new(x as i32,y as i32)); }
        if let (Some(w),Some(h))=(value["width"].as_u64(),value["height"].as_u64()) { let _=window.set_size(tauri::PhysicalSize::new(w as u32,h as u32)); }
    } else if let Some(monitor)= (window.label()==widgets::MAIN_ID).then(|| window.primary_monitor().ok().flatten()).flatten() {
        let size=monitor.size(); let position=monitor.position(); let width=340_u32.min(size.width);
        let _=window.set_size(tauri::PhysicalSize::new(width,size.height));
        let _=window.set_position(tauri::PhysicalPosition::new(position.x+size.width as i32-width as i32,position.y));
    }
}
fn initialize_widget(window: &tauri::WebviewWindow) -> Result<(), String> {
    let main = window.label() == widgets::MAIN_ID;
    let settings = settings_window::current_for(window.label());
    shape_region::reset(window.label());
    REQUESTED_SIZE.lock().unwrap_or_else(|e|e.into_inner()).remove(window.label());
    #[cfg(not(target_os="linux"))] restore_window(window);
    #[cfg(target_os="linux")] {
        let mut options = settings.linux.clone();
        if !main { options.monitor = settings.placement.monitor.clone().map(linux::MonitorSelection::Name); }
        linux::initialize(window, &options, &settings.position);
        if !linux::layered(window.label()) { restore_window(window); }
        if main {
            if !linux::wayland() { let _ = snap_window(window.clone(), settings.position.clone()); }
        }
    }
    #[cfg(not(target_os="linux"))] if main { window.show().map_err(|e| e.to_string())?; }
    #[cfg(windows)] window_effects::apply(window, &settings.theme)?;
    if !main { placement::apply(window, &settings)?; }
    shape_region::request(window);
    let target = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }) {
            shape_region::request(&target);
        }
        if matches!(event, tauri::WindowEvent::ScaleFactorChanged { .. } | tauri::WindowEvent::Moved(_)) {
            if let Ok(factor) = target.scale_factor() { let _ = target.emit_to(target.label(), "monitor-scale", factor); }
        }
        if matches!(event, tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)) {
            let _ = save_window_state(target.clone());
        }
        #[cfg(target_os="linux")]
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            if !main && linux::layered(target.label()) {
                api.prevent_close();
                linux::mark_layer_closed(target.label());
                let _ = target.hide();
                placement::monitor_changed(target.app_handle().clone());
            }
        }
    });
    Ok(())
}

fn start_background(app: tauri::AppHandle) {
    let path = snapshot_path();
    if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let watcher = path.parent().and_then(|parent| {
        #[cfg(debug_assertions)]
        if std::env::var_os("AI_USAGE_SOAK_NO_WATCHER").is_some() { eprintln!("snapshot-watcher-disabled"); return None; }
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
fn get_linux_hint(window: tauri::WebviewWindow) -> Option<&'static str> { #[cfg(target_os="linux")] { return linux::placement_hint(window.label()); } #[cfg(not(target_os="linux"))] { None } }
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
async fn get_desktop_info(window: tauri::WebviewWindow, widget_id: Option<String>) -> Result<Value,String> {
    let window=widgets::command_window(window, widget_id.as_deref())?;
    #[cfg(target_os="linux")] {
        let (sender, receiver) = std::sync::mpsc::channel();
        let label=window.label().to_owned();
        window.run_on_main_thread(move || { let _ = sender.send(linux::desktop_info(&label)); }).map_err(|e|e.to_string())?;
        receiver.recv().map_err(|e|e.to_string())
    }
    #[cfg(not(target_os="linux"))] { let _=window; Ok(json!({"platform": std::env::consts::OS, "layerShell": false, "monitors": []})) }
}
#[tauri::command]
fn set_linux_focus(window: tauri::WebviewWindow, open: bool) { #[cfg(target_os="linux")] linux::set_linux_focus(window,open); }
pub fn run() {
    tauri::Builder::default().invoke_handler(tauri::generate_handler![snapshot_rendered,get_quote,get_runtime_diagnostics,get_snapshot,refresh_now,get_provider_config,configure_providers,set_local_history,widgets::load_settings,widgets::save_settings,save_window_state,get_monitor_scale,fit_window_height,resize_widget,snap_window,set_autostart,get_autostart,get_desktop_info,set_linux_focus,get_linux_hint,settings_window::open_settings,settings_window::finish_settings,settings_window::preview_settings,placement::get_placement_monitors,placement::capture_position]).on_page_load(|webview,payload| { #[cfg(target_os="linux")] if widgets::id_from_label(webview.label()).is_ok() && payload.event()==tauri::webview::PageLoadEvent::Finished { let _=webview.eval(linux::SCRIPT); } }).setup(|app| { migration::run()?; configure_python(app); settings_window::initialize(); let window=widgets::build(app.handle(), widgets::MAIN_ID)?; initialize_widget(&window)?; widgets::sync(app.handle().clone()); placement::watch(app.handle().clone()); #[cfg(debug_assertions)] settings_window::start_soak(app.handle().clone()); #[cfg(windows)] taskbar::start(app.handle().clone()); start_background(app.handle().clone()); Ok(()) }).run(tauri::generate_context!()).expect("error while running AI Usage");
}

#[cfg(test)]
mod settings_tests {
    use super::*;
    #[test]
    fn history_settings_round_trip() {
        assert_eq!(Settings::default().history.history_mode, "card");
        assert!(!Settings::default().history.history_panel_open);
        let value = serde_json::json!({"historyEnabled":false,"historyMode":"panel",
            "historyCost":false,"historyModels":false,"historyHeatmap":false,
            "historyMachines":true,"historyPanelOpen":true});
        let settings: Settings = serde_json::from_value(value.clone()).unwrap();
        let written = serde_json::to_value(settings).unwrap();
        for (key, expected) in value.as_object().unwrap() {
            assert_eq!(&written[key], expected, "{key}");
        }
    }
    #[cfg(debug_assertions)]
    #[test]
    fn debug_config_override_is_isolated_from_known_folders() {
        let key = "AI_USAGE_TEST_CONFIG_HOME";
        let previous = std::env::var_os(key);
        let root = std::env::temp_dir().join("fictional-acceptance-config");
        std::env::set_var(key, &root);
        let actual = settings_path();
        if let Some(value) = previous { std::env::set_var(key, value); }
        else { std::env::remove_var(key); }
        assert_eq!(actual, root.join("ai-usage/settings.json"));
    }

    #[test]
    fn full_settings_json_preserves_every_key_and_value() {
        let mut fixture: serde_json::Value = serde_json::from_str(include_str!("../../../docs/tools/fixtures/full-settings.json")).unwrap();
        fixture.as_object_mut().unwrap().extend(serde_json::to_value(HistorySettings::default()).unwrap().as_object().unwrap().clone());
        let settings: Settings = serde_json::from_value(fixture.clone()).unwrap();
        let output = serde_json::to_value(settings).unwrap();
        let placement = fixture["placement"].as_object_mut().unwrap();
        let x = placement.remove("xRatio").unwrap();
        let y = placement.remove("yRatio").unwrap();
        placement.insert("x_ratio".into(), x);
        placement.insert("y_ratio".into(), y);
        assert_eq!(output, fixture);
    }
    #[test]
    fn quote_position_defaults_and_round_trips() {
        let old: Settings = serde_json::from_value(json!({"quoteEnabled":true})).unwrap();
        assert_eq!(old.quote_position,"bottom");
        let top: Settings = serde_json::from_value(json!({"quotePosition":"top"})).unwrap();
        assert_eq!(serde_json::to_value(top).unwrap()["quotePosition"],"top");
    }
    #[test]
    fn quote_disabled_never_starts_collector() {
        let result = quote_if_enabled(Settings::default(), |_, _| panic!("Disabled quote started collector/network"));
        assert_eq!(result.unwrap()["status"], "disabled");
    }
    #[test]
    fn provider_layout_migration_and_round_trip() {
        assert_eq!(initial_settings().featured_provider.as_deref(), Some("first"));
        for choice in ["first", "auto", "none", "unknown"] {
            let data = serde_json::to_vec(&json!({"featuredProvider":choice})).unwrap();
            let restored = parse_settings(&data);
            assert_eq!(restored.featured_provider.as_deref(), Some(choice));
            let saved = serde_json::to_vec(&restored).unwrap();
            assert_eq!(parse_settings(&saved).featured_provider.as_deref(), Some(choice));
        }
        let legacy = parse_settings(b"{}");
        assert!(legacy.featured_provider.is_none());
        assert!(legacy.provider_order.is_empty());
        assert!(!legacy.reactor_motion);
        let value = br#"{"providerOrder":["gemini","claude"],"hiddenProviders":["codex"],"featuredProvider":"claude","featuredPosition":"top","reactorMotion":true}"#;
        let settings = parse_settings(value);
        let restored = parse_settings(&serde_json::to_vec(&settings).unwrap());
        assert_eq!(restored.provider_order, vec!["gemini", "claude"]);
        assert_eq!(restored.hidden_providers, vec!["codex"]);
        assert_eq!(restored.featured_provider.as_deref(), Some("claude"));
        assert_eq!(restored.featured_position.as_deref(), Some("top"));
        assert!(restored.reactor_motion);
    }
    #[test]
    fn provider_colors_migrate_and_round_trip() {
        assert!(parse_settings(b"{}").provider_colors.is_empty());
        let settings = parse_settings(br##"{"providerColors":{"claude":"#b85d40","codex":"#00745c"}}"##);
        assert_eq!(settings.provider_colors.get("claude").unwrap(), "#b85d40");
        let data = serde_json::to_vec(&settings).unwrap();
        assert_eq!(parse_settings(&data).provider_colors, settings.provider_colors);
    }


    #[test]
    fn shape_schema_migrates_and_preserves_supported_values() {
        assert!(parse_settings(b"{}").shape == Shape::Portrait);
        for value in ["portrait", "landscape", "square", "circle", "pill"] {
            let input = serde_json::to_vec(&json!({"shape":value})).unwrap();
            let settings = parse_settings(&input);
            assert_eq!(serde_json::to_value(settings).unwrap()["shape"], value);
        }
        assert!(parse_settings(br#"{"shape":"unknown"}"#).shape == Shape::Portrait);
    }
    #[test]
    #[cfg(target_os = "linux")]
    fn partial_settings_preserve_explicit_monitor() {
        let settings: Settings = serde_json::from_str(
            r#"{"linux":{"monitor":"HDMI-A-1"},"scale":150}"#,
        ).unwrap();
        assert!(settings.linux.monitor.as_ref().unwrap().matches(1, "HDMI-A-1"));
        assert_eq!(settings.scale, 150.0);
        assert_eq!(settings.palette, Settings::default().palette);
        assert_eq!(settings.widget_opacity, 100);
        assert_eq!(settings.background_opacity, 100);
        assert_eq!(settings.position, "Top right");
        assert_eq!(settings.theme, "system");
        assert_eq!(settings.color_mode, "calm");
        assert_eq!(settings.dot_count, 20);
        assert!(settings.lock_position);
        let settings: Settings = serde_json::from_str(r#"{"linux":{"monitor":2},"widgetOpacity":75}"#).unwrap();
        assert!(settings.linux.monitor.as_ref().unwrap().matches(2, "DP-2"));
        assert_eq!(settings.widget_opacity, 75);
        // Invalid explicit values must still be rejected.
        assert!(serde_json::from_str::<Settings>(r#"{"widgetOpacity":"invalid"}"#).is_err());
    }
}

#[cfg(test)]
mod settings_recovery_tests {
    use super::*;
    #[test]
    fn height_cap_only_shrinks() {
        assert_eq!(height_cap(640,Some(846.0),1.0),None);
        assert_eq!(height_cap(846,Some(340.0),1.0),Some(340));
        assert_eq!(height_cap(846,Some(f64::NAN),1.0),None);
    }
    #[test]
    fn fractional_scale_round_trip_and_recovery() {
        for scale in [102.5, 61.5, 82.0] {
            let value = json!({"scale":scale});
            let settings: Settings = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(settings.scale, scale);
            let data = serde_json::to_vec(&settings).unwrap();
            assert_eq!(parse_settings(&data).scale, scale);
            let mut damaged = value;
            damaged["theme"] = json!(false);
            assert_eq!(parse_settings(&serde_json::to_vec(&damaged).unwrap()).scale, scale);
        }
        assert_eq!(serde_json::from_str::<Settings>(r#"{"scale":82}"#).unwrap().scale, 82.0);
    }

    #[test]
    fn scale_limits_and_non_finite_values() {
        for (input, expected) in [(0.0,10.0), (375.0,300.0), (f64::NAN,100.0), (f64::INFINITY,100.0), (f64::NEG_INFINITY,100.0)] {
            assert_eq!(normalize_scale(input), expected);
        }
        for (value, expected) in [(json!(0),10.0), (json!(375),300.0), (Value::Null,100.0)] {
            let settings: Settings = serde_json::from_value(json!({"scale":value})).unwrap();
            assert_eq!(settings.scale, expected);
        }
        assert!(serde_json::from_str::<Settings>(r#"{"scale":"invalid"}"#).is_err());
    }

    #[test]
    fn frontend_scale_matrix_deserializes_without_loss() {
        let rows: Vec<Value> = serde_json::from_str(include_str!("../../../docs/tools/fixtures/scale-settings.json")).unwrap();
        assert_eq!(rows.len(), 30);
        for row in rows {
            let settings: Settings = serde_json::from_value(row.clone()).unwrap();
            assert_eq!(settings.scale, row["scale"].as_f64().unwrap());
            assert_eq!(settings.fine_tune, row["fineTune"].as_f64());
            assert_eq!(settings.size_preset.as_deref(), row["sizePreset"].as_str());
            assert_eq!(parse_settings(&serde_json::to_vec(&settings).unwrap()).scale, settings.scale);
        }
    }

    #[test]
    fn legacy_complete_file_preserves_values_without_theme() {
        let mut old = serde_json::to_value(Settings::default()).unwrap();
        for key in ["theme", "colorMode", "dotCount", "accentEdge"] { old.as_object_mut().unwrap().remove(key); }
        old["scale"] = json!(150); old["position"] = json!("Free");
        old["placement"]["y_ratio"] = json!(1.0); old["widgetOpacity"] = json!(75);
        #[cfg(target_os="linux")] { old["linux"]["monitor"] = json!("HDMI-A-1"); }
        let settings = parse_settings(&serde_json::to_vec(&old).unwrap());
        assert_eq!(settings.scale,150.0); assert_eq!(settings.position,"Free");
        assert_eq!(settings.placement.y_ratio,1.0); assert_eq!(settings.widget_opacity,75);
        assert_eq!(settings.theme,"system");
        #[cfg(target_os="linux")] assert!(settings.linux.monitor.unwrap().matches(0,"HDMI-A-1"));
    }
    #[test]
    fn invalid_fields_do_not_discard_valid_siblings() {
        let settings = parse_settings(br#"{"scale":150,"theme":false,"widgetOpacity":"bad","unknown":42,"placement":{"yRatio":1.0,"x_ratio":"bad"},"linux":{"monitor":"HDMI-A-1","margin":"bad"},"taskbar":{"enabled":true,"dotCount":"bad"}}"#);
        assert_eq!(settings.scale,150.0); assert_eq!(settings.theme,"system");
        assert_eq!(settings.widget_opacity,100); assert_eq!(settings.placement.y_ratio,1.0);
        assert_eq!(settings.placement.x_ratio,1.0); assert!(settings.taskbar.enabled);
        assert_eq!(settings.taskbar.dot_count,20);
        #[cfg(target_os="linux")] { assert!(settings.linux.monitor.unwrap().matches(0,"HDMI-A-1")); assert_eq!(settings.linux.margin,12); }
        assert_eq!(parse_settings(b"broken").scale,100.0);
    }
}

#[cfg(test)]
#[path = "../../../tests/window-state-path.rs"]
mod label_tests;
