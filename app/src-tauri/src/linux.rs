//! GTK3 integration. Load layer-shell at runtime so X11/GNOME need no extra library.
use gtk::{glib::translate::ToGlibPtr, prelude::*};
use libloading::Library;
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, ffi::c_void, fs, sync::atomic::{AtomicBool, Ordering}};

type Window = *mut gtk::ffi::GtkWindow;
thread_local! {
    static SHELL: RefCell<Option<Library>> = const { RefCell::new(None) };
    static LAST_PLACEMENT: RefCell<Option<(String,i32,i32,String)>> = const { RefCell::new(None) };
    static PENDING_RESIZE: RefCell<Option<(Option<i32>, Option<f64>)>> = const { RefCell::new(None) };
    static MONITOR_WARNING: RefCell<Option<String>> = const { RefCell::new(None) };
}
static SETTINGS_OPEN: AtomicBool = AtomicBool::new(false);
static LAYER: AtomicBool = AtomicBool::new(false);
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all="camelCase")]
pub struct Options { pub layer: String, pub margin: i32, pub monitor: Option<MonitorSelection> }
#[derive(Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MonitorSelection { Index(i32), Name(String) }
impl MonitorSelection {
    pub fn matches(&self, index: i32, name: &str) -> bool {
        match self { Self::Index(i) => *i == index, Self::Name(n) => n == name }
    }
}
fn monitor_name(display: &gtk::gdk::Display, index: i32, monitor: &gtk::gdk::Monitor) -> String {
    // GTK >= 3.22 implements screen monitor lookup with
    // gdk_display_get_monitor(display, index). Use that identity directly:
    // point lookup is ambiguous when mixed-scale monitor rectangles overlap.
    let screen = display.default_screen();
    let geometry = monitor.geometry();
    if let Some(name) = connector_at_index(index, |screen_index| unsafe {
        let name = gtk::gdk::ffi::gdk_screen_get_monitor_plug_name(screen.to_glib_none().0, screen_index);
        if name.is_null() { return None; }
        let text = std::ffi::CStr::from_ptr(name).to_string_lossy().into_owned();
        gtk::glib::ffi::g_free(name.cast());
        Some(text)
    }) { return name; }
    format!("{}@{},{}:{}x{}", monitor.model().map(|s|s.to_string()).unwrap_or_else(||format!("Monitor {}",index+1)), geometry.x(),geometry.y(),geometry.width(),geometry.height())
}
fn connector_at_index(index: i32, lookup: impl FnOnce(i32) -> Option<String>) -> Option<String> {
    lookup(index).filter(|name| !name.is_empty())
}
fn selection_index(selection: &MonitorSelection, available: &[(i32, String)]) -> Result<i32, String> {
    available.iter().find(|(index, name)| selection.matches(*index, name))
        .map(|(index, _)| *index).ok_or_else(|| {
            let requested = match selection { MonitorSelection::Index(i) => i.to_string(), MonitorSelection::Name(n) => n.clone() };
            let message = format!("monitor '{}' not found; available: {}", requested,
                available.iter().map(|(i, name)| format!("{} ({})", name, i)).collect::<Vec<_>>().join(", "));
            message.chars().map(|c| if c.is_control() { ' ' } else { c }).collect()
        })
}
fn selected_monitor(display: &gtk::gdk::Display, selection: &Option<MonitorSelection>) -> Option<gtk::gdk::Monitor> {
    let available = (0..display.n_monitors()).filter_map(|index| {
        display.monitor(index).map(|monitor| (index, monitor_name(display, index, &monitor)))
    }).collect::<Vec<_>>();
    let result = selection.as_ref().map(|selection| selection_index(selection, &available));
    let warning = result.as_ref().and_then(|result| result.as_ref().err()).cloned();
    MONITOR_WARNING.with(|slot| {
        let mut previous = slot.borrow_mut();
        if *previous != warning {
            if let Some(message) = &warning { eprintln!("{}", message); }
            *previous = warning;
        }
    });
    result.and_then(Result::ok).and_then(|index| display.monitor(index))
        .or_else(||display.primary_monitor()).or_else(||display.monitor(0))
}
impl Default for Options {
    fn default() -> Self { Self { layer: "bottom".into(), margin: 12, monitor: None } }
}
pub fn wayland() -> bool {
    std::env::var("GDK_BACKEND").map(|s|s == "wayland").unwrap_or_else(|_| std::env::var("XDG_SESSION_TYPE").as_deref() == Ok("wayland") || std::env::var_os("WAYLAND_DISPLAY").is_some())
}
pub fn layered() -> bool { LAYER.load(Ordering::Relaxed) }
// All symbol calls are on GTK's main thread; the library stays loaded for the window lifetime.
unsafe fn call<T: Copy>(lib: &Library, name: &[u8]) -> Option<T> { lib.get::<T>(name).ok().map(|s| *s) }
static HINT_SHOWN: AtomicBool = AtomicBool::new(false);
pub fn placement_hint() -> Option<&'static str> {
    if wayland() && !layered() && !HINT_SHOWN.swap(true,Ordering::Relaxed) {
        Some("This Wayland desktop cannot place the widget at a fixed corner. Use the panel integration, or launch with GDK_BACKEND=x11 when XWayland is available.")
    } else { None }
}

