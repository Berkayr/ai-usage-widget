use super::{placement::Placement, Settings};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;

pub(crate) const MAIN_ID: &str = "main";

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 24
        && id.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

pub(crate) fn label(id: Option<&str>) -> Result<String, String> {
    let id = id.unwrap_or(MAIN_ID);
    if id == MAIN_ID { return Ok(MAIN_ID.into()); }
    if !valid_id(id) { return Err("invalid widget id".into()); }
    Ok(format!("widget-{id}"))
}

pub(crate) fn id_from_label(label: &str) -> Result<&str, String> {
    if label == MAIN_ID { return Ok(MAIN_ID); }
    label.strip_prefix("widget-").filter(|id| valid_id(id) && *id != MAIN_ID)
        .ok_or_else(|| "invalid widget label".into())
}

pub(crate) fn command_window(window: tauri::WebviewWindow, id: Option<&str>) -> Result<tauri::WebviewWindow, String> {
    use tauri::Manager;
    if id.is_none() && id_from_label(window.label()).is_ok() { return Ok(window); }
    let label = label(id)?;
    window.app_handle().get_webview_window(&label).ok_or_else(|| "Widget window unavailable".into())
}

// Window construction runs off the event thread (required by WebView2).
static SYNC: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub(crate) fn on_main<T: Send + 'static>(app: &tauri::AppHandle, work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || { let _ = tx.send(work()); }).map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(15)).map_err(|e| e.to_string())?
}

fn sync_decision(existing: &[String], widgets: &[Widget]) -> (Vec<String>, Vec<String>) {
    let desired: HashSet<_> = widgets.iter().filter_map(|w| label(Some(&w.id)).ok()).collect();
    let mut create: Vec<_> = desired.iter().filter(|label| !existing.contains(label)).cloned().collect();
    let mut close: Vec<_> = existing.iter().filter(|label| label.as_str() != MAIN_ID
        && id_from_label(label).is_ok() && !desired.contains(*label)).cloned().collect();
    create.sort(); close.sort();
    (create, close)
}

pub(crate) fn build(app: &tauri::AppHandle, id: &str) -> Result<tauri::WebviewWindow, String> {
    let mut config = app.config().app.windows.iter().find(|w| w.label == MAIN_ID)
        .ok_or("Main window configuration unavailable")?.clone();
    config.label = label(Some(id))?;
    if id != MAIN_ID { config.url = tauri::WebviewUrl::App(format!("index.html?widget={id}").into()); }
    tauri::WebviewWindowBuilder::from_config(app, &config).map_err(|e| e.to_string())?
        .build().map_err(|e| e.to_string())
}

fn destroy(window: tauri::WebviewWindow) -> Result<(), String> {
    use tauri::Manager;
    let app = window.app_handle().clone();
    let (tx, rx) = std::sync::mpsc::channel();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) { let _ = tx.send(()); }
    });
    window.destroy().map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(15)).map_err(|e| e.to_string())?;
    // Let Tauri remove the old label before constructing its replacement.
    on_main(&app, || Ok(()))
}

pub(crate) fn sync(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let _guard = SYNC.lock().unwrap_or_else(|e| e.into_inner());
        if let Err(error) = sync_windows(&app) { eprintln!("Widget sync failed: {error}"); }
    });
}

