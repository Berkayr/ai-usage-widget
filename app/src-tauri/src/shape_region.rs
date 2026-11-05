//! Native input masks. GTK receives logical pixels; Win32 receives physical pixels.
use crate::Shape;
use std::sync::{Mutex, atomic::{AtomicBool, AtomicU64, Ordering}};
static ONBOARDING: AtomicBool = AtomicBool::new(false);
static RUNNING: AtomicBool = AtomicBool::new(false);
static REVISION: AtomicU64 = AtomicU64::new(0);
static LAST: Mutex<Option<(Shape,i32,i32)>> = Mutex::new(None);

// Scanline rectangles use pixel centers, so the boundary never captures transparent corners.
#[cfg(any(target_os="linux",test))]
fn scanlines(shape: &Shape, width: i32, height: i32) -> Vec<(i32,i32,i32,i32)> {
    if width<=0 || height<=0 {return vec![];}
    if !matches!(shape,Shape::Circle|Shape::Pill) {return vec![(0,0,width,height)];}
    let (w,h)=(width as f64,height as f64);
    (0..height).filter_map(|y| {
        let dy=(y as f64+0.5-h/2.0)/(h/2.0);
        let half=if *shape==Shape::Circle {w/2.0*(1.0-dy*dy).max(0.0).sqrt()} else {(w-h).max(0.0)/2.0+h/2.0*(1.0-dy*dy).max(0.0).sqrt()};
        let left=(w/2.0-half-0.5).ceil().max(0.0) as i32;
        let right=(w/2.0+half-0.5).floor().min(w-1.0) as i32;
        (right>=left).then_some((left,y,right-left+1,1))
    }).collect()
}
fn effective_shape(shape: Shape, onboarding: bool) -> Shape {
    if onboarding { Shape::Portrait } else { shape }
}
pub fn set_onboarding(window: &tauri::WebviewWindow, active: bool) {
    if ONBOARDING.swap(active, Ordering::SeqCst) != active { request(window); }
}
pub fn request(window: &tauri::WebviewWindow) {
    REVISION.fetch_add(1,Ordering::SeqCst);
    if RUNNING.swap(true,Ordering::SeqCst) {return;}
    let window=window.clone();
    std::thread::spawn(move || {
        loop {
            let revision=REVISION.load(Ordering::SeqCst);
            std::thread::sleep(std::time::Duration::from_millis(40));
            if revision!=REVISION.load(Ordering::SeqCst) {continue;}
            let target=window.clone();
            let _=window.run_on_main_thread(move || { let _=apply(&target); });
            RUNNING.store(false,Ordering::SeqCst);
            if revision!=REVISION.load(Ordering::SeqCst) {request(&window);}
            break;
        }
    });
}
fn apply(window: &tauri::WebviewWindow) -> Result<(),String> {
    let shape=effective_shape(crate::settings_window::current().shape, ONBOARDING.load(Ordering::SeqCst));
    let size=window.inner_size().map_err(|e|e.to_string())?;
    #[cfg(target_os="linux")]
    let (width,height)={use gtk::prelude::*;let widget=window.gtk_window().map_err(|e|e.to_string())?;(widget.allocated_width(),widget.allocated_height())};
    #[cfg(not(target_os="linux"))]
    let (width,height)=(size.width as i32,size.height as i32);
    let _=size;
    if width<=1 || height<=1 {return Ok(());}
    let mut last=LAST.lock().unwrap_or_else(|e|e.into_inner());
    let key=(shape.clone(),width,height);
    if last.as_ref()==Some(&key) {return Ok(());}
    #[cfg(target_os="linux")]
    {
        use gtk::{prelude::*,cairo::{Region,RectangleInt}};
        let widget=window.gtk_window().map_err(|e|e.to_string())?;
        let region=Region::create();
        for (x,y,w,h) in scanlines(&shape,width,height) {region.union_rectangle(&RectangleInt::new(x,y,w,h)).map_err(|e|e.to_string())?;}
        widget.input_shape_combine_region(Some(&region));
    }
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Graphics::Gdi::*;
        let hwnd=window.hwnd().map_err(|e|e.to_string())?.0 as _;
        let region=match shape {Shape::Circle=>CreateEllipticRgn(0,0,width,height),Shape::Pill=>CreateRoundRectRgn(0,0,width+1,height+1,height,height),_=>std::ptr::null_mut()};
        if matches!(shape,Shape::Circle|Shape::Pill) && region.is_null(){return Err("Cannot create window region".into());}
        if SetWindowRgn(hwnd,region,1)==0 {if !region.is_null(){DeleteObject(region);}return Err("Cannot apply window region".into());}
        // Successful SetWindowRgn transfers ownership to the OS.
    }
    *last=Some(key);Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn onboarding_uses_rectangular_region_without_changing_saved_shape() {
        for shape in [Shape::Circle, Shape::Pill, Shape::Square] {
            assert!(effective_shape(shape.clone(), true) == Shape::Portrait);
            assert!(effective_shape(shape.clone(), false) == shape);
        }
    }
    #[test]
    fn masks_follow_shape_and_dpi() {
        for dpi in [1.0,1.5,2.0] {for shape in [Shape::Circle,Shape::Pill] {
            let w=((if shape==Shape::Circle {340.0} else {480.0})*dpi) as i32;
            let h=((if shape==Shape::Circle {340.0} else {120.0})*dpi) as i32;
            let rows=scanlines(&shape,w,h);assert_eq!(rows.len(),h as usize);
            assert!(rows[0].0>0);assert_eq!(rows[h as usize/2].2,w);
            assert_eq!(rows[0].0,rows.last().unwrap().0);
            for (x,y,width,_) in rows {
                assert!(x>=0&&x+width<=w&&y<h);
                for px in [x,x+width-1] {
                    let dx=if shape==Shape::Circle {(px as f64+0.5-w as f64/2.0)/(w as f64/2.0)} else {
                        let center=(px as f64+0.5).clamp(h as f64/2.0,w as f64-h as f64/2.0);
                        (px as f64+0.5-center)/(h as f64/2.0)
                    };
                    let dy=(y as f64+0.5-h as f64/2.0)/(h as f64/2.0);
                    assert!(dx*dx+dy*dy<=1.0+1e-9);
                }
            }
        }}
        assert_eq!(scanlines(&Shape::Square,340,340),vec![(0,0,340,340)]);
        assert!(scanlines(&Shape::Circle,0,0).is_empty());
    }
}