pub fn initialize(window: &tauri::WebviewWindow, options: &Options, corner: &str) {
    // Configure the existing view on GTK's main thread; no second web context.
    let _ = window.with_webview(|webview| {
        use webkit2gtk::{SettingsExt, WebContextExt, WebViewExt};
        let view = webview.inner();
        if let Some(settings) = WebViewExt::settings(&view) {
            settings.set_enable_webgl(false);
            // Legacy engines support this toggle; newer WebKit treats it as a no-op.
            #[allow(deprecated)]
            settings.set_enable_accelerated_2d_canvas(false);
            settings.set_enable_media(false);
            settings.set_enable_media_stream(false);
            settings.set_enable_mediasource(false);
            settings.set_enable_page_cache(false);
            settings.set_enable_developer_extras(cfg!(debug_assertions));
        }
        if let Some(context) = view.context() {
            context.set_cache_model(webkit2gtk::CacheModel::DocumentViewer);
        }
        // Modern WebKit ignores the deprecated process-count limit. The app
        // creates exactly one view; keep WebKit's sandbox/process isolation.
    });
    let Ok(gtk) = window.gtk_window() else { return };
    gtk.set_skip_taskbar_hint(true);
    gtk.set_skip_pager_hint(true);
    gtk.stick();
    // Hidden startup prevents Tao's titlebar-after-realize warning and lets layer-shell
    // initialize before the first native surface is created.
    if wayland() && !gtk.is_realized() {
        unsafe {
            if let Ok(lib) = Library::new("libgtk-layer-shell.so.0") {
                let supported = call::<unsafe extern "C" fn() -> i32>(&lib,b"gtk_layer_is_supported\0");
                let init = call::<unsafe extern "C" fn(Window)>(&lib,b"gtk_layer_init_for_window\0");
                // Validate every symbol before opting in; old libraries fall back cleanly.
                let complete = [b"gtk_layer_set_layer\0".as_slice(),b"gtk_layer_set_anchor\0",b"gtk_layer_set_margin\0",b"gtk_layer_set_exclusive_zone\0",b"gtk_layer_set_keyboard_mode\0",b"gtk_layer_set_monitor\0"].iter().all(|name| lib.get::<*mut c_void>(name).is_ok());
                if complete && supported.map(|f|f()!=0).unwrap_or(false) && init.is_some() {
                    // A layer surface has no xdg ConfigureNotify to complete GTK's
                    // normal resize handshake. Give GTK a requisition before map,
                    // and update that requisition for subsequent content resizes.
                    gtk.set_size_request(340, 640);
                    init.unwrap()(gtk.upcast_ref::<gtk::Window>().to_glib_none().0);
                    SHELL.with(|slot| *slot.borrow_mut()=Some(lib));
                    LAYER.store(true,Ordering::Relaxed);
                }
            }
        }
    }
    if !layered() {
        gtk.set_type_hint(gtk::gdk::WindowTypeHint::Utility);
        if wayland() { eprintln!("AI Usage: layer-shell unavailable; fixed corners require XWayland or a panel integration."); }
    }
    apply(window, options, corner);
    // Explicitly clear WebKitGTK's backing surface; opacity belongs to the CSS widget.
    let _ = window.set_background_color(Some(tauri::window::Color(0,0,0,0)));
    // Tao queues the initial visible=false request. A direct GTK show here is
    // undone when that queue drains; enqueue our show through Tao as well.
    let _ = window.show();
}
pub fn resize_layer(window: &tauri::WebviewWindow, width: Option<i32>, height: Option<f64>) -> Result<(), String> {
    if height.is_some_and(|h| !h.is_finite()) { return Err("Invalid widget height".into()); }
    let target = window.clone();
    window.run_on_main_thread(move || {
        let pending = PENDING_RESIZE.with(|slot| {
            let mut slot = slot.borrow_mut();
            let pending = slot.is_some();
            let previous = slot.unwrap_or((None,None));
            *slot = Some((width.or(previous.0),height.or(previous.1)));
            pending
        });
        if pending { return; }
        // One short-lived source coalesces width/height updates; no polling timer.
        gtk::glib::timeout_add_local_once(std::time::Duration::from_millis(40), move || {
            let Some((width,height)) = PENDING_RESIZE.with(|slot| slot.borrow_mut().take()) else { return; };
            let Ok(gtk) = target.gtk_window() else { return; };
            let settings = super::settings_window::current();
            let list = crate::placement::monitors(&target);
            let Some(monitor) = crate::placement::selected(&list, &settings) else { return; };
            let (old_width,old_height) = gtk.size_request();
            let requested = (
                width.unwrap_or(old_width).clamp(1,monitor.width as i32),
                height.map(|h| h.ceil().max(80.0) as i32).unwrap_or(old_height).clamp(1,monitor.height as i32),
            );
            if requested != (old_width,old_height) {
                gtk.set_size_request(requested.0,requested.1);
                // GTK layer surfaces also need a resize to shrink to requisition.
                gtk.resize(1,1);
            }
            let _ = crate::placement::apply(&target,&settings);
        });
    }).map_err(|e| e.to_string())
}

