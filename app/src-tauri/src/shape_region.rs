//! Native input masks. GTK receives logical pixels; Win32 receives physical pixels.
use crate::Shape;
use std::{collections::HashMap, sync::{Arc, LazyLock, Mutex, atomic::{AtomicBool, AtomicU64, Ordering}}};
#[derive(Default)]
struct State {
    onboarding: AtomicBool,
    running: AtomicBool,
    revision: AtomicU64,
    last: Mutex<Option<(Shape,i32,i32,i32,i32)>>,
}
static STATES: LazyLock<Mutex<HashMap<String, Arc<State>>>> = LazyLock::new(Mutex::default);
fn state_for(states: &mut HashMap<String, Arc<State>>, label: &str) -> Arc<State> {
    states.entry(label.into()).or_default().clone()
}
fn state(label: &str) -> Arc<State> {
    state_for(&mut STATES.lock().unwrap_or_else(|e| e.into_inner()), label)
}

#[cfg(any(windows,test))]
fn client_region_bounds(width: i32, height: i32, offset_x: i32, offset_y: i32) -> (i32,i32,i32,i32) {
    (offset_x, offset_y, offset_x + width, offset_y + height)
}

// Scanline rectangles use pixel centers, so the boundary never captures transparent corners.
#[cfg(any(target_os="linux",test))]
pub(crate) fn scanlines(shape: &Shape, width: i32, height: i32) -> Vec<(i32,i32,i32,i32)> {
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
// Blur has its own mask; input and window shaping continue to use scanlines.
#[cfg(any(target_os="linux",test))]
pub(crate) fn blur_scanlines(shape: &Shape, width: i32, height: i32, radius: f64) -> Vec<(i32,i32,i32,i32)> {
    if matches!(shape, Shape::Circle | Shape::Pill) || !radius.is_finite() || radius <= 0.0 {
        return scanlines(shape, width, height);
    }
    if width <= 0 || height <= 0 { return vec![]; }
    let radius = radius.min(width.min(height) as f64 / 2.0);
    (0..height).filter_map(|y| {
        let cy = (y as f64 + 0.5).clamp(radius, height as f64 - radius);
        let dy = y as f64 + 0.5 - cy;
        let inset = radius - (radius * radius - dy * dy).max(0.0).sqrt();
        let left = (inset - 0.5).ceil().max(0.0) as i32;
        let row_width = width - 2 * left;
        (row_width > 0).then_some((left, y, row_width, 1))
    }).collect()
}
#[cfg(target_os="linux")]
pub(crate) fn window_scanlines(window: &tauri::WebviewWindow, radius: f64) -> Result<Vec<(i32,i32,i32,i32)>, String> {
    use gtk::prelude::*;
    let widget = window.gtk_window().map_err(|e| e.to_string())?;
    let shape = effective_shape(crate::settings_window::current_for(window.label()).shape, state(window.label()).onboarding.load(Ordering::SeqCst));
    Ok(blur_scanlines(&shape, widget.allocated_width(), widget.allocated_height(), radius))
}
fn effective_shape(shape: Shape, onboarding: bool) -> Shape {
    if onboarding { Shape::Portrait } else { shape }
}
pub fn set_onboarding(window: &tauri::WebviewWindow, active: bool) {
    if state(window.label()).onboarding.swap(active, Ordering::SeqCst) != active { request(window); }
}
pub fn request(window: &tauri::WebviewWindow) {
    let state = state(window.label());
    state.revision.fetch_add(1,Ordering::SeqCst);
    if state.running.swap(true,Ordering::SeqCst) {return;}
    let window=window.clone();
    std::thread::spawn(move || {
        loop {
            let revision=state.revision.load(Ordering::SeqCst);
            std::thread::sleep(std::time::Duration::from_millis(40));
            if revision!=state.revision.load(Ordering::SeqCst) {continue;}
            let target=window.clone();
            let _=window.run_on_main_thread(move || { let _=apply(&target); });
            state.running.store(false,Ordering::SeqCst);
            if revision!=state.revision.load(Ordering::SeqCst) {request(&window);}
            break;
        }
    });
}
fn apply(window: &tauri::WebviewWindow) -> Result<(),String> {
    let shape=effective_shape(crate::settings_window::current_for(window.label()).shape, state(window.label()).onboarding.load(Ordering::SeqCst));
    let size=window.inner_size().map_err(|e|e.to_string())?;
    #[cfg(target_os="linux")]
    let (width,height)={use gtk::prelude::*;let widget=window.gtk_window().map_err(|e|e.to_string())?;(widget.allocated_width(),widget.allocated_height())};
    #[cfg(not(target_os="linux"))]
    let (width,height)=(size.width as i32,size.height as i32);
    let _=size;
    if width<=1 || height<=1 {return Ok(());}
    #[cfg(windows)]
    let (offset_x,offset_y)={
        let outer=window.outer_position().map_err(|e|e.to_string())?;
        let inner=window.inner_position().map_err(|e|e.to_string())?;
        (inner.x-outer.x,inner.y-outer.y)
    };
    #[cfg(not(windows))]
    let (offset_x,offset_y)=(0,0);
    #[cfg(target_os="linux")]
    crate::window_effects::apply(window, &crate::settings_window::current_for(window.label()).theme);
    let state=state(window.label());
    let mut last=state.last.lock().unwrap_or_else(|e|e.into_inner());
    let key=(shape.clone(),width,height,offset_x,offset_y);
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
        let (left,top,right,bottom)=client_region_bounds(width,height,offset_x,offset_y);
        let region=match shape {Shape::Circle=>CreateEllipticRgn(left,top,right,bottom),Shape::Pill=>CreateRoundRectRgn(left,top,right+1,bottom+1,height,height),_=>std::ptr::null_mut()};
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
    fn windows_region_bounds_cover_the_offset_client_rectangle() {
        assert_eq!(client_region_bounds(425,425,9,5),(9,5,434,430));
        assert_eq!(client_region_bounds(600,150,9,5),(9,5,609,155));
    }
    #[test]
    fn rounded_blur_is_clamped_symmetric_and_separate_from_input() {
        for shape in [Shape::Portrait, Shape::Landscape, Shape::Square] {
            for (w,h) in [(340,600),(680,340),(340,340),(31,15)] {
                let rows = blur_scanlines(&shape,w,h,6.0);
                assert_eq!(rows.len(),h as usize);
                assert!(rows[0].0 > 0 && rows[0].2 < w);
                assert_eq!(rows[h as usize/2],(0,h/2,w,1));
                for (top,bottom) in rows.iter().zip(rows.iter().rev()) {
                    assert_eq!((top.0,top.2),(bottom.0,bottom.2));
                    assert_eq!(top.0 * 2 + top.2,w);
                    assert!(top.0 >= 0 && top.2 > 0);
                }
                assert_eq!(blur_scanlines(&shape,w,h,10000.0),blur_scanlines(&shape,w,h,w.min(h) as f64/2.0));
                for radius in [0.0,-1.0,f64::NAN,f64::INFINITY] {
                    assert_eq!(blur_scanlines(&shape,w,h,radius),vec![(0,0,w,h)]);
                }
                assert_eq!(scanlines(&shape,w,h),vec![(0,0,w,h)]);
            }
        }
        for shape in [Shape::Circle, Shape::Pill] {
            assert_eq!(blur_scanlines(&shape,480,120,22.0),scanlines(&shape,480,120));
        }
        assert!(blur_scanlines(&Shape::Square,0,100,22.0).is_empty());
        assert!(blur_scanlines(&Shape::Portrait,100,-1,22.0).is_empty());
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

#[cfg(test)]
#[path = "../../../tests/shape-label-state.rs"]
mod label_tests;
