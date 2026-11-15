use super::*;
use crate::catalog::{CatalogDecodeError, CatalogInput, CatalogOutput, dispatch};
use research_workbench_native_sdk::{
    duplicate_merge::{CollectionAssignment, CollectionMembership},
    nal_annotation::NalAnnotation,
    nal_state::NalStatement,
};
use serde_json::{Value, json};

fn snapshot() -> Value {
    json!({"candidateId":"candidate","attachmentIds":[],"identifierIds":[],"anchorIds":[],
        "addedProjectIds":[],"addedTagIds":[],"addedProvenanceFields":[],
        "createdReadingState":false,"mergedArchivedAt":null})
}

fn classification() -> Value {
    json!({"beforeMemberships":[],"afterMemberships":[],"beforeAssignments":[],"afterAssignments":[]})
}

fn prepare_value(value: Value) -> PreparedDuplicateUndoV1 {
    prepare(&UndoMergePrepareInputV1 {
        snapshot_json: serde_json::to_string(&value).unwrap(),
    })
    .unwrap()
}

fn statement(id: &str) -> Value {
    json!({"id":id,"subject":{"kind":"paper","id":"survivor"},
        "predicate":{"kind":"concept","id":"relation"},"origin":"human"})
}

fn annotation(id: &str) -> Value {
    json!({"id":id,"targetKind":"statement","targetId":"fact","notePageId":"core-note"})
}

#[test]
fn missing_and_null_optional_layers_keep_original_snapshot_compatibility() {
    for null in [false, true] {
        let mut value = snapshot();
        value["futureOuter"] = json!(true);
        if null {
            value["classification"] = Value::Null;
        }
        assert!(prepare_value(value).classification.is_none());
    }
    for null in [false, true] {
        let mut value = snapshot();
        value["classification"] = classification();
        value["classification"]["futureClassification"] = json!(true);
        if null {
            value["classification"]["nal"] = Value::Null;
        }
        let prepared = prepare_value(value).classification.unwrap();
        assert!(prepared.nal.is_none());
        assert_eq!(prepared.expected_memberships_json, "[]");
        assert_eq!(prepared.expected_assignments_json, "[]");
    }
}

#[test]
fn classification_diff_uses_complete_entries_preserving_order_duplicates_and_raw_fields() {
    let old_m = json!({"itemId":"paper","collectionId":"old"});
    let new_m = json!({"itemId":"paper\0tail","collectionId":"old"});
    let other_m = json!({"itemId":"paper","collectionId":"new"});
    let old_a = json!({"itemId":"paper","relationId":"old"});
    let new_a = json!({"itemId":"paper","relationId":" new "});
    let other_a = json!({"itemId":"other","relationId":"old"});
    let mut value = snapshot();
    value["classification"] = classification();
    value["classification"]["beforeMemberships"] = json!([old_m.clone(), old_m.clone()]);
    value["classification"]["afterMemberships"] =
        json!([new_m.clone(), old_m, other_m.clone(), new_m.clone()]);
    value["classification"]["beforeAssignments"] = json!([old_a.clone()]);
    value["classification"]["afterAssignments"] =
        json!([new_a.clone(), old_a, other_a.clone(), new_a.clone()]);
    let after_m: Vec<CollectionMembership> =
        serde_json::from_value(value["classification"]["afterMemberships"].clone()).unwrap();
    let after_a: Vec<CollectionAssignment> =
        serde_json::from_value(value["classification"]["afterAssignments"].clone()).unwrap();
    let out = prepare_value(value).classification.unwrap();
    assert_eq!(
        out.expected_memberships_json,
        serde_json::to_string(&after_m).unwrap()
    );
    assert_eq!(
        out.expected_assignments_json,
        serde_json::to_string(&after_a).unwrap()
    );
    assert_eq!(
        serde_json::to_value(out.delete_memberships).unwrap(),
        json!([new_m.clone(), other_m, new_m])
    );
    assert_eq!(
        serde_json::to_value(out.delete_assignments).unwrap(),
        json!([new_a.clone(), other_a, new_a])
    );
}

#[test]
fn nal_preparation_keeps_full_canonical_arrays_and_original_contains_delta() {
    let old = statement("same");
    let mut changed = old.clone();
    changed["origin"] = json!("changed");
    let new = statement("new");
    let old_note = annotation("old");
    let new_note = annotation("new");
    let after = json!([
        new.clone(),
        old.clone(),
        changed.clone(),
        new.clone(),
        changed
    ]);
    let after_notes = json!([new_note.clone(), old_note.clone(), new_note]);
    let mut value = snapshot();
    value["classification"] = classification();
    value["classification"]["nal"] = json!({"before":[old.clone(),old],"after":after,
        "before_annotations":[old_note],"after_annotations":after_notes,"futureNal":true});
    let typed_statements: Vec<NalStatement> = serde_json::from_value(after).unwrap();
    let typed_notes: Vec<NalAnnotation> = serde_json::from_value(after_notes).unwrap();
    let out = prepare_value(value).classification.unwrap().nal.unwrap();
    assert_eq!(
        out.expected_statements_json,
        serde_json::to_string(&typed_statements).unwrap()
    );
    assert_eq!(
        out.expected_annotations_json,
        serde_json::to_string(&typed_notes).unwrap()
    );
    assert_eq!(out.delete_statement_ids, ["new", "same", "new", "same"]);
    assert_eq!(out.delete_annotation_ids, ["new", "new"]);
}

