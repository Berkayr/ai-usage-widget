use super::*;
#[test]
fn state_paths_preserve_legacy_main_and_isolate_other_widgets() {
    assert_eq!(window_state_filename(widgets::MAIN_ID).unwrap(), "window.json");
    assert_eq!(window_state_filename("widget-side-2").unwrap(), "window-side-2.json");
    let directory = settings_path().parent().unwrap().to_path_buf();
    assert_eq!(window_path(widgets::MAIN_ID).unwrap(), directory.join("window.json"));
    assert_eq!(window_path("widget-side-2").unwrap(), directory.join("window-side-2.json"));
    for label in ["settings", "widget-../escape", "widget-a/b", "widget-main"] {
        assert!(window_path(label).is_err());
    }
}
