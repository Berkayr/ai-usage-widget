use super::*;
#[test]
fn labels_keep_pending_sizes_and_layer_flags_independent() {
    let mut pending = HashMap::new();
    assert!(!merge_resize(&mut pending, "widget-first", Some(340), None));
    assert!(!merge_resize(&mut pending, "widget-second", Some(420), Some(800.)));
    assert!(merge_resize(&mut pending, "widget-first", None, Some(600.)));
    assert_eq!(pending.remove("widget-first"), Some((Some(340), Some(600.))));
    assert_eq!(pending.remove("widget-second"), Some((Some(420), Some(800.))));
    assert!(!merge_resize(&mut pending, "widget-first", None, Some(700.)));
    let flags = Mutex::new(HashMap::from([("widget-first".into(), true)]));
    assert!(flag(&flags, "widget-first"));
    assert!(!flag(&flags, "widget-second"));
}
#[test]
fn placement_cache_is_per_label_and_invalidation_clears_all() {
    let mut cache = HashMap::new();
    let position = ("Synthetic display".into(), 8, 12, "bottom".into());
    assert!(remember_placement(&mut cache, "widget-first", position.clone()));
    assert!(remember_placement(&mut cache, "widget-second", position.clone()));
    assert!(!remember_placement(&mut cache, "widget-first", position.clone()));
    cache.clear();
    assert!(remember_placement(&mut cache, "widget-first", position));
}
