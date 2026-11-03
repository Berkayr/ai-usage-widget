//! Desktop reservations in logical pixels. KWin is queried on desktop events only.
use gtk::{gio, glib};
use glib::variant::ToVariant;
use serde::Deserialize;
use std::{collections::BTreeMap, sync::{Mutex, atomic::{AtomicBool, Ordering}}};
#[derive(Clone, Debug, Deserialize)]
pub struct Area { pub name: String, pub x: i32, pub y: i32, pub width: u32, pub height: u32 }
static AREAS: Mutex<Vec<Area>> = Mutex::new(Vec::new());
static PENDING: AtomicBool = AtomicBool::new(false);
pub fn cached(name: &str) -> Option<Area> { AREAS.lock().ok()?.iter().find(|a|a.name==name).cloned() }

fn dbus(connection: &gio::DBusConnection, path: &str, interface: &str, method: &str, args: Option<&glib::Variant>) -> Option<glib::Variant> {
    connection.call_sync(Some("org.kde.KWin"),path,interface,method,args,None,gio::DBusCallFlags::NONE,800,None::<&gio::Cancellable>).ok()
}
fn query_kwin() -> Option<Vec<Area>> {
    let context=glib::MainContext::new();
    context.with_thread_default(|| {
        let connection=gio::bus_get_sync(gio::BusType::Session,None::<&gio::Cancellable>).ok()?;
        let info=gio::DBusNodeInfo::for_xml("<node><interface name='org.aiusage.WorkArea'><method name='Result'><arg type='s' direction='in'/></method></interface></node>").ok()?;
        let result=std::sync::Arc::new(Mutex::new(None));
        let output=result.clone();
        let event_loop=glib::MainLoop::new(Some(&context),false);
        let completed=event_loop.clone();
        let registration=connection.register_object("/org/aiusage/WorkArea",&info.lookup_interface("org.aiusage.WorkArea")?,move |_,_,_,_,_,args,invocation| {
            if let Some((data,))=args.get::<(String,)>() { *output.lock().unwrap()=serde_json::from_str::<Vec<Area>>(&data).ok(); }
            invocation.return_value(None);
            completed.quit();
        }, |_,_,_,_,_| ().to_variant(), |_,_,_,_,_,_| false).ok()?;
        let script_name=format!("ai-usage-workarea-{}",std::process::id());
        let path=std::env::temp_dir().join(format!("{script_name}.js"));
        let destination=serde_json::to_string(connection.unique_name()?.as_str()).ok()?;
        let code=format!("var areas=[]; for (var i=0;i<workspace.screens.length;i++) {{ var o=workspace.screens[i]; var a=workspace.clientArea(KWin.MaximizeArea,o,workspace.currentDesktop); areas.push({{name:o.name,x:a.x,y:a.y,width:a.width,height:a.height}}); }} callDBus({destination},'/org/aiusage/WorkArea','org.aiusage.WorkArea','Result',JSON.stringify(areas));");
        // A private, one-shot script is always unloaded and removed, including timeout.
        use std::os::unix::fs::OpenOptionsExt;
        let loaded=(|| {
            use std::io::Write;
            let mut file=std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path).ok()?;
            file.write_all(code.as_bytes()).ok()?;
            let reply=dbus(&connection,"/Scripting","org.kde.kwin.Scripting","loadScript",Some(&(path.to_string_lossy().as_ref(),script_name.as_str()).to_variant()))?;
            let (id,)=reply.get::<(i32,)>()?;
            if id<0 {return None;}
            dbus(&connection,&format!("/Scripting/Script{id}"),"org.kde.kwin.Script","run",None)?;
            let expired=event_loop.clone();
            let timeout=glib::timeout_source_new(std::time::Duration::from_millis(800),None,glib::Priority::DEFAULT,move || {expired.quit();glib::ControlFlow::Break});
            timeout.attach(Some(&context));
            event_loop.run();
            timeout.destroy();
            result.lock().unwrap().clone()
        })();
        let _=dbus(&connection,"/Scripting","org.kde.kwin.Scripting","unloadScript",Some(&(script_name.as_str(),).to_variant()));
        let _=std::fs::remove_file(path);
        let _=connection.unregister_object(registration);
        loaded
    }).ok().flatten()
}
pub fn refresh(app: tauri::AppHandle) {
    if !std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase().contains("kde") || PENDING.swap(true,Ordering::Relaxed) {return;}
    std::thread::spawn(move || {
        *AREAS.lock().unwrap()=query_kwin().unwrap_or_default();
        PENDING.store(false,Ordering::Relaxed);
        crate::placement::monitor_changed(app);
    });
}