fn sync_windows(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let root = super::settings_window::current();
    let existing: Vec<_> = app.webview_windows().into_keys().collect();
    let (mut create, close) = sync_decision(&existing, &root.widgets);
    for label in close {
        if let Some(window) = app.get_webview_window(&label) { destroy(window)?; }
    }
    #[cfg(target_os = "linux")]
    {
        let target = app.clone();
        let recreate = on_main(app, move || {
            let mut labels = Vec::new();
            for (label, window) in target.webview_windows() {
                if id_from_label(&label).is_err() || label == MAIN_ID { continue; }
                let settings = super::settings_window::current_for(&label);
                let available = super::placement::selected(&super::placement::configured_monitors(&window, &settings), &settings).is_some();
                if super::linux::recreate_layer(&label, available) { labels.push(label); }
            }
            Ok(labels)
        })?;
        for label in recreate {
            if let Some(window) = app.get_webview_window(&label) {
                eprintln!("Recreating closed layer surface: {label}");
                destroy(window)?;
                create.push(label);
            }
        }
    }
    for label in create {
        let window = build(app, id_from_label(&label)?)?;
        on_main(app, move || super::initialize_widget(&window))?;
    }
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Widget {
    pub id: String,
    pub name: String,
    pub placement: Placement,
    #[serde(default)]
    pub overrides: Map<String, Value>,
}

fn overridable(key: &str) -> bool {
    matches!(key, "position" | "lockPosition" | "placementEditing" | "reservedTop" | "reservedBottom"
        | "theme" | "shape" | "scale" | "sizePreset" | "fineTune"
        | "sizeMode" | "fitFraction" | "fitFineTune" | "fitHeight" | "matchPhysicalSize"
        | "appearance" | "palette" | "accent" | "background" | "widgetOpacity"
        | "backgroundOpacity" | "colorMode" | "dotCount" | "accentEdge"
        | "historyEnabled" | "historyMode" | "historyCost" | "historyModels"
        | "historyHeatmap" | "historyMachines" | "historyPanelOpen" | "showExtraWindows"
        | "widgetProviders" | "featuredProvider" | "featuredPosition"
        | "quoteEnabled" | "quoteMode" | "quotePosition" | "quoteNavigation")
}

fn checked(mut widget: Widget) -> Result<Widget, String> {
    if widget.id == MAIN_ID || !valid_id(&widget.id) {
        return Err("invalid widget id".into());
    }
    if widget.placement.monitor.as_ref().is_none_or(|name| name.trim().is_empty()) {
        return Err("widget monitor is required".into());
    }
    widget.placement.disconnected = "hide".into();
    widget.overrides.retain(|key, _| overridable(key) || key == "linux");
    if let Some(linux) = widget.overrides.get_mut("linux") {
        let fields = linux.as_object_mut().ok_or("invalid widget linux overrides")?;
        fields.retain(|key, _| matches!(key.as_str(), "layer" | "margin"));
        if fields.get("layer").is_some_and(|v| !v.is_string())
            || fields.get("margin").is_some_and(|v| v.as_i64().and_then(|n| i32::try_from(n).ok()).is_none()) {
            return Err("invalid widget linux overrides".into());
        }
    }
    serde_json::from_value::<Settings>(Value::Object(widget.overrides.clone()))
        .map_err(|_| "invalid widget overrides")?;
    Ok(widget)
}

pub(crate) fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<Widget>, D::Error> {
    let values = Vec::<Value>::deserialize(deserializer)?;
    let mut ids = HashSet::new();
    Ok(values.into_iter().filter_map(|value| {
        let widget = serde_json::from_value::<Widget>(value)
            .map_err(|_| "invalid widget entry".to_string()).and_then(checked);
        match widget {
            Ok(widget) if ids.insert(widget.id.clone()) => Some(widget),
            _ => { eprintln!("Settings: skipped invalid or duplicate widget"); None }
        }
    }).collect())
}

pub(crate) fn effective(root: &Settings, id: &str) -> Result<Settings, String> {
    if id == MAIN_ID { return Ok(root.clone()); }
    let widget = checked(root.widgets.iter().find(|w| w.id == id)
        .ok_or("Unknown widget id")?.clone())?;
    let mut value = serde_json::to_value(root).map_err(|e| e.to_string())?;
    for (key, field) in widget.overrides {
        if key == "linux" {
            for (key, field) in field.as_object().expect("checked linux overrides") {
                value["linux"][key] = field.clone();
            }
        } else { value[&key] = field; }
    }
    value["placement"] = serde_json::to_value(widget.placement).map_err(|e| e.to_string())?;
    let mut settings: Settings = serde_json::from_value(value).map_err(|e| e.to_string())?;
    settings.palette_load_error = root.palette_load_error.clone();
    Ok(settings)
}

pub(crate) fn split(root: &Settings, id: &str, edited: &Settings) -> Result<Settings, String> {
    if id == MAIN_ID { return Ok(edited.clone()); }
    let before = serde_json::to_value(effective(root, id)?).map_err(|e| e.to_string())?;
    let after = serde_json::to_value(edited).map_err(|e| e.to_string())?;
    let mut value = serde_json::to_value(root).map_err(|e| e.to_string())?;
    let mut widget = root.widgets.iter().find(|w| w.id == id).expect("effective checked id").clone();
    widget.placement = edited.placement.clone();
    for (key, field) in after.as_object().expect("Settings object") {
        if matches!(key.as_str(), "widgets" | "placement" | "paletteLoadError") { continue; }
        if overridable(key) {
            if *field != before[key] {
                if *field == value[key] { widget.overrides.remove(key); }
                else { widget.overrides.insert(key.clone(), field.clone()); }
            }
        } else if key == "linux" {
            let mut overrides = widget.overrides.get("linux").and_then(Value::as_object).cloned().unwrap_or_default();
            for (part, field) in field.as_object().ok_or("Invalid linux settings")? {
                if matches!(part.as_str(), "layer" | "margin") {
                    if *field != before[key][part] {
                        if *field == value[key][part] { overrides.remove(part); }
                        else { overrides.insert(part.clone(), field.clone()); }
                    }
                } else if *field != before[key][part] { value[key][part] = field.clone(); }
            }
            if overrides.is_empty() { widget.overrides.remove(key); }
            else { widget.overrides.insert(key.clone(), Value::Object(overrides)); }
        } else if *field != before[key] { value[key] = field.clone(); }
    }
    let mut result: Settings = serde_json::from_value(value).map_err(|e| e.to_string())?;
    result.palette_load_error = root.palette_load_error.clone();
    let slot = result.widgets.iter_mut().find(|w| w.id == id).ok_or("Unknown widget id")?;
    *slot = checked(widget)?;
    Ok(result)
}

#[tauri::command]
pub(crate) fn load_settings(widget_id: Option<String>) -> Result<Settings, String> {
    effective(&super::load_settings(), widget_id.as_deref().unwrap_or(MAIN_ID))
}

#[tauri::command]
pub(crate) fn save_settings(app: tauri::AppHandle, settings: Settings, widget_id: Option<String>) -> Result<(), String> {
    let root = split(&super::load_settings(), widget_id.as_deref().unwrap_or(MAIN_ID), &settings)?;
    super::save_settings(app, root)
}

#[cfg(test)]
#[path = "../../../tests/widgets.rs"]
mod tests;
