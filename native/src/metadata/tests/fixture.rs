use super::*;
use research_workbench_native_sdk::catalog::{CatalogItem, CatalogMetadataSource};
use research_workbench_native_sdk::catalog_save::{CatalogDraft, PreparedDoi};
use serde_json::json;

pub(super) fn draft(title: &str) -> CatalogDraft {
    serde_json::from_value(json!({"itemType":"document","title":title})).unwrap()
}

pub(super) fn doi() -> PreparedDoi {
    PreparedDoi {
        display: "".into(),
        normalized: "".into(),
    }
}

pub(super) fn header() -> MetadataCandidateHeaderV1 {
    MetadataCandidateHeaderV1 {
        item_id: Some("paper".into()),
        source_kind: "crossref".into(),
        source_reference: Some("raw-reference".into()),
        import_result_id: None,
    }
}

pub(super) fn item() -> CatalogItem {
    let mut value = serde_json::to_value(draft("Current")).unwrap();
    value.as_object_mut().unwrap().remove("sourceKind");
    for (key, value_) in [
        ("id", json!("paper")),
        ("readingStatus", json!("unread")),
        ("attachments", json!([])),
        ("projectIds", json!([])),
        ("metadataSources", json!([])),
        ("createdAt", json!("raw-created")),
        ("updatedAt", json!("raw-updated")),
    ] {
        value[key] = value_;
    }
    let mut item: CatalogItem = serde_json::from_value(value).unwrap();
    item.metadata_sources.push(CatalogMetadataSource {
        field_name: "title".into(),
        source_kind: "user".into(),
        confirmed_by_user: true,
    });
    item
}

pub(super) fn fields_input() -> MetadataFieldsApplyInputV1 {
    MetadataFieldsApplyInputV1 {
        candidate_id: "candidate".into(),
        header: header(),
        candidate: draft("Current"),
        current: item(),
        candidate_doi: doi(),
        current_normalized_doi: "".into(),
        decisions: vec![],
        candidate_trust: MetadataCandidateTrust::Reviewable,
    }
}
