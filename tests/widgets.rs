use super::*;
use crate::parse_settings;
use serde_json::json;

fn fixture() -> Settings {
    let mut root = parse_settings(include_bytes!("fixtures/widget-settings.json"));
    root.theme = "system".into();
    root.widgets = serde_json::from_value::<Settings>(json!({"widgets":[{
        "id":"side-2", "name":"Synthetic side", "placement":{"monitor":"Synthetic display"},
        "overrides":{"theme":"terminal","historyMode":"panel","linux":{"margin":24}}
    }]})).unwrap().widgets;
    root
}

fn value(settings: &Settings) -> Value { serde_json::to_value(settings).unwrap() }

#[test]
fn legacy_fixture_round_trips_byte_for_byte_and_omits_empty_widgets() {
    let bytes = include_bytes!("fixtures/widget-settings.json");
    let settings = parse_settings(bytes);
    assert_eq!(serde_json::to_vec_pretty(&settings).unwrap(), bytes);
    let mut with_empty: Value = serde_json::from_slice(bytes).unwrap();
    with_empty["widgets"] = json!([]);
    let restored: Settings = serde_json::from_value(with_empty).unwrap();
    assert_eq!(serde_json::to_vec_pretty(&restored).unwrap(), bytes);
}

#[test]
fn effective_and_split_round_trip_without_mutating_root() {
    let root = fixture();
    assert_eq!(value(&effective(&root, "main").unwrap()), value(&root));
    let edited = effective(&root,"side-2").unwrap();
    assert_eq!(edited.theme,"terminal");
    assert_eq!(edited.history.history_mode,"panel");
    assert_eq!(value(&edited)["linux"]["margin"],24);
    assert_eq!(value(&edited)["linux"]["layer"],value(&root)["linux"]["layer"]);
    assert_eq!(edited.placement.disconnected,"hide");
    assert_eq!(value(&split(&root,"side-2",&edited).unwrap()),value(&root));
    let mut changed = edited.clone();
    changed.theme = "system".into();
    changed.history.history_cost = false;
    let saved = split(&root,"side-2",&changed).unwrap();
    let mut actual = value(&effective(&saved,"side-2").unwrap());
    let mut expected = value(&changed);
    actual.as_object_mut().unwrap().remove("widgets");
    expected.as_object_mut().unwrap().remove("widgets");
    assert_eq!(actual, expected);
    assert_eq!(saved.theme, root.theme);
    assert_eq!(value(&split(&root,"main",&changed).unwrap()),value(&changed));
    assert!(effective(&root,"missing").is_err());
    assert!(split(&root,"missing",&changed).is_err());
}

#[test]
fn shared_edits_go_to_root_and_reset_overrides_to_inheritance() {
    let root = fixture();
    let mut edited = effective(&root,"side-2").unwrap();
    edited.theme = root.theme.clone();
    edited.provider_order = vec!["synthetic".into()];
    edited.hidden_providers = vec!["synthetic".into()];
    edited.reserved_top = Some(50);
    edited.taskbar.enabled = false;
    let mut json = value(&edited);
    json["linux"]["margin"] = value(&root)["linux"]["margin"].clone();
    json["linux"]["layer"] = json!("bottom");
    json["linux"]["monitor"] = json!("Synthetic shared display");
    edited = serde_json::from_value(json).unwrap();
    let saved = split(&root,"side-2",&edited).unwrap();
    assert_eq!(saved.provider_order,edited.provider_order);
    assert_eq!(saved.hidden_providers,edited.hidden_providers);
    assert_eq!(saved.reserved_top,Some(50));
    assert!(!saved.taskbar.enabled);
    assert!(!saved.widgets[0].overrides.contains_key("theme"));
    assert_eq!(saved.widgets[0].overrides["linux"],json!({"layer":"bottom"}));
    assert_eq!(value(&saved)["linux"]["monitor"],"Synthetic shared display");
    assert_eq!(value(&saved)["linux"]["layer"],"top");
    let mut invalid = edited;
    invalid.placement.monitor = None;
    assert!(split(&root,"side-2",&invalid).is_err());
}

#[test]
fn invalid_entries_are_skipped_individually_and_hide_is_forced() {
    let mut entries = vec![];
    for id in ["", "main", "Upper", "has space", "é", "abcdefghijklmnopqrstuvwxyz"] {
        entries.push(json!({"id":id,"name":"Synthetic","placement":{"monitor":"Synthetic"}}));
    }
    for monitor in [Value::Null,json!(""),json!("  ")] {
        entries.push(json!({"id":"no-monitor","name":"Synthetic","placement":{"monitor":monitor}}));
    }
    entries.push(json!({"id":"bad","name":"Synthetic","placement":{},"overrides":{"shape":"bad"}}));
    entries.push(json!({"id":"bad-type","name":"Synthetic","placement":{"monitor":"Synthetic"},"overrides":{"dotCount":"bad"}}));
    let good=json!({"id":"side-2","name":"Synthetic","placement":{"monitor":"Synthetic","disconnected":"primary"}});
    entries.extend([good.clone(),good,json!(false)]);
    let root = parse_settings(&serde_json::to_vec(&json!({"widgets":entries,"scale":123})).unwrap());
    assert_eq!(root.scale,123.);
    assert_eq!(root.widgets.len(),1);
    assert_eq!(root.widgets[0].placement.disconnected,"hide");
    let reloaded = parse_settings(&serde_json::to_vec(&root).unwrap());
    assert_eq!(value(&root),value(&reloaded));
}