pub fn apply(window: &tauri::WebviewWindow, options: &Options, corner: &str) {
    let corner=if corner=="Free" {"Top right"} else {corner};
    let Ok(gtk) = window.gtk_window() else { return };
    let display = gtk.display();
    let monitor = selected_monitor(&display, &options.monitor);
    if !layered() {
        gtk.set_keep_above(options.layer == "top");
        gtk.set_keep_below(options.layer != "top");
        return;
    }
    unsafe { SHELL.with(|slot| {
        let lib=slot.borrow(); let Some(lib)=lib.as_ref() else {return};
        let ptr=gtk.upcast_ref::<gtk::Window>().to_glib_none().0;
        call::<unsafe extern "C" fn(Window,u32)>(lib,b"gtk_layer_set_layer\0").unwrap()(ptr,if options.layer=="top" {2} else {1});
        // LEFT=0 RIGHT=1 TOP=2 BOTTOM=3; GTK logical pixels handle fractional scales.
        for edge in 0..4 {
            let active=match edge {0=>corner.ends_with("left"),1=>!corner.ends_with("left"),2=>corner.starts_with("Top"),_=>!corner.starts_with("Top")};
            call::<unsafe extern "C" fn(Window,u32,i32)>(lib,b"gtk_layer_set_anchor\0").unwrap()(ptr,edge,active as i32);
            call::<unsafe extern "C" fn(Window,u32,i32)>(lib,b"gtk_layer_set_margin\0").unwrap()(ptr,edge,options.margin.clamp(0,64));
        }
        call::<unsafe extern "C" fn(Window,i32)>(lib,b"gtk_layer_set_exclusive_zone\0").unwrap()(ptr,0);
        if let Some(monitor)=monitor { if std::env::var_os("AI_USAGE_SNAPSHOT_TRACE").is_some() { let g=monitor.geometry(); eprintln!("monitor-selected {} {},{} {}x{}", (0..display.n_monitors()).find_map(|i|display.monitor(i).filter(|m|m==&monitor).map(|m|monitor_name(&display,i,&m))).unwrap_or_default(),g.x(),g.y(),g.width(),g.height()); } call::<unsafe extern "C" fn(Window,*mut gtk::gdk::ffi::GdkMonitor)>(lib,b"gtk_layer_set_monitor\0").unwrap()(ptr,monitor.to_glib_none().0); }
        call::<unsafe extern "C" fn(Window,u32)>(lib,b"gtk_layer_set_keyboard_mode\0").unwrap()(ptr,if SETTINGS_OPEN.load(Ordering::Relaxed) {2} else {0});
    }); }
}
pub fn set_linux_focus(window: tauri::WebviewWindow, open: bool) {
    SETTINGS_OPEN.store(open,Ordering::Relaxed);
    let _=window.clone().run_on_main_thread(move || {
        let Ok(gtk)=window.gtk_window() else {return};
        if layered() { unsafe { SHELL.with(|slot| { if let Some(lib)=slot.borrow().as_ref() {
            if let Some(f)=call::<unsafe extern "C" fn(Window,u32)>(lib,b"gtk_layer_set_keyboard_mode\0") { f(gtk.upcast_ref::<gtk::Window>().to_glib_none().0,if open {2} else {0}); }
        } }); } } else { gtk.set_accept_focus(open); }
    });
}
// Observe shared settings/consent focus needs; installed once per document.
pub const SCRIPT: &str = r#"(() => {
 if (window.__linuxWidgetObserver) return; window.__linuxWidgetObserver = true;
 window.__TAURI_INTERNALS__.invoke('get_linux_hint').then(message => {
   if (!message) return;
   const hint=document.createElement('div'); hint.textContent=message; hint.setAttribute('role','status');
   hint.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;z-index:9999;padding:12px;background:Canvas;color:CanvasText;border:1px solid currentColor;font:12px sans-serif';
   hint.onclick=()=>hint.remove(); document.body.appendChild(hint); setTimeout(()=>hint.remove(),20000);
 }).catch(()=>{});
 let lastOpen;
 const update = () => { const panel = document.getElementById('settings');
 const consent=document.getElementById('provider-onboarding');
 const open=(!!panel && !panel.hidden) || (!!consent && !consent.hidden); if (open===lastOpen) return; lastOpen=open;
 window.__TAURI_INTERNALS__.invoke('set_linux_focus', {open}).catch(() => {}); };
 new MutationObserver(update).observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden']}); update();
})()"#;

