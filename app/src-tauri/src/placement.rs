use super::*;
use std::sync::atomic::{AtomicBool, Ordering};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Placement { pub monitor: Option<String>, #[serde(rename="x_ratio", alias="xRatio")] pub x_ratio: f64, #[serde(rename="y_ratio", alias="yRatio")] pub y_ratio: f64, pub snap: String, pub disconnected: String, pub fallback_monitor: Option<String> }
impl Default for Placement { fn default() -> Self { Self { monitor: None, x_ratio: 1., y_ratio: 0., snap: "off".into(), disconnected: "primary".into(), fallback_monitor: None } } }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Monitor { pub name: String, pub x: i32, pub y: i32, pub width: u32, pub height: u32, pub primary: bool, pub scale: f64 }
pub fn pixel(ratio: f64, extent: u32, widget: u32) -> i32 { (if ratio.is_finite() { ratio.clamp(0.,1.) } else { 0. } * extent.saturating_sub(widget) as f64).round() as i32 }
pub fn ratio(pixel: i32, extent: u32, widget: u32) -> f64 { if extent <= widget { 0. } else { (pixel as f64 / (extent-widget) as f64).clamp(0.,1.) } }
pub fn snap(value: i32, available: i32, mode: &str) -> i32 {
    let value = value.clamp(0, available.max(0));
    if mode == "grid" { return ((value as f64 / 8.).round() as i32 * 8).clamp(0,available.max(0)); }
    if mode == "edges" { for line in [0, available/2, available] { if (value-line).abs() <= 12 { return line; } } }
    value
}
fn select<'a>(list: &'a [Monitor], p: &Placement) -> Option<&'a Monitor> {
    if let Some(found) = p.monitor.as_ref().and_then(|name| list.iter().find(|m| &m.name==name)) { return Some(found); }
    if p.monitor.is_some() && p.disconnected=="hide" { return None; }
    if p.disconnected=="monitor" { if let Some(found)=p.fallback_monitor.as_ref().and_then(|name|list.iter().find(|m|&m.name==name)) { return Some(found); } }
    list.iter().find(|m|m.primary).or_else(||list.first())
}
pub fn monitors(window: &tauri::WebviewWindow) -> Vec<Monitor> {
    #[cfg(target_os="linux")] { let _=window; linux::placement_monitors() }
    #[cfg(not(target_os="linux"))] {
        let primary=window.primary_monitor().ok().flatten();
        window.available_monitors().unwrap_or_default().iter().map(|m| { let a=m.work_area(); Monitor { name:m.name().cloned().unwrap_or_default(),x:a.position.x,y:a.position.y,width:a.size.width,height:a.size.height,scale:m.scale_factor(),primary:primary.as_ref().map(|p|p.position()==m.position()).unwrap_or(false) } }).collect()
    }
}
#[tauri::command]
pub async fn get_placement_monitors(app: tauri::AppHandle) -> Result<Value,String> {
    let window=app.get_webview_window("main").ok_or("Main window unavailable")?;
    let (tx,rx)=std::sync::mpsc::channel(); let target=window.clone();
    window.run_on_main_thread(move || { let size=widget_size(&target); let _=tx.send(json!({"monitors":monitors(&target),"widgetWidth":size.0,"widgetHeight":size.1,"layerShell":is_layered()})); }).map_err(|e|e.to_string())?;
    rx.recv().map_err(|e|e.to_string())
}
fn is_layered() -> bool { #[cfg(target_os="linux")] {linux::layered()} #[cfg(not(target_os="linux"))] {false} }
fn widget_size(window: &tauri::WebviewWindow) -> (u32,u32) {
    #[cfg(target_os="linux")] { use gtk::prelude::*; if let Ok(gtk)=window.gtk_window() { let (w,h)=gtk.size_request(); return (if linux::layered() {w.max(1)} else {gtk.allocated_width().max(1)} as u32,if linux::layered() {h.max(1)} else {gtk.allocated_height().max(1)} as u32); } }
    window.outer_size().map(|s|(s.width,s.height)).unwrap_or((340,640))
}
pub fn apply(window: &tauri::WebviewWindow, settings: &Settings) -> Result<(),String> {
    let list=monitors(window);
    let mut p=settings.placement.clone();
    #[cfg(target_os="linux")] if p.monitor.is_none() { match &settings.linux.monitor { Some(linux::MonitorSelection::Name(name))=>p.monitor=Some(name.clone()), Some(linux::MonitorSelection::Index(index))=>p.monitor=usize::try_from(*index).ok().and_then(|i|list.get(i)).map(|m|m.name.clone()), _=>() } }
    let Some(monitor)=select(&list,&p) else { let _=window.hide(); return Ok(()); };
    let (width,height)=widget_size(window);
    let clipped=(width.min(monitor.width),height.min(monitor.height));
    if clipped!=(width,height) {
        #[cfg(target_os="linux")] { use gtk::prelude::*;if let Ok(gtk)=window.gtk_window() {gtk.set_size_request(clipped.0 as i32,clipped.1 as i32);if !linux::layered() {gtk.resize(clipped.0 as i32,clipped.1 as i32);}} }
        #[cfg(not(target_os="linux"))] {let _=window.set_size(tauri::PhysicalSize::new(clipped.0,clipped.1));}
    }
    let (width,height)=clipped;
    let (xr,yr)=if settings.position=="Free" { (p.x_ratio,p.y_ratio) } else { (if settings.position.ends_with("left") {0.} else {1.},if settings.position.starts_with("Top") {0.} else {1.}) };
    let mut x=snap(pixel(xr,monitor.width,width),monitor.width.saturating_sub(width) as i32,&p.snap);
    let mut y=snap(pixel(yr,monitor.height,height),monitor.height.saturating_sub(height) as i32,&p.snap);
    #[cfg(target_os="linux")] if settings.position!="Free" { let margin=settings.linux.margin.clamp(0,64); x=if xr==0. { margin } else { x-margin }; y=if yr==0. { margin } else { y-margin }; }
    x=x.clamp(0,monitor.width.saturating_sub(width) as i32); y=y.clamp(0,monitor.height.saturating_sub(height) as i32);
    #[cfg(target_os="linux")] {
        if linux::layered() { linux::place(window,&settings.linux,&monitor.name,x,y); if !window.is_visible().unwrap_or(false) { let _=window.show(); } return Ok(()); }
    }
    #[cfg(target_os="linux")] { use gtk::prelude::*; if let Ok(gtk)=window.gtk_window() { let desired=(monitor.x+x,monitor.y+y); if gtk.position()!=desired { gtk.move_(desired.0,desired.1); } if !window.is_visible().unwrap_or(false) {let _=window.show();} return Ok(()); } }
    let desired=tauri::PhysicalPosition::new(monitor.x+x,monitor.y+y);
    if window.outer_position().ok()!=Some(desired) { window.set_position(desired).map_err(|e|e.to_string())?; }
    if !window.is_visible().unwrap_or(false) { let _=window.show(); }
    Ok(())
}
#[tauri::command]
pub async fn capture_position(app: tauri::AppHandle) -> Result<Placement,String> {
    let window=app.get_webview_window("main").ok_or("Main window unavailable")?;
    let (tx,rx)=std::sync::mpsc::channel(); let target=window.clone();
    window.run_on_main_thread(move || {
        let result=(|| { #[cfg(not(target_os="linux"))] let position=target.outer_position().map_err(|e|e.to_string())?;
            #[cfg(target_os="linux")] let position={use gtk::prelude::*;let gtk=target.gtk_window().map_err(|e|e.to_string())?;let (x,y)=gtk.position();tauri::PhysicalPosition::new(x,y)}; let size=widget_size(&target); let list=monitors(&target);
            let monitor=list.iter().find(|m|position.x>=m.x && position.x<m.x+m.width as i32 && position.y>=m.y && position.y<m.y+m.height as i32).ok_or("Monitor unavailable")?;
            Ok(Placement {monitor:Some(monitor.name.clone()),x_ratio:ratio(position.x-monitor.x,monitor.width,size.0),y_ratio:ratio(position.y-monitor.y,monitor.height,size.1),..settings_window::current().placement}) })(); let _=tx.send(result);
    }).map_err(|e|e.to_string())?;
    rx.recv().map_err(|e|e.to_string())?
}
static PENDING: AtomicBool=AtomicBool::new(false);
pub fn monitor_changed(app: tauri::AppHandle) {
    if PENDING.swap(true,Ordering::Relaxed) { return; }
    thread::spawn(move || { thread::sleep(Duration::from_millis(400)); let target=app.clone();
        let _=app.run_on_main_thread(move || { PENDING.store(false,Ordering::Relaxed); if std::env::var_os("AI_USAGE_SETTINGS_SOAK_CYCLES").is_some() {eprintln!("monitor-soak-applied");} #[cfg(target_os="linux")] linux::invalidate_placement(); if let Some(w)=target.get_webview_window("main") { let _=apply(&w,&settings_window::current()); let _=target.emit("monitors-changed",()); } });
    });
}
pub fn watch(app: tauri::AppHandle) {
    #[cfg(windows)] windows_events::watch(app.clone());
    #[cfg(target_os="linux")] linux::watch_monitors(app.clone());
    if let Some(w)=app.get_webview_window("main") { let _=apply(&w,&settings_window::current()); }
}
#[cfg(test)] mod tests {
    use super::*;
    fn monitor(name:&str,primary:bool)->Monitor {Monitor{name:name.into(),x:0,y:0,width:1920,height:1080,primary,scale:1.}}
    #[test] fn ratios_clip_and_roundtrip() { for r in [0.,0.25,0.5,1.] {assert!((ratio(pixel(r,1920,340),1920,340)-r).abs()<0.001);} assert_eq!(pixel(2.,100,20),80);assert_eq!(pixel(-1.,100,20),0);assert_eq!(pixel(f64::NAN,100,20),0);assert_eq!(pixel(0.5,100,200),0);assert_eq!(ratio(99,100,200),0.); }
    #[test] fn snapping() {assert_eq!(snap(9,100,"edges"),0);assert_eq!(snap(46,100,"edges"),50);assert_eq!(snap(94,100,"edges"),100);assert_eq!(snap(46,100,"off"),46);assert_eq!(snap(46,100,"grid"),48);assert_eq!(snap(100,99,"grid"),96);}
    #[test] fn missing_monitor_returns_and_falls_back() {let list=vec![monitor("A",true),monitor("B",false)]; let mut p=Placement{monitor:Some("gone".into()),..Default::default()}; assert_eq!(select(&list,&p).unwrap().name,"A");p.disconnected="monitor".into();p.fallback_monitor=Some("B".into());assert_eq!(select(&list,&p).unwrap().name,"B");p.disconnected="hide".into();assert!(select(&list,&p).is_none());p.monitor=Some("B".into());assert_eq!(select(&list,&p).unwrap().name,"B");}
    #[test] fn position_schema_roundtrip() {let p:Placement=serde_json::from_str(r#"{"monitor":"Synthetic","x_ratio":0.25,"y_ratio":0.75}"#).unwrap();assert_eq!(p.x_ratio,0.25);let value=serde_json::to_value(p).unwrap();assert_eq!(value["y_ratio"],0.75);assert!(value.get("xRatio").is_none());let alias:Placement=serde_json::from_str(r#"{"xRatio":0.5}"#).unwrap();assert_eq!(alias.x_ratio,0.5);}
    #[test] fn old_settings_keep_corner() {let s:Settings=serde_json::from_str(r#"{"position":"Bottom left"}"#).unwrap();assert_eq!(s.position,"Bottom left");assert!(s.lock_position);assert!(s.placement.monitor.is_none());assert_eq!(s.placement.disconnected,"primary");}
}

#[cfg(windows)]
mod windows_events {
    use super::*;
    use windows_sys::Win32::{Foundation::{HWND,LPARAM,LRESULT,WPARAM},UI::{Shell::{DefSubclassProc,RemoveWindowSubclass,SetWindowSubclass},WindowsAndMessaging::{WM_DISPLAYCHANGE,WM_DPICHANGED,WM_NCDESTROY,WM_SETTINGCHANGE}}};
    const ID: usize=0x415550;
    unsafe extern "system" fn procedure(hwnd: HWND,message:u32,wparam:WPARAM,lparam:LPARAM,id:usize,data:usize)->LRESULT {
        if message==WM_DISPLAYCHANGE || message==WM_DPICHANGED || (message==WM_SETTINGCHANGE && wparam==0x002f) { monitor_changed((*(data as *const tauri::AppHandle)).clone()); }
        if message==WM_NCDESTROY { RemoveWindowSubclass(hwnd,Some(procedure),id); drop(Box::from_raw(data as *mut tauri::AppHandle)); }
        DefSubclassProc(hwnd,message,wparam,lparam)
    }
    pub fn watch(app:tauri::AppHandle) {
        if let Some(window)=app.get_webview_window("main") { if let Ok(hwnd)=window.hwnd() {unsafe { let data=Box::into_raw(Box::new(app)); if SetWindowSubclass(hwnd.0 as HWND,Some(procedure),ID,data as usize)==0 {drop(Box::from_raw(data));} }} }
    }
}
