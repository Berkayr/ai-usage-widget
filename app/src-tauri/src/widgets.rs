use super::{placement::Placement, Settings};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Widget {
    pub id: String,
    pub name: String,
    pub placement: Placement,
    #[serde(default)]
    pub overrides: Map<String, Value>,
}

fn overridable(key: &str) -> bool {
    matches!(key, "theme" | "shape" | "scale" | "sizePreset" | "fineTune"
        | "sizeMode" | "fitFraction" | "fitFineTune" | "fitHeight" | "matchPhysicalSize"
        | "appearance" | "palette" | "accent" | "background" | "widgetOpacity"
        | "backgroundOpacity" | "colorMode" | "dotCount" | "accentEdge"
        | "historyEnabled" | "historyMode" | "historyCost" | "historyModels"
        | "historyHeatmap" | "historyMachines" | "historyPanelOpen" | "showExtraWindows"
        | "widgetProviders" | "featuredProvider" | "featuredPosition"
        | "quoteEnabled" | "quoteMode" | "quotePosition" | "quoteNavigation")
}

fn checked(mut widget: Widget) -> Result<Widget, String> {
    if widget.id == "main" || widget.id.is_empty() || widget.id.len() > 24
        || !widget.id.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-') {
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
    if id == "main" { return Ok(root.clone()); }
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
    if id == "main" { return Ok(edited.clone()); }
    let before = serde_json::to_value(effective(root, id)?).map_err(|e| e.to_string())?;
    let after = serde_json::to_value(edited).map_err(|e| e.to_string())?;
    let mut value = serde_json::to_value(root).map_err(|e| e.to_string())?;
    let mut widget = root.widgets.iter().find(|w| w.id == id).expect("effective checked id").clone();
    widget.placement = edited.placement.clone();
    for (key, field) in after.as_object().expect("Settings object") {
        if matches!(key.as_str(), "widgets" | "placement" | "paletteLoadError") { continue; }
        if overridable(key) {
            if *field == value[key] { widget.overrides.remove(key); }
            else { widget.overrides.insert(key.clone(), field.clone()); }
        } else if key == "linux" {
            let mut overrides = Map::new();
            for (part, field) in field.as_object().ok_or("Invalid linux settings")? {
                if matches!(part.as_str(), "layer" | "margin") {
                    if *field != value[key][part] { overrides.insert(part.clone(), field.clone()); }
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
    effective(&super::load_settings(), widget_id.as_deref().unwrap_or("main"))
}

#[tauri::command]
pub(crate) fn save_settings(app: tauri::AppHandle, settings: Settings, widget_id: Option<String>) -> Result<(), String> {
    let root = split(&super::load_settings(), widget_id.as_deref().unwrap_or("main"), &settings)?;
    super::save_settings(app, root)
}

#[cfg(test)]
#[path = "../../../tests/widgets.rs"]
mod tests;