#[test]
fn every_statement_and_annotation_field_participates_in_the_nal_delta() {
    let base = statement("same");
    let note = annotation("same");
    let mut statement_changes = vec![];
    for (field, next) in [
        ("id", json!("other")),
        ("origin", json!("other")),
        ("subject", json!({"kind":"concept","id":"survivor"})),
        ("predicate", json!({"kind":"paper","id":"relation"})),
    ] {
        let mut changed = base.clone();
        changed[field] = next;
        statement_changes.push(changed);
    }
    for changed in statement_changes {
        let mut value = snapshot();
        value["classification"] = classification();
        value["classification"]["nal"] = json!({"before":[base.clone()],"after":[changed.clone()],
            "before_annotations":[],"after_annotations":[]});
        assert_eq!(
            prepare_value(value)
                .classification
                .unwrap()
                .nal
                .unwrap()
                .delete_statement_ids,
            [changed["id"].as_str().unwrap()]
        );
    }
    for field in ["id", "targetKind", "targetId", "notePageId"] {
        let mut changed = note.clone();
        changed[field] = json!("other");
        let mut value = snapshot();
        value["classification"] = classification();
        value["classification"]["nal"] = json!({"before":[],"after":[],
            "before_annotations":[note.clone()],"after_annotations":[changed.clone()]});
        assert_eq!(
            prepare_value(value)
                .classification
                .unwrap()
                .nal
                .unwrap()
                .delete_annotation_ids,
            [changed["id"].as_str().unwrap()]
        );
    }
}

#[test]
fn original_codec_errors_remain_original_while_catalog_errors_never_echo_the_snapshot() {
    let error = prepare(&UndoMergePrepareInputV1 {
        snapshot_json: "7".into(),
    })
    .unwrap_err();
    assert_eq!(
        error.to_string(),
        "invalid type: integer `7`, expected struct MergeSnapshot at line 1 column 1"
    );
    for value in [
        {
            let mut v = snapshot();
            v.as_object_mut().unwrap().remove("createdReadingState");
            v
        },
        {
            let mut v = snapshot();
            v["classification"] = json!(7);
            v
        },
        {
            let mut v = snapshot();
            v["classification"] = classification();
            v["classification"]["beforeMemberships"] =
                json!([{"itemId":"p","collectionId":"c","extra":true}]);
            v
        },
        {
            let mut v = snapshot();
            v["classification"] = classification();
            v["classification"]["nal"] =
                json!({"before":[],"after":[],"beforeAnnotations":[],"afterAnnotations":[]});
            v
        },
    ] {
        assert!(
            prepare(&UndoMergePrepareInputV1 {
                snapshot_json: serde_json::to_string(&value).unwrap()
            })
            .is_err()
        );
    }
    let error = dispatch(CatalogInput::PrepareDuplicateUndo {
        input: UndoMergePrepareInputV1 {
            snapshot_json: "{\"PRIVATE_SNAPSHOT_BODY_981\": PRIVATE_INVALID}".into(),
        },
    })
    .unwrap_err();
    assert_eq!(error, CatalogDecodeError::InvalidDuplicateUndoPreparation);
    assert_eq!(error.code(), "literature_catalog_input_invalid");
    assert!(!error.to_string().contains("PRIVATE"));
}

#[test]
fn raw_byte_hash_and_dispatch_keep_whitespace_binding_without_normalizing_the_snapshot() {
    let raw = concat!(
        "{\"candidateId\":\"candidate\",\"attachmentIds\":[],\"identifierIds\":[],\"anchorIds\":[],",
        "\"addedProjectIds\":[],\"addedTagIds\":[],\"addedProvenanceFields\":[],",
        "\"createdReadingState\":false,\"mergedArchivedAt\":null}"
    );
    let input = UndoMergePrepareInputV1 {
        snapshot_json: raw.into(),
    };
    let prepared = prepare(&input).unwrap();
    assert_eq!(
        prepared.snapshot_sha256,
        "c09cbb0967966583187d35c6304b41d3bdd999b55fc66fb5d8260465d92d9623"
    );
    let spaced = prepare(&UndoMergePrepareInputV1 {
        snapshot_json: format!(" \n{raw}\n "),
    })
    .unwrap();
    assert_ne!(spaced.snapshot_sha256, prepared.snapshot_sha256);
    assert_eq!(spaced.classification, prepared.classification);
    let call = CatalogInput::PrepareDuplicateUndo { input };
    let operation = call.operation();
    let output = dispatch(call).unwrap();
    assert_eq!(output.operation(), operation);
    assert_eq!(
        output,
        CatalogOutput::DuplicateUndoPreparation {
            outcome: Box::new(prepared)
        }
    );
}
