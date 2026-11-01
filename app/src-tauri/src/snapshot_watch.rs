//! Read events must never feed back into the reader. Keep at most one pending wakeup.
use notify::{event::{ModifyKind, RenameMode}, Event, EventKind};
use std::{hash::{Hash, Hasher}, path::Path};

pub fn relevant(event: &Event, path: &Path) -> bool {
    // ReadDirectoryChangesW reports content writes as Modify(Any); explicit
    // metadata/access events stay excluded, and the fingerprint rejects no-op writes.
    let changed = matches!(event.kind, EventKind::Create(_) | EventKind::Modify(ModifyKind::Data(_))
        | EventKind::Modify(ModifyKind::Any)
        | EventKind::Modify(ModifyKind::Name(RenameMode::To | RenameMode::Both | RenameMode::Any)));
    changed && event.paths.iter().any(|p| p == path)
}

#[derive(Default)]
pub struct Fingerprint(Option<(Option<serde_json::Value>, u64)>);
impl Fingerprint {
    pub fn changed(&mut self, snapshot: &Option<serde_json::Value>) -> bool {
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        serde_json::to_string(snapshot).unwrap_or_default().hash(&mut hash);
        let next = (snapshot.as_ref().and_then(|s| s.get("generated_at").cloned()), hash.finish());
        if self.0.as_ref() == Some(&next) { return false; }
        self.0 = Some(next); true
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, AccessMode, DataChange, MetadataKind, CreateKind};
    #[test]
    fn only_snapshot_content_events_wake_reader() {
        let path=Path::new("/fixture/snapshot.json");
        for kind in [EventKind::Access(AccessKind::Open(AccessMode::Read)), EventKind::Access(AccessKind::Close(AccessMode::Read)), EventKind::Access(AccessKind::Read), EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any)), EventKind::Modify(ModifyKind::Name(RenameMode::From))] {
            assert!(!relevant(&Event::new(kind).add_path(path.into()),path));
        }
        for kind in [EventKind::Modify(ModifyKind::Any), EventKind::Create(CreateKind::File), EventKind::Modify(ModifyKind::Data(DataChange::Any)), EventKind::Modify(ModifyKind::Name(RenameMode::To)), EventKind::Modify(ModifyKind::Name(RenameMode::Both))] {
            assert!(relevant(&Event::new(kind).add_path(path.into()),path));
            assert!(!relevant(&Event::new(kind).add_path("/fixture/snapshot.json.tmp".into()),path));
        }
    }
    #[test]
    fn detects_content_changes_even_with_same_timestamp() {
        let mut state=Fingerprint::default();
        let first=Some(serde_json::json!({"generated_at":"fixture", "providers":[1]}));
        assert!(state.changed(&first)); assert!(!state.changed(&first));
        assert!(state.changed(&Some(serde_json::json!({"generated_at":"fixture", "providers":[2]}))));
    }
}
