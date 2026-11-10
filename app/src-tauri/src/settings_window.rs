use super::*;
use std::sync::{Mutex, OnceLock};
static CURRENT: OnceLock<Mutex<Settings>> = OnceLock::new();
static PREVIEWS: std::sync::LazyLock<Mutex<std::collections::HashMap<String, Settings>>> = std::sync::LazyLock::new(Mutex::default);
static PREVIEWING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub fn initialize() { let _ = CURRENT.set(Mutex::new(load_settings())); }
pub fn current() -> Settings { CURRENT.get_or_init(|| Mutex::new(load_settings())).lock().unwrap_or_else(|e| e.into_inner()).clone() }
pub fn current_for(label: &str) -> Settings {
    if let Some(settings) = PREVIEWS.lock().unwrap_or_else(|e| e.into_inner()).get(label) { return settings.clone(); }
    let root = current();
    widgets::id_from_label(label).and_then(|id| widgets::effective(&root, id)).unwrap_or(root)
}
pub fn set_preview(app: &tauri::AppHandle, settings: Settings) -> Result<(), String> {
    user_palettes::validate(&settings.user_palettes)?;
    *CURRENT.get_or_init(|| Mutex::new(load_settings())).lock().unwrap_or_else(|e| e.into_inner()) = settings;
    PREVIEWS.lock().unwrap_or_else(|e| e.into_inner()).clear();
    for (label, _) in app.webview_windows() {
        if widgets::id_from_label(&label).and_then(|id| widgets::effective(&current(), id)).is_ok() { apply_preview(app, current_for(&label), &label)?; }
    }
    Ok(())
}
pub fn is_previewing() -> bool { PREVIEWING.load(std::sync::atomic::Ordering::Relaxed) }
fn apply_preview(app: &tauri::AppHandle, mut settings: Settings, label: &str) -> Result<(), String> {
    user_palettes::validate(&settings.user_palettes)?;
    settings.taskbar.color_mode=settings.color_mode.clone();
    settings.taskbar.dot_count=settings.dot_count;
    if label == widgets::MAIN_ID {
        *CURRENT.get_or_init(|| Mutex::new(load_settings())).lock().unwrap_or_else(|e| e.into_inner()) = settings.clone();
    }
    PREVIEWS.lock().unwrap_or_else(|e| e.into_inner()).insert(label.into(), settings.clone());
    if let Some(window) = app.get_webview_window(label) {
        #[cfg(target_os = "windows")]
        window_effects::apply(&window, &settings.theme)?;
        shape_region::request(&window);
        let target = window.clone(); let value = settings.clone();
        window.run_on_main_thread(move || { let _ = placement::apply(&target, &value); }).map_err(|e|e.to_string())?;
        window.emit_to(label, "settings-preview", &settings).map_err(|e| e.to_string())?;
    }
    #[cfg(windows)] if label == widgets::MAIN_ID { taskbar::update_settings(settings.taskbar); }
    Ok(())
}
#[tauri::command]
pub fn preview_settings(app: tauri::AppHandle, settings: Settings, widget_id: Option<String>) -> Result<(), String> {
    let label = widgets::label(widget_id.as_deref())?;
    let root = current();
    let id = widgets::id_from_label(&label)?;
    widgets::effective(&root, id)?;
    let settings = if id == widgets::MAIN_ID { settings } else {
        widgets::effective(&widgets::split(&root, id, &settings)?, id)?
    };
    apply_preview(&app, settings, &label)
}
// Hide only after the frontend has resolved Save / Discard / Cancel.
#[tauri::command]
pub fn finish_settings(app: tauri::AppHandle) -> Result<(), String> {
    set_preview(&app, load_settings())?;
    if let Some(window) = app.get_webview_window("settings") {
        window.hide().map_err(|e| e.to_string())?;
    }
    PREVIEWING.store(false, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[cfg(debug_assertions)]
fn test_position() -> Option<(f64, f64)> {
    let value = std::env::var("AI_USAGE_SETTINGS_TEST_POSITION").ok()?;
    let (x, y) = value.split_once(',')?;
    let (x, y) = (x.trim().parse::<f64>().ok()?, y.trim().parse::<f64>().ok()?);
    (x.is_finite() && y.is_finite()).then_some((x, y))
}

#[tauri::command(async)]
pub fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        if !window.is_visible().map_err(|e| e.to_string())? {
            PREVIEWING.store(true, std::sync::atomic::Ordering::Relaxed);
            window.emit("settings-reopened", ()).map_err(|e| e.to_string())?;
        }
        window.unminimize().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        #[cfg(debug_assertions)] eprintln!("settings-soak-reused");
        return window.set_focus().map_err(|e| e.to_string());
    }
    // Lazy creation: the widget alone never pays for a second webview.
    let builder = tauri::WebviewWindowBuilder::new(&app, "settings", tauri::WebviewUrl::App("index.html?settings".into()))
        .title("AI Usage · Settings").inner_size(900., 680.).min_inner_size(400., 480.)
        .decorations(true).resizable(true).skip_taskbar(false).center();
    #[cfg(debug_assertions)]
    let builder = if let Some((x, y)) = test_position() { builder.position(x, y) } else { builder };
    let window = builder.build().map_err(|e| e.to_string())?;
    PREVIEWING.store(true, std::sync::atomic::Ordering::Relaxed);
    #[cfg(debug_assertions)] eprintln!("settings-soak-created");
    let handle = app.clone();
    window.on_window_event(move |event| match event {
        // Also protect the lazy webview while its JS close listener initializes.
        tauri::WindowEvent::CloseRequested { api, .. } => api.prevent_close(),
        tauri::WindowEvent::Destroyed => {
            PREVIEWING.store(false, std::sync::atomic::Ordering::Relaxed);
            let _ = set_preview(&handle, load_settings());
        }
        _ => {}
    });
    Ok(())
}

// Opt-in debug instrumentation for the isolated native memory regression only.
// No command listener, file watcher or timer is created in normal operation.
#[cfg(debug_assertions)]
pub fn start_soak(app: tauri::AppHandle) {
    let cycles=std::env::var("AI_USAGE_SETTINGS_SOAK_CYCLES").ok().and_then(|s|s.parse::<u32>().ok()).unwrap_or(0).min(4);
    if cycles==0 {return;}
    thread::spawn(move || {
        // Warm up the second webview before the 30-second memory baseline.
        thread::sleep(Duration::from_secs(15));
        let warm=app.clone();let _=app.run_on_main_thread(move || {let _=open_settings(warm);});
        thread::sleep(Duration::from_secs(4));
        let warm=app.clone();let _=app.run_on_main_thread(move || {if warm.get_webview_window("settings").is_some() {let _=finish_settings(warm.clone());}});
        thread::sleep(Duration::from_secs(16));
        for cycle in 0..cycles {
            let open=app.clone();let _=app.run_on_main_thread(move || {
                if open_settings(open.clone()).is_ok() {eprintln!("settings-soak-open {}",cycle);}
                // Real monitor callbacks use this same bounded debounce path.
                for _ in 0..20 {placement::monitor_changed(open.clone());}
            });
            thread::sleep(Duration::from_secs(4));
            let close=app.clone();let _=app.run_on_main_thread(move || {if finish_settings(close).is_ok() {eprintln!("settings-soak-close {}",cycle);}});
            thread::sleep(Duration::from_secs(16));
        }
    });
}
