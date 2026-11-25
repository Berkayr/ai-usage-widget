//! Independent, unparented taskbar surface. All HWND/GDI resources belong to one GUI thread.
use super::{load_settings, read_snapshot, save_settings, TaskbarSettings};
use serde_json::Value;
use std::cell::Cell;
use std::collections::BTreeMap;
use std::result::Result::Ok;
use std::{
    ptr::{null, null_mut},
    sync::{
        atomic::{AtomicIsize, Ordering},
        Mutex, OnceLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
use windows_sys::{
    core::w,
    Win32::{
        Foundation::*,
        Graphics::{Gdi::*, GdiPlus::*},
        System::{LibraryLoader::GetModuleHandleW, Registry::*},
        UI::{
            Accessibility::*, Controls::*, HiDpi::*, Input::KeyboardAndMouse::*, Shell::*,
            WindowsAndMessaging::*,
        },
    },
};

const UPDATE: u32 = WM_APP + 21;
static WINDOW: AtomicIsize = AtomicIsize::new(0);
static MODEL: OnceLock<Mutex<Model>> = OnceLock::new();
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
thread_local! { static IS_STRIP: Cell<bool> = const { Cell::new(false) }; }
static WORKER: Mutex<Option<std::thread::JoinHandle<()>>> = Mutex::new(None);
#[derive(Clone)]
struct Model {
    settings: TaskbarSettings,
    limit_visibility: BTreeMap<String, bool>,
    snapshot: Option<Value>,
}
fn wake() {
    let hwnd = WINDOW.load(Ordering::Acquire) as HWND;
    if !hwnd.is_null() {
        unsafe {
            PostMessageW(hwnd, UPDATE, 0, 0);
        }
    }
}
pub(super) fn update_snapshot(snapshot: Option<Value>) {
    if let Some(model) = MODEL.get() {
        if let Ok(mut m) = model.lock() {
            m.snapshot = snapshot;
        }
        wake();
    }
}
pub(super) fn update_settings(settings: TaskbarSettings, limit_visibility: BTreeMap<String, bool>) {
    let enabled = settings.enabled;
    if let Some(model) = MODEL.get() {
        if let Ok(mut m) = model.lock() { m.settings = settings; m.limit_visibility = limit_visibility; }
    }
    // The GUI callback must never wait for a controller joining this thread.
    if IS_STRIP.with(|flag| flag.get()) { wake(); return; }
    if let Ok(mut worker) = WORKER.lock() {
        if !enabled {
            if let Some(handle) = worker.take() {
                let hwnd = WINDOW.load(Ordering::Acquire) as HWND;
                if !hwnd.is_null() { unsafe { PostMessageW(hwnd, WM_CLOSE, 0, 0); } }
                let _ = handle.join();
            }
        } else {
            if worker.as_ref().map(|w| w.is_finished()).unwrap_or(false) {
                if let Some(handle) = worker.take() { let _ = handle.join(); }
            }
            if worker.is_none() {
                if let Some(app) = APP.get() { *worker = Some(spawn_strip(app.clone())); }
            } else { wake(); }
        }
    }
}
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

#[derive(Clone, Debug, PartialEq)]
struct Row {
    text: String,
    pct: Option<f64>,
}
fn pct(w: &Value) -> Option<f64> {
    w["used_percent"]
        .as_f64()
        .filter(|v| v.is_finite())
        .map(|v| v.clamp(0., 100.))
}
fn percent(w: &Value) -> String {
    pct(w)
        .map(|v| format!("{v:.0}%"))
        .unwrap_or_else(|| "—".into())
}
fn countdown(w: &Value) -> String {
    // Prefer the absolute reset time. The shell's FILETIME parser is unnecessary: accept
    // the ISO-8601 timestamps emitted by quotacore, including numeric UTC offsets.
    let minutes = w["resets_at"]
        .as_str()
        .and_then(parse_timestamp)
        .map(|t| {
            (t - SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64)
                .max(0)
                / 60
        })
        .or_else(|| {
            w["resets_in_minutes"]
                .as_f64()
                .filter(|v| v.is_finite())
                .map(|v| v.max(0.) as i64)
        });
    match minutes {
        Some(m) if m >= 1440 => format!("{}d{:02}h", m / 1440, m % 1440 / 60),
        Some(m) => format!("{}h{:02}", m / 60, m % 60),
        None => "—".into(),
    }
}
fn parse_timestamp(s: &str) -> Option<i64> {
    // Gregorian civil date -> Unix days (valid ISO dates only).
    let n = |a, b| s.get(a..b)?.parse::<i64>().ok();
    let (mut y, m, d, h, min, sec) = (
        n(0, 4)?,
        n(5, 7)?,
        n(8, 10)?,
        n(11, 13)?,
        n(14, 16)?,
        n(17, 19)?,
    );
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) || h > 23 || min > 59 || sec > 60 {
        return None;
    }
    y -= i64::from(m <= 2);
    let era = y.div_euclid(400);
    let yo = y - era * 400;
    let mp = m + if m > 2 { -3 } else { 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let days = era * 146097 + yo * 365 + yo / 4 - yo / 100 + doy - 719468;
    let tail = s.get(19..)?;
    let offset = if tail.ends_with('Z') {
        0
    } else {
        let i = tail.find(['+', '-'])?;
        let tz = &tail[i..];
        let hours = tz.get(1..3)?.parse::<i64>().ok()?;
        let mins = tz.get(4..6)?.parse::<i64>().ok()?;
        if hours > 23 || mins > 59 {
            return None;
        }
        (hours * 3600 + mins * 60) * if tz.starts_with('-') { -1 } else { 1 }
    };
    Some(days * 86400 + h * 3600 + min * 60 + sec - offset)
}
// Same key as the desktop widget's limits: windows without a pool belong to "main".
fn pool_hidden(visibility: &BTreeMap<String, bool>, provider: &str, window: &Value) -> bool {
    let pool = window["pool"]["id"].as_str().map(str::trim).filter(|id| !id.is_empty()).unwrap_or("main");
    visibility.get(&format!("{provider}/{pool}")) == Some(&false)
}
fn content(model: &Model, capacity: usize) -> (Vec<Row>, String) {
    let mut rows = Vec::new();
    let mut tips = Vec::new();
    let providers = model
        .snapshot
        .as_ref()
        .and_then(|s| s["providers"].as_array());
    for p in providers.into_iter().flatten() {
        if matches!(
            p["state"].as_str(),
            Some("DISABLED" | "NOT_INSTALLED" | "NO_SUBSCRIPTION")
        ) {
            continue;
        }
        let id = p["id"].as_str().unwrap_or("");
        let available: Vec<_> = p["windows"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|w| w["hidden_by_default"] != true)
            .collect();
        let windows: Vec<_> = available
            .iter()
            .copied()
            .filter(|w| !pool_hidden(&model.limit_visibility, id, w))
            .collect();
        // Hidden by choice; error states still need their row.
        if windows.is_empty() && !available.is_empty()
            && matches!(p["state"].as_str(), Some("OK" | "STALE" | "RATE_LIMITED")) {
            continue;
        }
        let name = p["label"].as_str().unwrap_or(id);
        let details = windows
            .iter()
            .map(|w| {
                format!(
                    "{}: {} · {}",
                    w["label"].as_str().unwrap_or("Quota"),
                    percent(w),
                    countdown(w)
                )
            })
            .collect::<Vec<_>>()
            .join("\n  ");
        tips.push(format!(
            "{} [{}{}]{}{}",
            name,
            p["state"].as_str().unwrap_or("UNKNOWN"),
            if p["stale"] == true { ", stale" } else { "" },
            if details.is_empty() { "" } else { "\n  " },
            details
        ));
        if !model.settings.providers.iter().any(|v| v == id) {
            continue;
        }
        let code = match id {
            "claude" => "CL".into(),
            "codex" => "CX".into(),
            "gemini" => "GM".into(),
            "copilot" => "CP".into(),
            _ => id.chars().take(2).collect::<String>().to_uppercase(),
        };
        let selected: Vec<_> = windows
            .into_iter()
            .filter(|w| match model.settings.window.as_str() {
                "weekly" => w["kind"] == "weekly",
                "both" => w["kind"] == "session" || w["kind"] == "weekly",
                _ => w["kind"] == "session" || w["kind"] == "short",
            })
            .collect();
        let worst = selected.iter().filter_map(|w| pct(w)).reduce(f64::max);
        let parts = selected
            .iter()
            .map(|w| {
                format!(
                    "{}{} · {}",
                    if model.settings.window == "both" {
                        if w["kind"] == "weekly" {
                            "W "
                        } else {
                            "S "
                        }
                    } else {
                        ""
                    },
                    percent(w),
                    countdown(w)
                )
            })
            .collect::<Vec<_>>();
        rows.push(Row {
            text: format!(
                "{} {}",
                code,
                if parts.is_empty() {
                    "—".into()
                } else {
                    parts.join(" | ")
                }
            ),
            pct: worst,
        });
    }
    // Stable ordering preserves the configured/snapshot order unless rows must be omitted.
    if rows.len() > capacity {
        rows.sort_by(|a, b| b.pct.unwrap_or(-1.).total_cmp(&a.pct.unwrap_or(-1.)));
        rows.truncate(capacity);
    }
    if rows.is_empty() {
        rows.push(Row {
            text: "AI —".into(),
            pct: None,
        });
    }
    (
        rows,
        if tips.is_empty() {
            "No quota data".into()
        } else {
            tips.join("\n\n")
        },
    )
}

struct Strip {
    app: tauri::AppHandle,
    model: Model,
    hook: HWINEVENTHOOK,
    shell: HWND,
    tooltip: HWND,
    tip: Vec<u16>,
    taskbar_created: u32,
    light: bool,
    background: u32,
    hover: bool,
    chip: bool,
    bounds: RECT,
    anchor: i32,
    dpi: u32,
    rows: Vec<Row>,
    bars: bool,
    drag: Option<(i32, i32)>,
    dragged: bool,
}
// Link directly to avoid adding a Cargo feature while another task owns the manifest.
#[link(name = "dwmapi")]
extern "system" {
    fn DwmGetColorizationColor(color: *mut u32, opaque: *mut i32) -> i32;
}
unsafe fn registry_dword(path: &[u16], name: &[u16], fallback: u32) -> u32 {
    let mut value = fallback;
    let mut size = 4;
    if RegGetValueW(HKEY_CURRENT_USER, path.as_ptr(), name.as_ptr(), RRF_RT_REG_DWORD,
        null_mut(), &mut value as *mut _ as _, &mut size) != 0 { return fallback; }
    value
}
fn luminance(color: u32) -> f64 {
    let channel = |shift: u32| {
        let v = ((color >> shift) & 255u32) as f64 / 255.;
        if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
    };
    0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}
fn contrast(a: u32, b: u32) -> f64 {
    let (a, b) = (luminance(a), luminance(b));
    (a.max(b) + 0.05) / (a.min(b) + 0.05)
}
fn composite(foreground: u32, background: u32) -> u32 {
    let alpha = foreground >> 24;
    let mut result = 0xff000000;
    for shift in [0, 8, 16] {
        let a = (foreground >> shift) & 255;
        let b = (background >> shift) & 255;
        result |= ((a * alpha + b * (255 - alpha) + 127) / 255) << shift;
    }
    result
}
fn readable(color: u32, background: u32) -> u32 {
    if contrast(color, background) >= 4.5 { return color; }
    let target = if contrast(0xff000000, background) > contrast(0xffffffff, background) { 0 } else { 0x00ffffff };
    // Preserve the warning hue where possible; move only as far as contrast requires.
    for alpha in 1..=255 {
        let adjusted = composite((alpha << 24) | target, color);
        if contrast(adjusted, background) >= 4.5 { return adjusted; }
    }
    target | 0xff000000
}
unsafe fn surface_theme(theme: &str) -> (bool, u32) {
    let system_light = registry_dword(&wide("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"), &wide("SystemUsesLightTheme"), 0) != 0;
    let light = match theme { "light" => true, "dark" => false, _ => system_light };
    let mut background = if light { 0xfff3f3f3 } else { 0xff202020 };
    // The taskbar toggle lives under Personalize, not DWM (that is the title bar toggle).
    if registry_dword(&wide("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"), &wide("ColorPrevalence"), 0) != 0 {
        let mut color = 0;
        let mut opaque = 0;
        if DwmGetColorizationColor(&mut color, &mut opaque) >= 0 { background = color | 0xff000000; }
    }
    (light, background)
}
unsafe fn rounded_fill(graphics: *mut GpGraphics, color: u32, width: f32, height: f32, radius: f32) {
    let mut path = null_mut();
    let mut brush = null_mut();
    if GdipCreatePath(FillModeAlternate, &mut path) != 0 { return; }
    let d = (radius * 2.).min(height).min(width);
    for (x, y, angle) in [(0., 0., 180.), (width-d, 0., 270.), (width-d, height-d, 0.), (0., height-d, 90.)] {
        GdipAddPathArc(path, x, y, d, d, angle, 90.);
    }
    GdipClosePathFigure(path);
    if GdipCreateSolidFill(color, &mut brush) == 0 {
        GdipFillPath(graphics, brush.cast(), path);
        GdipDeleteBrush(brush.cast());
    }
    GdipDeletePath(path);
}
unsafe extern "system" fn location_changed(
    _: HWINEVENTHOOK,
    _: u32,
    _: HWND,
    _: i32,
    _: i32,
    _: u32,
    _: u32,
) {
    wake();
}
unsafe fn rect(hwnd: HWND) -> Option<RECT> {
    let mut r = RECT::default();
    if !hwnd.is_null() && GetWindowRect(hwnd, &mut r) != 0 {
        Some(r)
    } else {
        None
    }
}
unsafe fn fullscreen(shell: HWND, strip: HWND) -> bool {
    let foreground = GetForegroundWindow();
    if foreground.is_null()
        || foreground == shell
        || foreground == strip
        || IsIconic(foreground) != 0
    {
        return false;
    }
    let mut class = [0u16; 128];
    let len = GetClassNameW(foreground, class.as_mut_ptr(), class.len() as i32);
    if matches!(
        String::from_utf16_lossy(&class[..len.max(0) as usize]).as_str(),
        "Progman" | "WorkerW"
    ) {
        return false;
    }
    let monitor = MonitorFromWindow(shell, MONITOR_DEFAULTTONEAREST);
    if MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST) != monitor {
        return false;
    }
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if GetMonitorInfoW(monitor, &mut info) == 0 {
        return false;
    }
    rect(foreground)
        .map(|r| {
            r.left <= info.rcMonitor.left
                && r.top <= info.rcMonitor.top
                && r.right >= info.rcMonitor.right
                && r.bottom >= info.rcMonitor.bottom
        })
        .unwrap_or(false)
}
impl Strip {
    unsafe fn refresh(&mut self, hwnd: HWND, force: bool) {
        if let Ok(m) = MODEL.get().unwrap().lock() {
            self.model = m.clone();
        }
        if !self.model.settings.enabled {
            PostMessageW(hwnd, WM_CLOSE, 0, 0);
            return;
        }
        let shell = FindWindowW(w!("Shell_TrayWnd"), null());
        if shell != self.shell || (self.hook.is_null() && !shell.is_null()) {
            if !self.hook.is_null() {
                UnhookWinEvent(self.hook);
            }
            self.shell = shell;
            self.hook = null_mut();
            if !shell.is_null() {
                let mut pid = 0;
                GetWindowThreadProcessId(shell, &mut pid);
                self.hook = SetWinEventHook(
                    EVENT_OBJECT_LOCATIONCHANGE,
                    EVENT_OBJECT_LOCATIONCHANGE,
                    null_mut(),
                    Some(location_changed),
                    pid,
                    0,
                    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
                );
            }
        }
        let mut bar = APPBARDATA {
            cbSize: size_of::<APPBARDATA>() as u32,
            ..Default::default()
        };
        let Some(taskbar) = rect(shell) else {
            ShowWindow(hwnd, SW_HIDE);
            return;
        };
        // Vertical taskbars have no safe left-of-tray horizontal placement.
        if !self.model.settings.enabled
            || taskbar.bottom - taskbar.top > taskbar.right - taskbar.left
            || SHAppBarMessage(ABM_GETSTATE, &mut bar) & ABS_AUTOHIDE as usize != 0
            || fullscreen(shell, hwnd)
        {
            ShowWindow(hwnd, SW_HIDE);
            return;
        }
        let tray = FindWindowExW(shell, null_mut(), w!("TrayNotifyWnd"), null());
        let Some(tray) = rect(tray).filter(|r| r.right > r.left && r.left > taskbar.left) else {
            ShowWindow(hwnd, SW_HIDE);
            return;
        };
        let dpi = GetDpiForWindow(shell).max(96);
        let scale = dpi as f32 / 96.;
        let height = taskbar.bottom - taskbar.top;
        let capacity = if height as f32 >= 52. * scale { 3 } else { 2 };
        let (rows, tip) = content(&self.model, capacity);
        let width = ((if self.model.settings.window == "both" {
            300.
        } else {
            156.
        }) * scale)
            .round() as i32;
        if tray.left - taskbar.left < width {
            ShowWindow(hwnd, SW_HIDE);
            return;
        }
        self.anchor = tray.left - width - (4. * scale) as i32;
        let x = self
            .anchor
            .saturating_add(self.model.settings.offset_x)
            .clamp(taskbar.left, tray.left - width);
        let content_height = ((rows.len() as f32 * 17. + 4.) * scale).round() as i32;
        let h = content_height.min(height);
        let y = taskbar.top + (height - h) / 2;
        let bounds = RECT {
            left: x,
            top: y,
            right: x + width,
            bottom: y + h,
        };
        let (light, background) = surface_theme(&self.model.settings.theme);
        let chip = self.model.settings.style == "chip";
        let redraw = force
            || rows != self.rows
            || self.bars != self.model.settings.show_bars
            || dpi != self.dpi
            || light != self.light
            || background != self.background
            || chip != self.chip
            || (bounds.left, bounds.top, bounds.right, bounds.bottom)
                != (
                    self.bounds.left,
                    self.bounds.top,
                    self.bounds.right,
                    self.bounds.bottom,
                );
        self.rows = rows;
        self.bars = self.model.settings.show_bars;
        self.dpi = dpi;
        self.light = light;
        self.background = background;
        self.chip = chip;
        self.bounds = bounds;
        if self.tip != wide(&tip) {
            self.tip = wide(&tip);
            let mut tool = self.tool(hwnd);
            SendMessageW(
                self.tooltip,
                TTM_UPDATETIPTEXTW,
                0,
                &mut tool as *mut _ as isize,
            );
        }
        if redraw {
            self.paint(hwnd);
            let mut tool = self.tool(hwnd);
            SendMessageW(
                self.tooltip,
                TTM_NEWTOOLRECTW,
                0,
                &mut tool as *mut _ as isize,
            );
        }
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x,
            y,
            width,
            h,
            SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOSENDCHANGING,
        );
    }
    unsafe fn tool(&mut self, hwnd: HWND) -> TTTOOLINFOW {
        TTTOOLINFOW {
            cbSize: size_of::<TTTOOLINFOW>() as u32,
            uFlags: TTF_SUBCLASS,
            hwnd,
            uId: 1,
            rect: RECT {
                left: 0,
                top: 0,
                right: self.bounds.right - self.bounds.left,
                bottom: self.bounds.bottom - self.bounds.top,
            },
            lpszText: self.tip.as_mut_ptr(),
            ..Default::default()
        }
    }
    unsafe fn paint(&self, hwnd: HWND) {
        let width = self.bounds.right - self.bounds.left;
        let height = self.bounds.bottom - self.bounds.top;
        let mut bi = BITMAPINFO::default();
        bi.bmiHeader = BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            ..Default::default()
        };
        let dc = CreateCompatibleDC(null_mut());
        let mut bits = null_mut();
        let dib = CreateDIBSection(dc, &bi, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
        if dc.is_null() || dib.is_null() {
            if !dib.is_null() {
                DeleteObject(dib);
            }
            if !dc.is_null() {
                DeleteDC(dc);
            }
            return;
        }
        // A fresh DIB has unspecified contents. Never publish uninitialized alpha.
        std::ptr::write_bytes(bits as *mut u8, 0, (width * height * 4) as usize);
        let old = SelectObject(dc, dib);
        let mut bitmap = null_mut();
        let mut graphics = null_mut();
        let mut family = null_mut();
        let mut font = null_mut();
        // Render into an owned PARGB bitmap, then explicitly copy locked pixels to the DIB.
        // Do not assume Graphics writes are reflected in an external scan0 buffer.
        let ok =
            GdipCreateBitmapFromScan0(width, height, 0, 0x000E200B, null(), &mut bitmap)
                == 0
                && GdipGetImageGraphicsContext(bitmap.cast(), &mut graphics) == 0
                && GdipCreateFontFamilyFromName(w!("Segoe UI"), null_mut(), &mut family) == 0
                && GdipCreateFont(
                    family,
                    12. * self.dpi as f32 / 96.,
                    FontStyleRegular,
                    UnitPixel,
                    &mut font,
                ) == 0;
        if ok {
            GdipGraphicsClear(graphics, 0);
            GdipSetTextRenderingHint(graphics, TextRenderingHintAntiAliasGridFit);
            GdipSetSmoothingMode(graphics, SmoothingModeAntiAlias);
            let ink_dark = contrast(0xff000000, self.background) > contrast(0xffffffff, self.background);
            let mut text_background = self.background;
            for (visible, overlay) in [
                (self.chip, if ink_dark { 0x0f000000 } else { 0x14ffffff }),
                (self.hover, if ink_dark { 0x0d000000 } else { 0x0fffffff }),
            ] {
                if visible {
                    rounded_fill(graphics, overlay, width as f32, height as f32, 4. * self.dpi as f32 / 96.);
                    text_background = composite(overlay, text_background);
                }
            }
            let scale = self.dpi as f32 / 96.;
            let line_height = height as f32 / self.rows.len() as f32;
            for (i, row) in self.rows.iter().enumerate() {
                let mono = self.model.settings.color_mode == "mono";
                let color = match row.pct {
                    _ if mono => if self.light { 0xff000000 } else { 0xffffffff },
                    Some(p) if p >= 80. => {
                        if self.light {
                            0xffb91c1c
                        } else {
                            0xffff6969
                        }
                    }
                    Some(p) if p >= 50. => {
                        if self.light {
                            0xff855500
                        } else {
                            0xffffce54
                        }
                    }
                    _ => {
                        if self.light {
                            0xff1b1b1b
                        } else {
                            0xfff3f3f3
                        }
                    }
                };
                let color = readable(color, text_background);
                let mut brush = null_mut();
                if GdipCreateSolidFill(color, &mut brush) != 0 {
                    continue;
                }
                let y = i as f32 * line_height;
                let mut x = 2. * scale;
                let mut secondary = false;
                let mut format = null_mut();
                GdipStringFormatGetGenericTypographic(&mut format);
                if !format.is_null() { GdipSetStringFormatFlags(format, StringFormatFlagsMeasureTrailingSpaces | StringFormatFlagsNoWrap); }
                for token in row.text.split(' ') {
                    if token == "·" { secondary = true; }
                    if token == "|" { secondary = false; }
                    let text = wide(&format!("{token} "));
                    let layout = RectF { X: x, Y: y, Width: width as f32 - x, Height: line_height };
                    if layout.Width <= 0. { break; }
                    let mut bounds = RectF::default();
                    GdipMeasureString(graphics, text.as_ptr(), (text.len()-1) as i32, font, &layout, format, &mut bounds, null_mut(), null_mut());
                    let mut secondary_brush = null_mut();
                    let secondary_color = readable(if self.light { 0xff626262 } else { 0xffb0b0ba }, text_background);
                    GdipCreateSolidFill(secondary_color, &mut secondary_brush);
                    let inverse = mono && token.trim_end_matches('*').trim_end_matches('%').parse::<f64>().map(|p|p >= 80.).unwrap_or(false) && token.contains('%');
                    let mut inverse_brush = null_mut();
                    if inverse {
                        GdipFillRectangle(graphics, brush.cast(), x, y, bounds.Width, line_height);
                        GdipCreateSolidFill(if self.light { 0xffffffff } else { 0xff000000 }, &mut inverse_brush);
                    }
                    GdipDrawString(graphics, text.as_ptr(), (text.len()-1) as i32, font, &layout, format,
                        if inverse && !inverse_brush.is_null() { inverse_brush.cast() } else if secondary && !secondary_brush.is_null() { secondary_brush.cast() } else { brush.cast() });
                    if !inverse_brush.is_null() { GdipDeleteBrush(inverse_brush.cast()); }
                    if !secondary_brush.is_null() { GdipDeleteBrush(secondary_brush.cast()); }
                    x += bounds.Width;
                }
                if !format.is_null() { GdipDeleteStringFormat(format); }
                if self.bars {
                    let count = match self.model.settings.dot_count { 10 => 10, 30 => 30, _ => 20 };
                    let active = (row.pct.unwrap_or(0.) * count as f64 / 100.).round() as i32;
                    let mut pen = null_mut();
                    GdipCreatePen1(color, scale, UnitPixel, &mut pen);
                    for dot in 0..count {
                        let dx = 4. * scale + dot as f32 * 3. * scale;
                        let dy = y + line_height - 3. * scale;
                        if dot < active {
                            if mono && row.pct.unwrap_or(0.) >= 50. && dot >= count / 2 - 1 && !pen.is_null() {
                                GdipDrawEllipse(graphics, pen, dx, dy, 2. * scale, 2. * scale);
                            } else { GdipFillEllipse(graphics, brush.cast(), dx, dy, 2. * scale, 2. * scale); }
                        } else if !pen.is_null() { GdipDrawEllipse(graphics, pen, dx, dy, scale, scale); }
                    }
                    if !pen.is_null() { GdipDeletePen(pen); }
                }
                GdipDeleteBrush(brush.cast());
            }
        }
        // Dispose graphics to flush its writes before publishing the bitmap to DWM.
        if !graphics.is_null() {
            GdipDeleteGraphics(graphics);
        }
        let mut pixels = BitmapData::default();
        let copied = ok && GdipBitmapLockBits(bitmap, null(), ImageLockModeRead as u32, 0x000E200B, &mut pixels) == 0;
        if copied {
            for y in 0..height as usize {
                std::ptr::copy_nonoverlapping((pixels.Scan0 as *const u8).offset(y as isize * pixels.Stride as isize),
                    (bits as *mut u8).add(y * width as usize * 4), width as usize * 4);
            }
            GdipBitmapUnlockBits(bitmap, &mut pixels);
            UpdateLayeredWindow(
                hwnd,
                null_mut(),
                &POINT {
                    x: self.bounds.left,
                    y: self.bounds.top,
                },
                &SIZE {
                    cx: width,
                    cy: height,
                },
                dc,
                &POINT { x: 0, y: 0 },
                0,
                &BLENDFUNCTION {
                    BlendOp: AC_SRC_OVER as u8,
                    BlendFlags: 0,
                    SourceConstantAlpha: 255,
                    AlphaFormat: AC_SRC_ALPHA as u8,
                },
                ULW_ALPHA,
            );
        }
        if !font.is_null() {
            GdipDeleteFont(font);
        }
        if !family.is_null() {
            GdipDeleteFontFamily(family);
        }
        if !bitmap.is_null() {
            GdipDisposeImage(bitmap.cast());
        }
        SelectObject(dc, old);
        DeleteObject(dib);
        DeleteDC(dc);
    }
    fn open(&self, settings: bool) {
        if let Some(window) = self.app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            if settings {
                let _ = window.emit("open-settings", ());
            }
        }
    }
    fn persist(&mut self) {
        let mut settings = load_settings();
        settings.taskbar = self.model.settings.clone();
        let result = self.app.get_webview_window("main")
            .ok_or_else(|| "Widget window is unavailable".to_string())
            .and_then(|_| save_settings(self.app.clone(), settings));
        match result {
            Ok(()) => {
                let _ = self
                    .app
                    .emit("taskbar-settings-changed", &self.model.settings);
            }
            Err(error) => {
                let _ = self
                    .app
                    .emit("refresh-error", format!("Taskbar settings: {error}"));
            }
        }
    }
}
// Native calls can synchronously reenter a window procedure (capture, tooltip,
// popup menu message loops). Never create overlapping mutable references to Strip.
thread_local! { static IN_PROCEDURE: Cell<bool> = const { Cell::new(false) }; }
struct ProcedureGuard;
impl Drop for ProcedureGuard {
    fn drop(&mut self) {
        IN_PROCEDURE.with(|busy| busy.set(false));
    }
}
unsafe extern "system" fn procedure(hwnd: HWND, message: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut Strip;
    if ptr.is_null() {
        return DefWindowProcW(hwnd, message, wp, lp);
    }
    if IN_PROCEDURE.with(|busy| busy.replace(true)) {
        return DefWindowProcW(hwnd, message, wp, lp);
    }
    let _guard = ProcedureGuard;
    let s = &mut *ptr;
    if message == s.taskbar_created {
        s.shell = null_mut();
        s.refresh(hwnd, true);
        return 0;
    }
    match message {
        UPDATE | WM_TIMER => {
            s.refresh(hwnd, message == UPDATE);
            0
        }
        WM_SETTINGCHANGE | WM_DPICHANGED | WM_DISPLAYCHANGE | WM_DWMCOLORIZATIONCOLORCHANGED => {
            s.refresh(hwnd, true);
            0
        }
        WM_ERASEBKGND => 1,
        WM_MOUSELEAVE => { s.hover = false; s.paint(hwnd); 0 }
        WM_MOUSEMOVE if s.drag.is_none() => {
            if !s.hover {
                s.hover = true;
                let mut track = TRACKMOUSEEVENT { cbSize: size_of::<TRACKMOUSEEVENT>() as u32, dwFlags: TME_LEAVE, hwndTrack: hwnd, dwHoverTime: 0 };
                TrackMouseEvent(&mut track);
                s.paint(hwnd);
            }
            0
        }
        WM_MOUSEACTIVATE => MA_NOACTIVATE as isize,
        WM_LBUTTONDOWN => {
            let mut point = POINT::default();
            GetCursorPos(&mut point);
            s.drag = Some((point.x, s.model.settings.offset_x));
            s.dragged = false;
            SetCapture(hwnd);
            0
        }
        WM_MOUSEMOVE if s.drag.is_some() => {
            let (start, offset) = s.drag.unwrap();
            let mut point = POINT::default();
            GetCursorPos(&mut point);
            if (point.x - start).abs() >= (4 * s.dpi / 96) as i32 {
                s.dragged = true;
            }
            if s.dragged {
                s.model.settings.offset_x = offset.saturating_add(point.x - start);
                if let Ok(mut m) = MODEL.get().unwrap().lock() {
                    m.settings.offset_x = s.model.settings.offset_x;
                }
                s.refresh(hwnd, false);
                s.model.settings.offset_x = s.bounds.left - s.anchor;
            }
            0
        }
        WM_LBUTTONUP => {
            let dragging = s.drag.take().is_some();
            ReleaseCapture();
            if dragging {
                if s.dragged {
                    s.persist();
                } else {
                    s.open(false);
                }
            }
            0
        }
        WM_CAPTURECHANGED => {
            if s.drag.take().is_some() && s.dragged {
                s.persist();
            }
            0
        }
        WM_RBUTTONUP => {
            let menu = CreatePopupMenu();
            if !menu.is_null() {
                AppendMenuW(menu, MF_STRING, 1, w!("Hide taskbar strip"));
                AppendMenuW(menu, MF_STRING, 2, w!("Settings"));
                let mut point = POINT::default();
                GetCursorPos(&mut point);
                SetForegroundWindow(hwnd);
                let choice = TrackPopupMenu(
                    menu,
                    TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON,
                    point.x,
                    point.y,
                    0,
                    hwnd,
                    null(),
                );
                DestroyMenu(menu);
                PostMessageW(hwnd, WM_NULL, 0, 0);
                if choice == 1 {
                    s.model.settings.enabled = false;
                    s.persist();
                    s.refresh(hwnd, false);
                } else if choice == 2 {
                    s.open(true);
                }
            }
            0
        }
        WM_CLOSE => {
            PostQuitMessage(0);
            0
        }
        WM_DESTROY => {
            WINDOW.store(0, Ordering::Release);
            KillTimer(hwnd, 1);
            if !s.hook.is_null() {
                UnhookWinEvent(s.hook);
                s.hook = null_mut();
            }
            DestroyWindow(s.tooltip);
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, message, wp, lp),
    }
}
pub(super) fn start(app: tauri::AppHandle) {
    let _ = APP.set(app);
    let settings = load_settings();
    let _ = MODEL.set(Mutex::new(Model { settings: settings.taskbar.clone(), limit_visibility: settings.limit_visibility.clone(), snapshot: read_snapshot() }));
    update_settings(settings.taskbar, settings.limit_visibility);
}
fn spawn_strip(app: tauri::AppHandle) -> std::thread::JoinHandle<()> {
    std::thread::Builder::new()
        .name("taskbar-strip".into())
        .spawn(move || unsafe {
            IS_STRIP.with(|flag| flag.set(true));
            loop {
            // Settings may have been disabled before the new thread was scheduled.
            if !MODEL.get().unwrap().lock().unwrap().settings.enabled { return; }
            SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
            let mut token = 0;
            let input = GdiplusStartupInput {
                GdiplusVersion: 1,
                ..Default::default()
            };
            if GdiplusStartup(&mut token, &input, null_mut()) != 0 {
                let _ = app.emit("refresh-error", "Taskbar graphics initialization failed");
                return;
            }
            let instance = GetModuleHandleW(null());
            let class = WNDCLASSW {
                lpfnWndProc: Some(procedure),
                hInstance: instance,
                lpszClassName: w!("AIUsageTaskbarStrip"),
                hCursor: LoadCursorW(null_mut(), IDC_ARROW),
                ..Default::default()
            };
            RegisterClassW(&class);
            let hwnd = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED | WS_EX_NOACTIVATE,
                class.lpszClassName,
                w!("AI Usage"),
                WS_POPUP,
                0,
                0,
                1,
                1,
                null_mut(),
                null_mut(),
                instance,
                null(),
            );
            if hwnd.is_null() {
                GdiplusShutdown(token);
                let _ = app.emit("refresh-error", "Taskbar window creation failed");
                return;
            }
            InitCommonControlsEx(&INITCOMMONCONTROLSEX {
                dwSize: size_of::<INITCOMMONCONTROLSEX>() as u32,
                dwICC: ICC_WIN95_CLASSES,
            });
            let tooltip = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_NOACTIVATE,
                TOOLTIPS_CLASSW,
                null(),
                WS_POPUP | TTS_ALWAYSTIP | TTS_NOPREFIX,
                0,
                0,
                0,
                0,
                hwnd,
                null_mut(),
                instance,
                null(),
            );
            let mut state = Box::new(Strip {
                app: app.clone(),
                model: MODEL.get().unwrap().lock().unwrap().clone(),
                hook: null_mut(),
                shell: null_mut(),
                tooltip,
                tip: wide("No quota data"),
                taskbar_created: RegisterWindowMessageW(w!("TaskbarCreated")),
                light: false,
                background: 0xff202020,
                hover: false,
                chip: false,
                bounds: RECT::default(),
                anchor: 0,
                dpi: 96,
                rows: vec![],
                bars: false,
                drag: None,
                dragged: false,
            });
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, &mut *state as *mut Strip as isize);
            let mut tool = state.tool(hwnd);
            SendMessageW(tooltip, TTM_ADDTOOLW, 0, &mut tool as *mut _ as isize);
            SendMessageW(tooltip, TTM_SETMAXTIPWIDTH, 0, 600);
            WINDOW.store(hwnd as isize, Ordering::Release);
            SetTimer(hwnd, 1, 1000, None);
            PostMessageW(hwnd, UPDATE, 0, 0);
            let mut message = MSG::default();
            while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            // Cleanup outside the guarded callback: DestroyWindow synchronously
            // reenters the procedure, where the reentrancy guard can skip WM_DESTROY.
            WINDOW.store(0, Ordering::Release);
            KillTimer(hwnd, 1);
            if !state.hook.is_null() { UnhookWinEvent(state.hook); state.hook = null_mut(); }
            if !state.tooltip.is_null() { DestroyWindow(state.tooltip); state.tooltip = null_mut(); }
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            if IsWindow(hwnd) != 0 { DestroyWindow(hwnd); }
            GdiplusShutdown(token);
            // A rapid re-enable during teardown reuses this thread and recreates
            // its resources; an off state exits without leaving a worker behind.
            }
        })
        .expect("unable to start taskbar GUI thread")
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn model(window: &str) -> Model {
        Model {
            settings: TaskbarSettings {
                window: window.into(),
                ..Default::default()
            },
            limit_visibility: BTreeMap::new(),
            snapshot: Some(json!({"providers": [
                {"id":"claude", "label":"Claude", "state":"OK", "windows":[
                    {"kind":"session", "label":"Session", "used_percent":34, "resets_in_minutes":161},
                    {"kind":"weekly", "label":"Weekly", "used_percent":91},
                    {"kind":"session", "label":"Private extra", "used_percent":99, "hidden_by_default":true}]},
                {"id":"codex", "state":"STALE", "stale":true, "windows":[{"kind":"session", "used_percent":80}]},
                {"id":"gemini", "state":"OK", "windows":[{"kind":"session", "used_percent":51}]},
                {"id":"copilot", "state":"NOT_INSTALLED", "windows":[{"kind":"session", "used_percent":100}]}
            ]})),
        }
    }
    #[test]
    fn accent_text_meets_contrast_with_chip_and_hover() {
        for r in (0..=255u32).step_by(17) {
            for g in (0..=255u32).step_by(17) {
                for b in (0..=255u32).step_by(17) {
                    let base = 0xff000000 | r << 16 | g << 8 | b;
                    for overlay in [0x00000000, 0x0f000000, 0x14ffffff, 0x0d000000, 0x0fffffff] {
                        let bg = composite(overlay, base);
                        for text in [0xff1b1b1b, 0xfff3f3f3, 0xff626262, 0xffb0b0ba, 0xff855500, 0xffffce54, 0xffb91c1c, 0xffff6969] {
                            assert!(contrast(readable(text, bg), bg) >= 4.5);
                        }
                    }
                }
            }
        }
        assert_eq!(composite(0x00000000, 0xfff3f3f3), 0xfff3f3f3);
        assert_eq!(readable(0xff1b1b1b, 0xfff3f3f3), 0xff1b1b1b);
    }
    #[test]
    fn crowded_taskbar_promotes_critical_providers_and_retains_full_tooltip() {
        let (rows, tip) = content(&model("session"), 2);
        assert_eq!(rows.len(), 2);
        assert!(rows[0].text.starts_with("CX 80%"));
        assert!(rows[1].text.starts_with("GM 51%"));
        assert!(tip.contains("Claude") && tip.contains("Weekly: 91%"));
        assert!(!tip.contains("Private extra") && !tip.contains("copilot"));
    }
    #[test]
    fn both_mode_retains_one_row_per_provider_and_uses_worst_percentage() {
        let (rows, _) = content(&model("both"), 3);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].pct, Some(91.));
        assert!(rows[0].text.contains("S 34% · 2h41 | W 91%"));
        let (rows, _) = content(&model("both"), 2);
        assert!(rows[0].text.starts_with("CL"));
    }
    #[test]
    fn hidden_pools_leave_rows_and_tooltip() {
        let mut m = model("both");
        let claude = &mut m.snapshot.as_mut().unwrap()["providers"][0]["windows"];
        claude.as_array_mut().unwrap().push(json!({"kind":"weekly", "label":"Nova", "used_percent":97, "pool":{"id":" nova "}}));
        assert_eq!(content(&m, 3).0[0].pct, Some(97.));
        m.limit_visibility = BTreeMap::from([("claude/nova".into(), false), ("codex/main".into(), false), ("gemini/main".into(), true)]);
        let (rows, tip) = content(&m, 3);
        assert_eq!(rows.iter().map(|r| &r.text[..2]).collect::<Vec<_>>(), ["CL", "GM"]);
        assert_eq!(rows[0].pct, Some(91.));
        assert!(!tip.contains("Nova") && !tip.contains("codex"));
        m.snapshot.as_mut().unwrap()["providers"][1]["state"] = json!("AUTH_REQUIRED");
        let (rows, tip) = content(&m, 3);
        assert_eq!(rows[1].text, "CX —");
        assert!(tip.contains("AUTH_REQUIRED") && !tip.contains("80%"));
    }
    #[test]
    fn filter_and_unknown_weekly_usage_are_independent_of_desktop_settings() {
        let mut m = model("weekly");
        m.settings.providers = vec!["codex".into()];
        let (rows, _) = content(&m, 2);
        assert_eq!(
            rows,
            vec![Row {
                text: "CX —".into(),
                pct: None
            }]
        );
    }
    #[test]
    fn timestamp_offsets_and_fractional_seconds_are_equivalent() {
        assert_eq!(parse_timestamp("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            parse_timestamp("2026-11-01T15:30:00.123+02:00"),
            parse_timestamp("2026-11-01T13:30:00Z")
        );
        assert_eq!(
            parse_timestamp("2026-11-01T08:30:00-05:00"),
            parse_timestamp("2026-11-01T13:30:00Z")
        );
        assert_eq!(parse_timestamp("bad"), None);
        assert_eq!(parse_timestamp("2026-99-01T13:30:00Z"), None);
    }
    #[test]
    fn legacy_settings_default_to_disabled_and_partial_taskbar_settings_migrate() {
        let settings: TaskbarSettings = serde_json::from_value(json!({"enabled":true})).unwrap();
        assert!(settings.enabled);
        assert_eq!(settings.providers.len(), 3);
        assert_eq!(settings.offset_x, 0);
        assert_eq!(settings.style, "transparent");
        assert_eq!(settings.theme, "auto");
        let mut legacy = serde_json::to_value(super::super::Settings::default()).unwrap();
        legacy.as_object_mut().unwrap().remove("appearance");
        legacy.as_object_mut().unwrap().remove("taskbar");
        let legacy: super::super::Settings = serde_json::from_value(legacy).unwrap();
        assert_eq!(legacy.appearance, "auto");
        assert_eq!(legacy.taskbar.style, "transparent");
        assert!(!TaskbarSettings::default().enabled);
    }
}
