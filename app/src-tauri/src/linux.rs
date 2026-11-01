//! GTK3 integration. Load layer-shell at runtime so X11/GNOME need no extra library.
use gtk::{glib::translate::ToGlibPtr, prelude::*};
use libloading::Library;
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, ffi::c_void, fs, sync::atomic::{AtomicBool, Ordering}};

type Window = *mut gtk::ffi::GtkWindow;
thread_local! { static SHELL: RefCell<Option<Library>> = const { RefCell::new(None) }; }
static SETTINGS_OPEN: AtomicBool = AtomicBool::new(false);
static LAYER: AtomicBool = AtomicBool::new(false);
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all="camelCase")]
pub struct Options { pub layer: String, pub margin: i32, pub monitor: Option<i32> }
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
        if wayland() { eprintln!("AI Quota Widget: layer-shell unavailable; fixed corners require XWayland or a panel integration."); }
    }
    apply(window, options, corner);
    // Explicitly clear WebKitGTK's backing surface; opacity belongs to the CSS widget.
    let _ = window.set_background_color(Some(tauri::window::Color(0,0,0,0)));
    // Tao queues the initial visible=false request. A direct GTK show here is
    // undone when that queue drains; enqueue our show through Tao as well.
    let _ = window.show();
}
pub fn resize_layer(window: &tauri::WebviewWindow, width: Option<i32>, height: Option<f64>) -> Result<(), String> {
    let target = window.clone();
    window.run_on_main_thread(move || {
        let Ok(gtk) = target.gtk_window() else { return };
        let (old_width, old_height) = gtk.size_request();
        let display = gtk.display();
        let settings = super::load_settings();
        let monitor = settings.linux.monitor.and_then(|i| display.monitor(i))
            .or_else(|| display.primary_monitor()).or_else(|| display.monitor(0));
        let max_height = monitor
            .map(|m| m.workarea().height() - 2 * settings.linux.margin.clamp(0,64))
            .unwrap_or(640).max(80);
        let height = height.map(|h| h.ceil().clamp(80.0, max_height as f64) as i32)
            .unwrap_or(old_height).clamp(80, max_height);
        gtk.set_size_request(width.unwrap_or(old_width), height);
    }).map_err(|e| e.to_string())
}
pub fn apply(window: &tauri::WebviewWindow, options: &Options, corner: &str) {
    let corner=if corner=="Free" {"Top right"} else {corner};
    let Ok(gtk) = window.gtk_window() else { return };
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
        let display=gtk.display();
        let monitor=options.monitor.and_then(|i|display.monitor(i)).or_else(||display.primary_monitor()).or_else(||display.monitor(0));
        if let Some(monitor)=monitor { call::<unsafe extern "C" fn(Window,*mut gtk::gdk::ffi::GdkMonitor)>(lib,b"gtk_layer_set_monitor\0").unwrap()(ptr,monitor.to_glib_none().0); }
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
            let name = monitor.model().map(|s|s.to_string()).unwrap_or_else(||format!("Monitor {}", index + 1));
            serde_json::json!({"index": index, "name": name})
        })).collect::<Vec<_>>()
    }).unwrap_or_default();
    serde_json::json!({"platform": "linux", "layerShell": layered(), "monitors": monitors})
}
pub fn get_autostart() -> Result<bool,String> {
    let path=dirs::config_dir().ok_or("Config directory unavailable")?.join("autostart/dev.aiquota.widget.desktop");
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
    let path=dirs::config_dir().ok_or("Config directory unavailable")?.join("autostart/dev.aiquota.widget.desktop");
    let exe=std::env::var_os("APPIMAGE").map(std::path::PathBuf::from).unwrap_or(std::env::current_exe().map_err(|e|e.to_string())?);
    write_autostart(&path,&exe,enabled)
}
fn write_autostart(path: &std::path::Path, exe: &std::path::Path, enabled: bool) -> Result<(),String> {
    if !enabled { return match fs::remove_file(path) { Ok(())=>Ok(()),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(()),Err(e)=>Err(e.to_string()) }; }
    let escaped=exe.to_string_lossy().replace('\\',"\\\\").replace('"',"\\\"").replace('`',"\\`").replace('$',"\\$").replace('%',"%%");
    if escaped.contains(['\n','\r']) { return Err("Invalid executable path".into()); }
    fs::create_dir_all(path.parent().unwrap()).map_err(|e|e.to_string())?;
    fs::write(path,format!("[Desktop Entry]\nType=Application\nName=AI Quota Widget\nExec=\"{escaped}\"\nIcon=dev.aiquota.widget\nTerminal=false\nX-GNOME-Autostart-enabled=true\n")).map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn autostart_is_quoted_and_only_removes_its_own_file() {
        let root=std::env::temp_dir().join(format!("aiquota-autostart-{}",std::process::id()));
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
        let path = std::env::temp_dir().join(format!("aiquota-disabled-{}", std::process::id()));
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
