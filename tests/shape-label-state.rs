use super::*;
#[test]
fn labels_keep_shape_cache_onboarding_and_debounce_independent() {
    let mut states = HashMap::new();
    let first = state_for(&mut states, "widget-first");
    let second = state_for(&mut states, "widget-second");
    first.onboarding.store(true, Ordering::SeqCst);
    first.running.store(true, Ordering::SeqCst);
    first.revision.fetch_add(1, Ordering::SeqCst);
    *first.last.lock().unwrap() = Some((Shape::Circle, 100, 100, 0, 0));
    assert!(!second.onboarding.load(Ordering::SeqCst));
    assert!(!second.running.load(Ordering::SeqCst));
    assert_eq!(second.revision.load(Ordering::SeqCst), 0);
    assert!(second.last.lock().unwrap().is_none());
    let again = state_for(&mut states, "widget-first");
    assert!(Arc::ptr_eq(&first, &again));
    assert!(again.onboarding.load(Ordering::SeqCst));
    assert_eq!(again.revision.load(Ordering::SeqCst), 1);
    assert!(*again.last.lock().unwrap() == Some((Shape::Circle, 100, 100, 0, 0)));
}