#[test]
fn only_explicitly_allowed_fields_can_override_root() {
    let mut fields=value(&Settings::default()).as_object().unwrap().clone();
    fields.remove("placement");
    fields.insert("unknown".into(),json!(true));
    fields.insert("historyFutureSharedField".into(),json!(true));
    fields.insert("linux".into(),json!({"layer":"top","margin":9,"monitor":"Rejected"}));
    let root: Settings=serde_json::from_value(json!({"widgets":[{
        "id":"side","name":"Synthetic","placement":{"monitor":"Synthetic"},"overrides":fields.clone()
    }]})).unwrap();
    let overrides=&root.widgets[0].overrides;
    for key in ["taskbar","userPalettes","providerOrder","providerColors","hiddenProviders",
        "reservedTop","reservedBottom","position","lockPosition","reactorMotion",
        "providerPreview","placementEditing","unknown","historyFutureSharedField"] {
        assert!(!overrides.contains_key(key),"{key}");
    }
    assert_eq!(overrides["linux"],json!({"layer":"top","margin":9}));
    for key in fields.keys().filter(|k| overridable(k)) {
        assert!(overrides.contains_key(key),"{key}");
    }
}

#[test]
fn recovery_keeps_widgets_when_a_shared_field_is_damaged() {
    let root=fixture();
    let mut damaged=value(&root);
    damaged["widgetOpacity"]=json!("invalid");
    let recovered=parse_settings(&serde_json::to_vec(&damaged).unwrap());
    assert_eq!(recovered.widgets.len(),1);
    assert_eq!(recovered.widgets[0].overrides,root.widgets[0].overrides);
}

#[test]
fn root_changes_flow_to_inherited_fields_without_touching_other_widgets() {
    let mut root = fixture();
    root.palette_load_error = Some("Synthetic palette warning".into());
    let mut second = root.widgets[0].clone();
    second.id = "other".into();
    second.overrides.insert("theme".into(), json!("signal"));
    root.widgets.push(second);
    let mut edited = effective(&root, "side-2").unwrap();
    edited.dot_count = 17;
    edited.provider_colors.insert("synthetic".into(), "#123456".into());
    edited.placement.disconnected = "primary".into();
    let saved = split(&root, "side-2", &edited).unwrap();
    assert_eq!(edited.palette_load_error, root.palette_load_error);
    assert_eq!(saved.palette_load_error, root.palette_load_error);
    assert_eq!(saved.dot_count, root.dot_count);
    assert_eq!(saved.provider_colors, edited.provider_colors);
    assert_eq!(value(&saved)["widgets"][1], value(&root)["widgets"][1]);
    assert_eq!(effective(&saved, "side-2").unwrap().placement.disconnected, "hide");
    let mut changed_root = saved;
    changed_root.appearance = "dark".into();
    changed_root.theme = "changed-root".into();
    let child = effective(&changed_root, "side-2").unwrap();
    assert_eq!(child.appearance, "dark");
    assert_eq!(child.theme, "terminal");
    assert_eq!(child.dot_count, 17);
}

#[test]
fn malformed_overrides_are_rejected_and_id_length_boundary_is_accepted() {
    let mut entries = vec![];
    for overrides in [json!({"linux":false}), json!({"linux":{"margin":1.5}}),
        json!({"linux":{"margin":2147483648_i64}}), json!({"linux":{"layer":false}}),
        json!({"shape":"invalid"}), json!({"historyEnabled":"invalid"})] {
        entries.push(json!({"id":"bad","name":"Synthetic", "placement":{"monitor":"Synthetic"}, "overrides":overrides}));
    }
    entries.push(json!({"id":"abcdefghijklmnopqrstuvwx","name":"Synthetic", "placement":{"monitor":"Synthetic"}}));
    let root: Settings = serde_json::from_value(json!({"widgets":entries})).unwrap();
    assert_eq!(root.widgets.len(),1);
    assert_eq!(root.widgets[0].id.len(),24);
}

#[test]
fn labels_round_trip_and_reject_path_components() {
    assert_eq!(label(None).unwrap(), MAIN_ID);
    assert_eq!(label(Some(MAIN_ID)).unwrap(), MAIN_ID);
    assert_eq!(label(Some("side-2")).unwrap(), "widget-side-2");
    assert_eq!(id_from_label("widget-side-2").unwrap(), "side-2");
    assert_eq!(id_from_label(MAIN_ID).unwrap(), MAIN_ID);
    let boundary = "a".repeat(24);
    assert_eq!(id_from_label(&label(Some(&boundary)).unwrap()).unwrap(), boundary);
    for id in ["", "../escape", "a/b", "A", "a\\b", "a.b", "a b", "ü", &"a".repeat(25)] {
        assert!(label(Some(id)).is_err(), "{id}");
    }
    for label in ["settings", "widget-", "widget-main", "widget-../escape"] {
        assert!(id_from_label(label).is_err(), "{label}");
    }
}
