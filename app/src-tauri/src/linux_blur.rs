//! KWin blur on GTK's own connection; native calls stay on the GTK thread.
use gtk::{glib::translate::ToGlibPtr, prelude::*};
use std::{cell::RefCell, ffi::{c_char, c_int, c_long, c_ulong, c_void, CStr}, ptr};
type Proxy = *mut c_void;
#[repr(C)]
struct Message { name: *const c_char, signature: *const c_char, types: *const *const Interface }
#[repr(C)]
struct Interface {
    name: *const c_char, version: c_int, method_count: c_int, methods: *const Message,
    event_count: c_int, events: *const Message,
}
// Immutable descriptors point only to other static protocol descriptors.
unsafe impl Sync for Interface {}
unsafe impl Sync for Message {}
struct Types([*const Interface; 2]);
unsafe impl Sync for Types {}
static CREATE_TYPES: Types = Types([&BLUR, unsafe { &wl_surface_interface }]);
static SURFACE_TYPES: Types = Types([unsafe { &wl_surface_interface }, ptr::null()]);
static REGION_TYPES: Types = Types([unsafe { &wl_region_interface }, ptr::null()]);
static MANAGER_METHODS: [Message; 2] = [
    Message { name: c"create".as_ptr(), signature: c"no".as_ptr(), types: CREATE_TYPES.0.as_ptr() },
    Message { name: c"unset".as_ptr(), signature: c"o".as_ptr(), types: SURFACE_TYPES.0.as_ptr() },
];
static BLUR_METHODS: [Message; 3] = [
    Message { name: c"commit".as_ptr(), signature: c"".as_ptr(), types: ptr::null() },
    Message { name: c"set_region".as_ptr(), signature: c"?o".as_ptr(), types: REGION_TYPES.0.as_ptr() },
    Message { name: c"release".as_ptr(), signature: c"".as_ptr(), types: ptr::null() },
];
static MANAGER: Interface = Interface { name: c"org_kde_kwin_blur_manager".as_ptr(), version: 1,
    method_count: 2, methods: MANAGER_METHODS.as_ptr(), event_count: 0, events: ptr::null() };
static BLUR: Interface = Interface { name: c"org_kde_kwin_blur".as_ptr(), version: 1,
    method_count: 3, methods: BLUR_METHODS.as_ptr(), event_count: 0, events: ptr::null() };
static EFFECT_CREATE_TYPES: Types = Types([&EFFECT, unsafe { &wl_surface_interface }]);
static EFFECT_MANAGER_METHODS: [Message; 2] = [
    Message { name: c"destroy".as_ptr(), signature: c"".as_ptr(), types: ptr::null() },
    Message { name: c"get_background_effect".as_ptr(), signature: c"no".as_ptr(), types: EFFECT_CREATE_TYPES.0.as_ptr() },
];
static EFFECT_EVENTS: [Message; 1] = [
    Message { name: c"capabilities".as_ptr(), signature: c"u".as_ptr(), types: ptr::null() },
];
static EFFECT_METHODS: [Message; 2] = [
    Message { name: c"destroy".as_ptr(), signature: c"".as_ptr(), types: ptr::null() },
    Message { name: c"set_blur_region".as_ptr(), signature: c"?o".as_ptr(), types: REGION_TYPES.0.as_ptr() },
];
static EFFECT_MANAGER: Interface = Interface { name: c"ext_background_effect_manager_v1".as_ptr(), version: 1,
    method_count: 2, methods: EFFECT_MANAGER_METHODS.as_ptr(), event_count: 1, events: EFFECT_EVENTS.as_ptr() };
static EFFECT: Interface = Interface { name: c"ext_background_effect_surface_v1".as_ptr(), version: 1,
    method_count: 2, methods: EFFECT_METHODS.as_ptr(), event_count: 0, events: ptr::null() };