pub fn desktop_info() -> serde_json::Value {
    let monitors = gtk::gdk::Display::default().map(|display| {
        (0..display.n_monitors()).filter_map(|index| display.monitor(index).map(|monitor| {
            let name = monitor_name(&display,index,&monitor);
            serde_json::json!({"index": index, "name": name})
        })).collect::<Vec<_>>()
    }).unwrap_or_default();
    serde_json::json!({"platform": "linux", "layerShell": layered(), "monitors": monitors,
        "monitorWarning": MONITOR_WARNING.with(|slot| slot.borrow().clone())})
}
pub fn get_autostart() -> Result<bool,String> {
    let path=dirs::config_dir().ok_or("Config directory unavailable")?.join("autostart/ai-usage.desktop");
    read_autostart(&path)
}
fn read_autostart(path: &std::path::Path) -> Result<bool,String> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e.to_string()),
    };
    let mut entry = false;
    let mut enabled = true;
    let mut executable = false;
    for line in content.lines().map(str::trim) {
        if line.starts_with('[') { entry = line == "[Desktop Entry]"; continue; }
        if !entry { continue; }
        if let Some((key, value)) = line.split_once('=') {
            match key.trim() {
                "Hidden" if value.trim() == "true" => enabled = false,
                "X-GNOME-Autostart-enabled" if value.trim() == "false" => enabled = false,
                "Exec" => executable = !value.trim().is_empty(),
                _ => (),
            }
        }
    }
    Ok(enabled && executable)
}

