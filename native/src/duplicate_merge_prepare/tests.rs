use super::*;
use crate::catalog::{CatalogInput, CatalogOutput, dispatch};
use research_workbench_native_sdk::catalog::CatalogOperation;

#[test]
fn endpoint_selection_keeps_original_exact_comparison_and_left_priority() {
    for (left, right, survivor, expected) in [
        ("left", "right", "left", Some("right")),
        ("left", "right", "right", Some("left")),
        ("left", "right", "other", None),
        (" left ", "right", "left", None),
        (" left ", "right", " left ", Some("right")),
        ("", "right", "", Some("right")),
        ("left", "", "left", Some("")),
        ("\0left", "🙂right", "\0left", Some("🙂right")),
        ("same", "same", "same", Some("same")),
    ] {
        assert_eq!(source_item_id(left, right, survivor), expected);
    }
    let left = String::from("same endpoint");
    let right = String::from("same endpoint");
    let source = source_item_id(&left, &right, &left).unwrap();
    assert_eq!(source.as_ptr(), right.as_ptr());
}

#[test]
fn preparation_echoes_original_strings_without_new_validation_or_budget() {
    for raw in [String::new(), " raw\0🙂 ".into(), "长".repeat(4097)] {
        let input = MergePrepareInputV1 {
            candidate_id: raw.clone(),
            survivor_item_id: raw.clone(),
            left_item_id: raw.clone(),
            right_item_id: raw.clone(),
        };
        assert_eq!(
            prepare(input.clone()),
            MergePreparationV1::Ready {
                input,
                merged_item_id: raw,
                operation_state: "applied".into(),
                created_reading_state: false,
            }
        );
    }
    assert_eq!(
        prepare(MergePrepareInputV1 {
            candidate_id: String::new(),
            survivor_item_id: " left ".into(),
            left_item_id: "left".into(),
            right_item_id: "right".into(),
        }),
        MergePreparationV1::Rejected {
            reason: MergeRejectionV1::NotFound,
        }
    );
}

#[test]
fn catalog_dispatch_uses_the_canonical_preparation_for_both_outcomes() {
    for survivor in ["left", "right", "not-an-endpoint"] {
        let input = MergePrepareInputV1 {
            candidate_id: " raw candidate ".into(),
            survivor_item_id: survivor.into(),
            left_item_id: "left".into(),
            right_item_id: "right".into(),
        };
        let call = CatalogInput::PrepareDuplicateMerge {
            input: Box::new(input.clone()),
        };
        assert_eq!(call.operation(), CatalogOperation::PrepareDuplicateMerge);
        let out = dispatch(call).unwrap();
        assert_eq!(out.operation(), CatalogOperation::PrepareDuplicateMerge);
        assert_eq!(
            out,
            CatalogOutput::DuplicateMergePreparation {
                outcome: Box::new(prepare(input)),
            }
        );
    }
}