type Ini = BTreeMap<String,BTreeMap<String,String>>;
fn ini(text: &str) -> Ini {
    let mut result=Ini::new(); let mut section=String::new();
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {section=line.to_owned();}
        else if let Some((key,value))=line.split_once('=') {result.entry(section.clone()).or_default().insert(key.into(),value.into());}
    }
    result
}
pub fn panel_edges(applets: &str, shell: &str, index: i32) -> [i32;4] {
    let applets=ini(applets);let shell=ini(shell);let mut edges=[0;4];
    for (section,values) in &applets {
        if values.get("plugin").map(String::as_str)!=Some("org.kde.panel") || values.get("lastScreen").and_then(|s|s.parse::<i32>().ok())!=Some(index) {continue;}
        let id=section.trim_start_matches("[Containments][").trim_end_matches(']');
        let prefix=format!("[PlasmaViews][Panel {id}]");
        let defaults=shell.get(&format!("{prefix}[Defaults]"));
        let general=applets.get(&format!("{section}[General]"));
        // Auto-hide and windows-can-cover panels do not reserve space.
        let visibility=[general,shell.get(&prefix),defaults,Some(values)].into_iter().flatten().find_map(|v|v.get("panelVisibility").or_else(||v.get("visibilityMode")));
        if visibility.is_some_and(|s|s!="0") {continue;}
        let thickness=defaults.and_then(|v|v.get("thickness")).and_then(|s|s.parse::<i32>().ok()).unwrap_or(44).clamp(0,1000);
        if let Some(edge)=values.get("location").and_then(|s|s.parse::<usize>().ok()).and_then(|v|match v {3=>Some(0),4=>Some(1),5=>Some(2),6=>Some(3),_=>None}) {edges[edge]=edges[edge].max(thickness);}
    }
    edges
}
pub fn fallback_edges(index: i32) -> ([i32;4], &'static str) {
    let desktop=std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase();
    if desktop.contains("kde") {
        let config=std::env::var_os("XDG_CONFIG_HOME").map(std::path::PathBuf::from).unwrap_or_else(||dirs::home_dir().unwrap_or_default().join(".config"));
        if let Ok(applets)=std::fs::read_to_string(config.join("plasma-org.kde.plasma.desktop-appletsrc")) {
            return (panel_edges(&applets,&std::fs::read_to_string(config.join("plasmashellrc")).unwrap_or_default(),index),"plasma-config");
        }
        return ([44,0,0,0],"kde-fallback");
    }
    if desktop.contains("gnome") {([32,0,0,0],"gnome-fallback")} else {([0;4],"desktop-fallback")}
}
#[cfg(test)] mod tests {
    use super::*;
    #[test]
    #[ignore = "Requires a running local KDE session; opens no widget"]
    fn live_desktop_work_area() {
        let areas=query_kwin();eprintln!("KWin: {areas:?}");
        *AREAS.lock().unwrap()=areas.unwrap_or_default();
        gtk::init().expect("GTK display");
        for m in crate::linux::placement_monitors() { eprintln!("{} {},{} {}x{} top={} bottom={} source={}",m.name,m.x,m.y,m.width,m.height,m.detected_top,m.detected_bottom,m.work_area_source); }
    }
    #[test] fn panels_use_identity_and_ignore_hidden_and_nested_applets() {
        let applets="[Containments][7]\nplugin=org.kde.panel\nlastScreen=1\nlocation=3\n[Containments][7][Applets][9]\nlocation=4\n[Containments][8]\nplugin=org.kde.panel\nlastScreen=0\nlocation=4\n[Containments][8][General]\nvisibilityMode=1";
        assert_eq!(panel_edges(applets,"[PlasmaViews][Panel 7][Defaults]\nthickness=34",1),[34,0,0,0]);
        assert_eq!(panel_edges(applets,"",0),[0;4]);
        assert_eq!(panel_edges(applets,"",1),[44,0,0,0]);
        assert_eq!(panel_edges(applets,"[PlasmaViews][Panel 7]
panelVisibility=1",1),[0;4]);
        assert_eq!(panel_edges(applets,"[PlasmaViews][Panel 7][Defaults]
panelVisibility=2",1),[0;4]);
    }
}
