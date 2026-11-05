use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const TOKENS: [&str; 11] = ["bgWidget", "bgCard", "bgTrackOff", "textPrimary", "textSecondary", "textMuted", "border", "accent", "severityNormal", "severityWarning", "severityDanger"];
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct UserPalette {
    id: String,
    name: String,
    #[serde(deserialize_with = "colors")]
    dark: BTreeMap<String, String>,
    #[serde(deserialize_with = "colors")]
    light: BTreeMap<String, String>,
}
fn colors<'de, D: Deserializer<'de>>(deserializer: D) -> Result<BTreeMap<String, String>, D::Error> {
    let mut fields = BTreeMap::<String, serde_json::Value>::deserialize(deserializer)?;
    let mut output = BTreeMap::new();
    for key in TOKENS {
        let value = fields.remove(key).and_then(|v| v.as_str().map(str::to_owned)).ok_or_else(|| serde::de::Error::custom(format!("Missing palette color {key}")))?;
        let hex = value.strip_prefix('#').unwrap_or("");
        if ![3, 6, 8].contains(&hex.len()) || !hex.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err(serde::de::Error::custom(format!("Invalid palette color {key}")));
        }
        output.insert(key.to_owned(), value);
    }
    Ok(output)
}
pub(crate) fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<UserPalette>, D::Error> {
    let list = Vec::<UserPalette>::deserialize(deserializer)?;
    validate(&list).map_err(serde::de::Error::custom)?;
    Ok(list)
}
pub(crate) fn validate(list: &[UserPalette]) -> Result<(), String> {
    if list.len() > 50 { return Err("At most 50 user palettes are allowed".into()); }
    let mut ids = BTreeSet::new();
    for p in list {
        for fields in [&p.dark, &p.light] {
            for key in TOKENS {
                let hex = fields.get(key).and_then(|value| value.strip_prefix('#')).unwrap_or("");
                if ![3, 6, 8].contains(&hex.len()) || !hex.bytes().all(|c| c.is_ascii_hexdigit()) {
                    return Err(format!("Invalid palette color {key}"));
                }
            }
        }
        let suffix = p.id.strip_prefix("user-").unwrap_or("");
        if suffix.is_empty() || suffix.len() > 64 || !suffix.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-') || !ids.insert(&p.id) {
            return Err("Invalid or duplicate user palette id".into());
        }
        if p.name.trim().is_empty() || p.name.chars().count() > 40 || p.name.chars().any(|c| c.is_control() || c == '<' || c == '>') {
            return Err("Palette names must be plain text, 1–40 characters".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    fn palette() -> Value {
        let colors: BTreeMap<_,_> = TOKENS.into_iter().map(|k| (k,"#abc")).collect();
        json!({"id":"user-test","name":"Test","dark":colors,"light":colors})
    }
    #[test]
    fn round_trip_drops_unknown_keys_and_preserves_old_settings() {
        let mut p = palette(); p["unknown"] = json!("ignored"); p["dark"]["attack"] = json!({"url":"ignored"});
        let s: crate::Settings = serde_json::from_value(json!({"userPalettes":[p]})).unwrap();
        let out = serde_json::to_value(&s).unwrap();
        assert_eq!(out["userPalettes"][0], palette());
        assert!(serde_json::from_value::<crate::Settings>(out).is_ok());
        assert!(serde_json::from_value::<crate::Settings>(json!({})).unwrap().user_palettes.is_empty());
    }
    #[test]
    fn valid_hex_forms_and_palettes_survive_other_field_recovery() {
        let mut p = palette(); p["dark"]["accent"] = json!("#aabbcc"); p["light"]["accent"] = json!("#11223380");
        let input = json!({"scale":"invalid","userPalettes":[p.clone()]});
        let recovered = crate::parse_settings(&serde_json::to_vec(&input).unwrap());
        assert_eq!(serde_json::to_value(recovered).unwrap()["userPalettes"][0],p);
    }
    #[test]
    fn rejects_hostile_incomplete_duplicate_and_oversized_palettes() {
        for bad in ["red", "#abcd", "#123456;url(x)", "#１２３", "#12345g"] {
            let mut p = palette(); p["dark"]["accent"] = json!(bad);
            assert!(serde_json::from_value::<crate::Settings>(json!({"userPalettes":[p]})).is_err());
        }
        for name in ["<img>", "", "\n", &"a".repeat(41)] {
            let mut p = palette(); p["name"] = json!(name);
            assert!(serde_json::from_value::<crate::Settings>(json!({"userPalettes":[p]})).is_err());
        }
        for list in [vec![palette(),palette()], vec![palette();51], vec![json!({"id":"user-x","name":"x"})]] {
            assert!(serde_json::from_value::<crate::Settings>(json!({"userPalettes":list})).is_err());
        }
        let recovered = crate::parse_settings(&serde_json::to_vec(&json!({"theme":"terminal","userPalettes":[{}]})).unwrap());
        assert_eq!(recovered.theme,"terminal"); assert!(recovered.user_palettes.is_empty()); assert!(recovered.palette_load_error.is_some());
    }
}