pub fn set_autostart(enabled: bool) -> Result<(),String> {
    let path=dirs::config_dir().ok_or("Config directory unavailable")?.join("autostart/ai-usage.desktop");
    let exe=std::env::var_os("APPIMAGE").map(std::path::PathBuf::from).unwrap_or(std::env::current_exe().map_err(|e|e.to_string())?);
    write_autostart(&path,&exe,enabled)
}
pub(crate) fn write_autostart(path: &std::path::Path, exe: &std::path::Path, enabled: bool) -> Result<(),String> {
    if !enabled { return match fs::remove_file(path) { Ok(())=>Ok(()),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(()),Err(e)=>Err(e.to_string()) }; }
    let escaped=exe.to_string_lossy().replace('\\',"\\\\").replace('"',"\\\"").replace('`',"\\`").replace('$',"\\$").replace('%',"%%");
    if escaped.contains(['\n','\r']) { return Err("Invalid executable path".into()); }
    fs::create_dir_all(path.parent().unwrap()).map_err(|e|e.to_string())?;
    fs::write(path,format!("[Desktop Entry]\nType=Application\nName=AI Usage\nExec=\"{escaped}\"\nIcon=ai-usage\nTerminal=false\nX-GNOME-Autostart-enabled=true\n")).map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn monitor_settings_accept_names_and_legacy_indices() {
        let named: Options = serde_json::from_str(r#"{"monitor":"DP-2"}"#).unwrap();
        assert!(named.monitor.as_ref().unwrap().matches(1,"DP-2"));
        assert!(!named.monitor.as_ref().unwrap().matches(1,"HDMI-A-1"));
        let indexed: Options = serde_json::from_str(r#"{"monitor":2}"#).unwrap();
        assert!(indexed.monitor.as_ref().unwrap().matches(2,"fixture"));
        assert!(!indexed.monitor.as_ref().unwrap().matches(1,"fixture"));
        assert_eq!(serde_json::to_value(named).unwrap()["monitor"],"DP-2");
    }
    #[test]
    fn connector_identity_survives_overlapping_scaled_geometry() {
        // Mixed-scale rectangles may overlap: point lookup loses identity.
        let fixtures = [
            ("eDP-1", gtk::gdk::Rectangle::new(2240, 85, 1536, 960), 2),
            ("HDMI-A-1", gtk::gdk::Rectangle::new(960, 0, 2560, 1440), 2),
            ("DP-2", gtk::gdk::Rectangle::new(0, 82, 1920, 1080), 1),
        ];
        assert!(fixtures[2].1.intersect(&fixtures[1].1).is_some());
        let available = fixtures.iter().enumerate().map(|(index, _)| {
            let name = connector_at_index(index as i32, |i| Some(fixtures[i as usize].0.into())).unwrap();
            (index as i32, name)
        }).collect::<Vec<_>>();
        for (index, (name, _, _)) in fixtures.iter().enumerate() {
            assert_eq!(selection_index(&MonitorSelection::Name((*name).into()), &available), Ok(index as i32));
        }
        assert_eq!(selection_index(&MonitorSelection::Index(1), &available), Ok(1));
        assert!(connector_at_index(0, |_| None).is_none());
        assert!(connector_at_index(0, |_| Some(String::new())).is_none());
    }
    #[test]
    fn unknown_monitor_reports_available_names_and_indices() {
        let available = vec![(0, "eDP-1".into()), (1, "HDMI-A-1".into())];
        assert_eq!(selection_index(&MonitorSelection::Name("missing".into()), &available),
            Err("monitor 'missing' not found; available: eDP-1 (0), HDMI-A-1 (1)".into()));
        assert!(selection_index(&MonitorSelection::Index(9), &available).unwrap_err().contains("monitor '9' not found"));
        assert!(!selection_index(&MonitorSelection::Name("bad\nname".into()), &[]).unwrap_err().contains('\n'));
    }
    #[test]
    fn autostart_is_quoted_and_only_removes_its_own_file() {
        let root=std::env::temp_dir().join(format!("aiusage-autostart-{}",std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path=root.join("widget.desktop");
        let other=root.join("other.desktop"); fs::write(&other,"fixture").unwrap();
        assert!(!read_autostart(&path).unwrap());
        write_autostart(&path,std::path::Path::new("/opt/A B/widget%\"$`"),true).unwrap();
        assert!(read_autostart(&path).unwrap());
        let value=fs::read_to_string(&path).unwrap();
        assert!(value.contains("Exec=\"/opt/A B/widget%%\\\"\\$\\`\""));
        write_autostart(&path,std::path::Path::new("/unused"),false).unwrap();
        assert!(!path.exists()); assert!(!read_autostart(&path).unwrap()); assert_eq!(fs::read_to_string(&other).unwrap(),"fixture");
        write_autostart(&path,std::path::Path::new("/unused"),false).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn autostart_respects_disabled_desktop_entries() {
        let path = std::env::temp_dir().join(format!("aiusage-disabled-{}", std::process::id()));
        for flag in ["Hidden=true", "X-GNOME-Autostart-enabled=false"] {
            fs::write(&path, format!("[Desktop Entry]\nExec=/fixture/widget\n{flag}\n")).unwrap();
            assert!(!read_autostart(&path).unwrap());
        }
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn autostart_rejects_newline_in_executable() {
        assert!(write_autostart(std::path::Path::new("/unused"),std::path::Path::new("/opt/bad\nExec=other"),true).is_err());
    }
}

pub fn placement_monitors() -> Vec<crate::placement::Monitor> {
    gtk::gdk::Display::default().map(|display| (0..display.n_monitors()).filter_map(|i|display.monitor(i).map(|m| {
        let area=m.workarea(); crate::placement::Monitor { name:monitor_name(&display,i,&m),x:area.x(),y:area.y(),width:area.width().max(1) as u32,height:area.height().max(1) as u32,primary:display.primary_monitor().as_ref()==Some(&m) || (display.primary_monitor().is_none() && i==0),scale:m.scale_factor() as f64 }
    })).collect()).unwrap_or_default()
}
pub fn place(window: &tauri::WebviewWindow, options: &Options, name: &str, x: i32, y: i32) {
    let key=(name.to_owned(),x,y,options.layer.clone());
    if LAST_PLACEMENT.with(|last|last.borrow().as_ref()==Some(&key)) {return;}
    LAST_PLACEMENT.with(|last|*last.borrow_mut()=Some(key));
    let Ok(gtk)=window.gtk_window() else {return}; let display=gtk.display();
    let monitor=selected_monitor(&display,&Some(MonitorSelection::Name(name.into())));
    // Apply layer and then replace all four anchors/margins. Layer-shell margins
    // are logical pixels; workarea offsets account for desktop panels.
    let mut options=options.clone(); options.monitor=Some(MonitorSelection::Name(name.into())); apply(window,&options,"Top left");
    unsafe { SHELL.with(|slot| { let lib=slot.borrow();let Some(lib)=lib.as_ref() else {return};let ptr=gtk.upcast_ref::<gtk::Window>().to_glib_none().0;
        // Coordinates already include workarea offsets. Zone 0 would let the
        // compositor add the panel exclusion again (e.g. 40 px past the bottom).
        call::<unsafe extern "C" fn(Window,i32)>(lib,b"gtk_layer_set_exclusive_zone\0").unwrap()(ptr,-1);
        let (ox,oy)=monitor.map(|m|{let a=m.workarea();let g=m.geometry();(a.x()-g.x(),a.y()-g.y())}).unwrap_or((0,0));
        for edge in 0..4 {call::<unsafe extern "C" fn(Window,u32,i32)>(lib,b"gtk_layer_set_anchor\0").unwrap()(ptr,edge,(edge==0 || edge==2) as i32);call::<unsafe extern "C" fn(Window,u32,i32)>(lib,b"gtk_layer_set_margin\0").unwrap()(ptr,edge,match edge {0=>x+ox,2=>y+oy,_=>0});}
    }); }
}
pub fn watch_monitors(app: tauri::AppHandle) {
    if let Some(display)=gtk::gdk::Display::default() {
        let added=app.clone(); display.connect_monitor_added(move |_,_|crate::placement::monitor_changed(added.clone()));
        display.connect_monitor_removed(move |_,_|crate::placement::monitor_changed(app.clone()));
    }
}

pub fn invalidate_placement() { LAST_PLACEMENT.with(|last|*last.borrow_mut()=None); }