#[link(name = "wayland-client")]
extern "C" {
    static wl_compositor_interface: Interface;
    static wl_registry_interface: Interface;
    static wl_surface_interface: Interface;
    static wl_region_interface: Interface;
    fn wl_display_create_queue(display: Proxy) -> Proxy;
    fn wl_display_roundtrip_queue(display: Proxy, queue: Proxy) -> c_int;
    fn wl_display_dispatch_queue_pending(display: Proxy, queue: Proxy) -> c_int;
    fn wl_display_flush(display: Proxy) -> c_int;
    fn wl_event_queue_destroy(queue: Proxy);
    fn wl_proxy_create_wrapper(proxy: Proxy) -> Proxy;
    fn wl_proxy_wrapper_destroy(proxy: Proxy);
    fn wl_proxy_set_queue(proxy: Proxy, queue: Proxy);
    fn wl_proxy_destroy(proxy: Proxy);
    fn wl_proxy_marshal(proxy: Proxy, opcode: u32, ...);
    fn wl_proxy_marshal_constructor_versioned(proxy: Proxy, opcode: u32,
        interface: *const Interface, version: u32, ...) -> Proxy;
    fn wl_proxy_add_listener(proxy: Proxy, listener: *const c_void, data: Proxy) -> c_int;
}
#[repr(C)]
struct Listener {
    global: unsafe extern "C" fn(Proxy, Proxy, u32, *const c_char, u32),
    remove: unsafe extern "C" fn(Proxy, Proxy, u32),
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Protocol { Ext, Kde }
#[derive(Default)]
struct Globals { ext: u32, kde: u32, compositor: u32, capabilities: u32 }
impl Globals {
    fn protocol(&self) -> Option<Protocol> {
        if self.ext != 0 { Some(Protocol::Ext) } else if self.kde != 0 { Some(Protocol::Kde) } else { None }
    }
    fn available(&self, protocol: Option<Protocol>) -> bool {
        match protocol {
            Some(Protocol::Ext) => self.ext != 0 && self.capabilities & 1 != 0,
            Some(Protocol::Kde) => self.kde != 0,
            None => false,
        }
    }
}
unsafe extern "C" fn global(data: Proxy, _: Proxy, name: u32, interface: *const c_char, version: u32) {
    if version < 1 { return; }
    let globals = &mut *data.cast::<Globals>();
    match CStr::from_ptr(interface).to_bytes() {
        b"ext_background_effect_manager_v1" => globals.ext = name,
        b"org_kde_kwin_blur_manager" => globals.kde = name,
        b"wl_compositor" => globals.compositor = name,
        _ => (),
    }
}
unsafe extern "C" fn remove(data: Proxy, _: Proxy, name: u32) {
    let globals = &mut *data.cast::<Globals>();
    if globals.ext == name { globals.ext = 0; }
    if globals.kde == name { globals.kde = 0; }
    if globals.compositor == name { globals.compositor = 0; }
}
unsafe extern "C" fn capabilities(data: Proxy, _: Proxy, flags: u32) {
    (*data.cast::<Globals>()).capabilities = flags;
}
static LISTENER: Listener = Listener { global, remove };
#[repr(C)]
struct CapabilitiesListener { capabilities: unsafe extern "C" fn(Proxy, Proxy, u32) }
static CAPABILITIES_LISTENER: CapabilitiesListener = CapabilitiesListener { capabilities };
struct Wayland {
    display: Proxy, queue: Proxy, registry: Proxy, manager: Proxy, compositor: Proxy,
    blur: Proxy, surface: Proxy, protocol: Option<Protocol>, globals: Box<Globals>,
}
impl Wayland {
    unsafe fn bind(&self, name: u32, interface: &Interface) -> Proxy {
        wl_proxy_marshal_constructor_versioned(self.registry, 0, interface, 1,
            name, interface.name, 1u32, ptr::null::<c_void>())
    }
    unsafe fn new(display: Proxy) -> Result<Self, &'static str> {
        let mut state = Self { display, queue: ptr::null_mut(), registry: ptr::null_mut(),
            manager: ptr::null_mut(), compositor: ptr::null_mut(), blur: ptr::null_mut(),
            surface: ptr::null_mut(), protocol: None, globals: Box::default() };
        state.queue = wl_display_create_queue(display);
        if state.queue.is_null() { return Err("cannot create blur event queue"); }
        let wrapper = wl_proxy_create_wrapper(display);
        if wrapper.is_null() { return Err("cannot create blur display wrapper"); }
        wl_proxy_set_queue(wrapper, state.queue);
        state.registry = wl_proxy_marshal_constructor_versioned(wrapper, 1, &wl_registry_interface, 1, ptr::null::<c_void>());
        wl_proxy_wrapper_destroy(wrapper);
        if state.registry.is_null() { return Err("cannot create blur registry"); }
        let data = (&mut *state.globals as *mut Globals).cast();
        if wl_proxy_add_listener(state.registry, (&LISTENER as *const Listener).cast(), data) != 0
            || wl_display_roundtrip_queue(display, state.queue) < 0 { return Err("cannot query blur protocol"); }
        state.protocol = state.globals.protocol();
        if let Some(protocol) = state.protocol {
            let (name, interface) = match protocol {
                Protocol::Ext => (state.globals.ext, &EFFECT_MANAGER),
                Protocol::Kde => (state.globals.kde, &MANAGER),
            };
            state.manager = state.bind(name, interface);
            if state.manager.is_null() { return Err("cannot bind blur manager"); }
            if protocol == Protocol::Ext && (wl_proxy_add_listener(state.manager,
                (&CAPABILITIES_LISTENER as *const CapabilitiesListener).cast(), data) != 0
                || wl_display_roundtrip_queue(display, state.queue) < 0) {
                return Err("cannot query blur capabilities");
            }
        }
        if state.globals.compositor != 0 {
            state.compositor = state.bind(state.globals.compositor, &wl_compositor_interface);
            if state.compositor.is_null() { return Err("cannot bind blur compositor"); }
        }
        Ok(state)
    }
    unsafe fn clear(&mut self) {
        if !self.blur.is_null() {
            // Release before GTK destroys the associated wl_surface.
            wl_proxy_marshal(self.blur, if self.protocol == Some(Protocol::Ext) { 0 } else { 2 });
            wl_proxy_destroy(self.blur);
            self.blur = ptr::null_mut();
        }
        self.surface = ptr::null_mut();
    }
    unsafe fn apply(&mut self, surface: Proxy, enabled: bool, rectangles: &[(i32,i32,i32,i32)]) -> Result<(), &'static str> {
        if wl_display_dispatch_queue_pending(self.display, self.queue) < 0 { return Err("cannot dispatch blur registry"); }
        if self.surface != surface { self.clear(); }
        let available = !self.manager.is_null() && !self.compositor.is_null()
            && self.globals.compositor != 0 && self.globals.available(self.protocol);
        let active = enabled && available;
        if !active {
            if !self.blur.is_null() {
                if self.protocol == Some(Protocol::Ext) {
                    // Keep one effect object per surface, including across theme changes.
                    wl_proxy_marshal(self.blur, 1, ptr::null::<c_void>());
                } else {
                    wl_proxy_marshal(self.manager, 1, surface);
                    self.clear();
                }
            }
        } else {
            let region = wl_proxy_marshal_constructor_versioned(self.compositor, 1,
                &wl_region_interface, 1, ptr::null::<c_void>());
            if region.is_null() { return Err("cannot create blur region"); }
            for &(x,y,w,h) in rectangles { wl_proxy_marshal(region, 1, x, y, w, h); }
            if self.blur.is_null() {
                let (opcode, interface) = if self.protocol == Some(Protocol::Ext) { (1, &EFFECT) } else { (0, &BLUR) };
                self.blur = wl_proxy_marshal_constructor_versioned(self.manager, opcode, interface, 1, ptr::null::<c_void>(), surface);
                self.surface = surface;
            }
            if !self.blur.is_null() {
                wl_proxy_marshal(self.blur, 1, region);
                if self.protocol == Some(Protocol::Kde) { wl_proxy_marshal(self.blur, 0); }
            }
            // Both protocols copy the region; release the temporary object immediately.
            wl_proxy_marshal(region, 0);
            wl_proxy_destroy(region);
            if self.blur.is_null() { return Err("cannot create blur object"); }
        }
        // GTK owns wl_surface commits, including layer-shell's configure handshake.
        wl_display_flush(self.display);
        availability(enabled, available)
    }
}
impl Drop for Wayland {
    fn drop(&mut self) { unsafe {
        self.clear();
        if !self.manager.is_null() {
            if self.protocol == Some(Protocol::Ext) { wl_proxy_marshal(self.manager, 0); }
            wl_proxy_destroy(self.manager);
        }
        if !self.compositor.is_null() { wl_proxy_destroy(self.compositor); }
        if !self.registry.is_null() { wl_proxy_destroy(self.registry); }
        if !self.queue.is_null() { wl_event_queue_destroy(self.queue); }
    } }
}
#[link(name = "X11")]
extern "C" {
    fn XInternAtom(display: Proxy, name: *const c_char, only_if_exists: c_int) -> c_ulong;
    fn XDefaultRootWindow(display: Proxy) -> c_ulong;
    fn XGetWindowProperty(display: Proxy, window: c_ulong, property: c_ulong, offset: c_long,
        length: c_long, delete: c_int, requested_type: c_ulong, actual_type: *mut c_ulong,
        format: *mut c_int, count: *mut c_ulong, remaining: *mut c_ulong, data: *mut *mut u8) -> c_int;
    fn XChangeProperty(display: Proxy, window: c_ulong, property: c_ulong, kind: c_ulong,
        format: c_int, mode: c_int, data: *const u8, count: c_int) -> c_int;
    fn XDeleteProperty(display: Proxy, window: c_ulong, property: c_ulong) -> c_int;
    fn XFlush(display: Proxy) -> c_int;
    fn XFree(data: Proxy) -> c_int;
}
unsafe fn x11(display: Proxy, window: c_ulong, enabled: bool, rectangles: &[(i32,i32,i32,i32)], scale: i32) -> Result<(), &'static str> {
    let atom = XInternAtom(display, c"_KDE_NET_WM_BLUR_BEHIND_REGION".as_ptr(), 1);
    if !enabled {
        if atom != 0 { XDeleteProperty(display, window, atom); XFlush(display); }
        return Ok(());
    }
    let supported = XInternAtom(display, c"_NET_SUPPORTED".as_ptr(), 1);
    let (mut kind, mut format, mut count, mut remaining, mut data) = (0, 0, 0, 0, ptr::null_mut());
    let status = if atom != 0 && supported != 0 {
        XGetWindowProperty(display, XDefaultRootWindow(display), supported, 0, 65536,
            0, 4, &mut kind, &mut format, &mut count, &mut remaining, &mut data)
    } else { -1 };
    let available = status == 0 && kind == 4 && format == 32 && !data.is_null()
        && std::slice::from_raw_parts(data.cast::<c_ulong>(), count as usize).contains(&atom);
    if !data.is_null() { XFree(data.cast()); }
    availability(enabled, available)?;
    let data = x11_rectangles(rectangles, scale);
    // Xlib format 32 takes native longs, even on 64-bit hosts.
    XChangeProperty(display, window, atom, 6, 32, 0, data.as_ptr().cast(), data.len() as c_int);
    XFlush(display);
    Ok(())
}
fn x11_rectangles(rectangles: &[(i32,i32,i32,i32)], scale: i32) -> Vec<c_ulong> {
    rectangles.iter().flat_map(|&(x,y,w,h)| [x,y,w,h].map(|v| (v * scale) as c_ulong)).collect()
}
fn availability(enabled: bool, available: bool) -> Result<(), &'static str> {
    if enabled && !available { Err("KWin blur unavailable; using theme tint") } else { Ok(()) }
}
thread_local! {
    static WAYLAND: RefCell<std::collections::HashMap<String, Wayland>> = RefCell::new(std::collections::HashMap::new());
    static WARNING: RefCell<std::collections::HashMap<String, Option<&'static str>>> = RefCell::new(std::collections::HashMap::new());
}
unsafe fn native(label: &str, gdk: &gtk::gdk::Window, enabled: bool, rectangles: &[(i32,i32,i32,i32)]) -> Result<(), &'static str> {
    let lib = libloading::Library::new("libgdk-3.so.0").map_err(|_| "GDK native bridge unavailable")?;
    let display = gdk.display();
    let window_ptr: *mut gtk::gdk::ffi::GdkWindow = gdk.to_glib_none().0;
    let display_ptr: *mut gtk::gdk::ffi::GdkDisplay = display.to_glib_none().0;
    // Use the actual backend, including explicit XWayland launches.
    if display.type_().name() == "GdkWaylandDisplay" {
        let get_display = lib.get::<unsafe extern "C" fn(*mut gtk::gdk::ffi::GdkDisplay) -> Proxy>(b"gdk_wayland_display_get_wl_display\0")
            .map_err(|_| "GDK Wayland display bridge unavailable")?;
        let get_surface = lib.get::<unsafe extern "C" fn(*mut gtk::gdk::ffi::GdkWindow) -> Proxy>(b"gdk_wayland_window_get_wl_surface\0")
            .map_err(|_| "GDK Wayland surface bridge unavailable")?;
        let (display, surface) = (get_display(display_ptr), get_surface(window_ptr));
        if display.is_null() || surface.is_null() { return Ok(()); }
        WAYLAND.with(|slot| {
            let mut slot = slot.borrow_mut();
            if !slot.contains_key(label) {
                if !enabled { return Ok(()); }
                slot.insert(label.into(), Wayland::new(display)?);
            }
            slot.get_mut(label).unwrap().apply(surface, enabled, rectangles)
        })
    } else if display.type_().name() == "GdkX11Display" {
        let get_display = lib.get::<unsafe extern "C" fn(*mut gtk::gdk::ffi::GdkDisplay) -> Proxy>(b"gdk_x11_display_get_xdisplay\0")
            .map_err(|_| "GDK X11 display bridge unavailable")?;
        let get_xid = lib.get::<unsafe extern "C" fn(*mut gtk::gdk::ffi::GdkWindow) -> c_ulong>(b"gdk_x11_window_get_xid\0")
            .map_err(|_| "GDK X11 window bridge unavailable")?;
        x11(get_display(display_ptr), get_xid(window_ptr), enabled, rectangles, gdk.scale_factor())
    } else { availability(enabled, false) }
}
static CORNER_RADIUS_PHYSICAL: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, u64>>> = std::sync::LazyLock::new(std::sync::Mutex::default);
fn physical_radius(radius: Option<f64>, factor: f64) -> f64 {
    radius.filter(|r| r.is_finite() && *r > 0.0)
        .map(|r| r.min(10000.0) * factor).filter(|r| r.is_finite() && *r > 0.0).unwrap_or(0.0)
}
pub fn set_corner_radius(window: &tauri::WebviewWindow, radius: Option<f64>, factor: f64) {
    let bits = physical_radius(radius, factor).to_bits();
    if CORNER_RADIUS_PHYSICAL.lock().unwrap_or_else(|e| e.into_inner()).insert(window.label().into(), bits).unwrap_or(0) != bits {
        crate::shape_region::request(window);
    }
}
pub fn apply(window: &tauri::WebviewWindow, enabled: bool) {
    let Ok(widget) = window.gtk_window() else { return; };
    let Some(gdk) = widget.window() else { return; };
    // GTK/Wayland regions use logical pixels; X11 converts them to device pixels below.
    let Ok(factor) = window.scale_factor() else { return; };
    let radius = f64::from_bits(CORNER_RADIUS_PHYSICAL.lock().unwrap_or_else(|e| e.into_inner()).get(window.label()).copied().unwrap_or(0)) / factor;
    let Ok(rectangles) = crate::shape_region::window_scanlines(window, radius) else { return; };
    if enabled && rectangles.is_empty() { return; }
    let warning = unsafe { native(window.label(), &gdk, enabled, &rectangles) }.err();
    // Schedule GTK's next surface commit after the blur state changes.
    gdk.invalidate_rect(None, false);
    widget.queue_draw();
    WARNING.with(|slot| {
        if slot.borrow().get(window.label()) != Some(&warning) {
            if let Some(message) = warning { eprintln!("AI Usage: {message}"); }
            slot.borrow_mut().insert(window.label().into(), warning);
        }
    });
}
pub fn watch(window: &tauri::WebviewWindow, widget: &gtk::ApplicationWindow) {
    WAYLAND.with(|slot| { slot.borrow_mut().remove(window.label()); });
    WARNING.with(|slot| { slot.borrow_mut().remove(window.label()); });
    CORNER_RADIUS_PHYSICAL.lock().unwrap_or_else(|e| e.into_inner()).remove(window.label());
    let target = window.clone();
    widget.connect_map(move |_| crate::shape_region::request(&target));
    // GDK can replace a Wayland surface on hide/show without unrealizing GTK.
    let label=window.label().to_owned();
    widget.connect_unmap(move |_| WAYLAND.with(|slot| {
        if let Some(state) = slot.borrow_mut().get_mut(&label) { unsafe { state.clear(); } }
    }));
    let label=window.label().to_owned();
    widget.connect_unrealize(move |_| WAYLAND.with(|slot| { slot.borrow_mut().remove(&label); }));
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registry_prefers_ext_and_requires_its_blur_capability() {
        let mut globals = Globals::default();
        let data = (&mut globals as *mut Globals).cast();
        unsafe {
            global(data, ptr::null_mut(), 7, MANAGER.name, 0);
            assert_eq!(globals.protocol(), None);
            global(data, ptr::null_mut(), 7, MANAGER.name, 1);
            assert_eq!(globals.protocol(), Some(Protocol::Kde));
            assert!(globals.available(globals.protocol()));
            global(data, ptr::null_mut(), 8, EFFECT_MANAGER.name, 1);
            assert_eq!(globals.protocol(), Some(Protocol::Ext));
            for flags in [0, 2, 4] {
                capabilities(data, ptr::null_mut(), flags);
                assert!(!globals.available(globals.protocol()));
            }
            for flags in [1, 3] {
                capabilities(data, ptr::null_mut(), flags);
                assert!(globals.available(globals.protocol()));
            }
            capabilities(data, ptr::null_mut(), 0);
            assert!(!globals.available(globals.protocol()));
            remove(data, ptr::null_mut(), 8);
            assert_eq!(globals.protocol(), Some(Protocol::Kde));
            remove(data, ptr::null_mut(), 7);
            assert_eq!(globals.protocol(), None);
        }
    }
    #[test]
    fn protocol_descriptors_match_wire_opcodes_and_signatures() {
        unsafe fn messages(interface: &Interface, expected: &[(&CStr, &CStr)]) {
            assert_eq!(interface.method_count as usize, expected.len());
            for (opcode, &(name, signature)) in expected.iter().enumerate() {
                let message = &*interface.methods.add(opcode);
                assert_eq!(CStr::from_ptr(message.name), name);
                assert_eq!(CStr::from_ptr(message.signature), signature);
            }
        }
        unsafe {
            assert_eq!(CStr::from_ptr(EFFECT_MANAGER.name), c"ext_background_effect_manager_v1");
            assert_eq!(CStr::from_ptr(EFFECT.name), c"ext_background_effect_surface_v1");
            assert_eq!(CStr::from_ptr(MANAGER.name), c"org_kde_kwin_blur_manager");
            assert_eq!(CStr::from_ptr(BLUR.name), c"org_kde_kwin_blur");
            messages(&EFFECT_MANAGER, &[(c"destroy",c""),(c"get_background_effect",c"no")]);
            messages(&EFFECT, &[(c"destroy",c""),(c"set_blur_region",c"?o")]);
            messages(&MANAGER, &[(c"create",c"no"),(c"unset",c"o")]);
            messages(&BLUR, &[(c"commit",c""),(c"set_region",c"?o"),(c"release",c"")]);
            assert_eq!(EFFECT_MANAGER.event_count, 1);
            assert_eq!(CStr::from_ptr((*EFFECT_MANAGER.events).name), c"capabilities");
            assert_eq!(CStr::from_ptr((*EFFECT_MANAGER.events).signature), c"u");
            assert!(ptr::eq(*EFFECT_MANAGER_METHODS[1].types, &EFFECT));
            assert!(ptr::eq(*EFFECT_METHODS[1].types, &wl_region_interface));
        }
    }
    #[test]
    fn blur_rectangles_follow_curved_scanlines_and_x11_scale() {
        for shape in [crate::Shape::Circle, crate::Shape::Pill] {
            let rows = crate::shape_region::scanlines(&shape, 480, 120);
            assert!(rows[0].0 > 0 && rows[0].2 < 480);
            assert_eq!(rows[60].2, 480);
            let native = x11_rectangles(&rows, 2);
            for (row, rectangle) in rows.iter().zip(native.chunks_exact(4)) {
                assert_eq!(rectangle, &[row.0 as c_ulong * 2, row.1 as c_ulong * 2,
                    row.2 as c_ulong * 2, row.3 as c_ulong * 2]);
            }
        }
        assert_eq!(x11_rectangles(&[(0,0,340,340)], 1), vec![0,0,340,340]);
    }
    #[test]
    fn optional_css_radius_is_stored_in_physical_pixels() {
        assert_eq!(physical_radius(None,2.0),0.0);
        for factor in [1.0,1.5,2.0] {
            assert_eq!(physical_radius(Some(22.0),factor),22.0*factor);
            let rows = crate::shape_region::blur_scanlines(&crate::Shape::Portrait,340,600,
                physical_radius(Some(22.0),factor)/factor);
            let native = x11_rectangles(&rows,2);
            assert!(native[0] > 0 && native[2] < 680);
            assert_eq!(&native[300*4..301*4],&[0,600,680,2]);
        }
        for radius in [0.0,-1.0,f64::NAN,f64::INFINITY] {
            assert_eq!(physical_radius(Some(radius),2.0),0.0);
        }
    }
    #[test]
    fn missing_protocol_falls_back_and_clearing_is_always_allowed() {
        assert!(availability(true, false).is_err());
        assert!(availability(false, false).is_ok());
        assert!(availability(true, true).is_ok());
        assert!(availability(false, true).is_ok());
    }
}
