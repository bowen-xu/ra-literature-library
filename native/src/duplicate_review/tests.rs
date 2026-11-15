use super::*;
use crate::catalog::{CatalogInput, CatalogOutput, dispatch};
use research_workbench_native_sdk::data::DataValue;

fn strings(values: &[&str]) -> Vec<DataValue> {
    values
        .iter()
        .map(|value| DataValue::Text((*value).into()))
        .collect()
}

#[test]
fn projections_preserve_complete_order_duplicates_raw_fields_and_confidence_bits() {
    let first = strings(&[
        " raw ",
        "left",
        " Left ",
        "right",
        "右侧",
        " raw reason ",
        "3fe70a3d70a3d70a",
    ]);
    let second = strings(&["second", "a", "A", "b", "B", "doi", "3ff0000000000000"]);
    let rows = DataRows {
        rows: vec![first.clone(), second, first],
    };
    let items = project_duplicate_candidates(&rows).unwrap();
    assert_eq!(
        items
            .iter()
            .map(DuplicateCandidateBitsV1::to_row)
            .collect::<Vec<_>>(),
        rows.rows
    );
    assert_eq!(
        items[0].confidence_bits.to_f64().to_bits(),
        0.72_f64.to_bits()
    );
    let history = DataRows {
        rows: vec![strings(&[
            "op",
            "p",
            " Raw ",
            "q",
            "Other",
            " raw state ",
            " raw time ",
        ])],
    };
    let items = project_merge_operations(&history).unwrap();
    assert_eq!(items[0].to_row(), history.rows[0]);
    assert!(
        project_duplicate_candidates(&DataRows { rows: vec![] })
            .unwrap()
            .is_empty()
    );
    assert!(
        project_merge_operations(&DataRows { rows: vec![] })
            .unwrap()
            .is_empty()
    );
}

#[test]
fn original_column_and_row_error_order_never_echoes_private_values() {
    let mut row = strings(&["PRIVATE_ID", "a", "A", "b", "B", "doi", "PRIVATE_BAD_BITS"]);
    row[1] = DataValue::Null;
    let error = project_duplicate_candidates(&DataRows {
        rows: vec![row.clone()],
    })
    .unwrap_err();
    assert!(matches!(
        error,
        CatalogDecodeError::Cell {
            row: 0,
            column: 1,
            ..
        }
    ));
    assert!(!error.to_string().contains("PRIVATE"));
    row[1] = DataValue::Text("a".into());
    let error = project_duplicate_candidates(&DataRows { rows: vec![row] }).unwrap_err();
    assert!(matches!(
        error,
        CatalogDecodeError::Cell {
            row: 0,
            column: 6,
            ..
        }
    ));
    assert!(!error.to_string().contains("PRIVATE"));
    assert_eq!(error.code(), "literature_catalog_input_invalid");
    assert!(matches!(
        project_merge_operations(&DataRows { rows: vec![vec![]] }),
        Err(CatalogDecodeError::Columns {
            group: "mergeOperations",
            row: 0,
            expected: 7,
            actual: 0
        })
    ));
}

#[test]
fn private_numeric_transport_does_not_add_a_finite_or_range_policy() {
    for bits in [
        "0000000000000001",
        "8000000000000000",
        "7ff0000000000000",
        "7ff8000000000001",
        "bff0000000000000",
    ] {
        let rows = DataRows {
            rows: vec![strings(&["id", "a", "A", "b", "B", "doi", bits])],
        };
        let projected = project_duplicate_candidates(&rows).unwrap();
        assert_eq!(projected[0].confidence_bits.as_str(), bits);
    }
    let rows = DataRows {
        rows: vec![vec![DataValue::Real(0.72); 7]],
    };
    assert!(matches!(
        project_duplicate_candidates(&rows),
        Err(CatalogDecodeError::Cell { column: 0, .. })
    ));
}

#[test]
fn original_decision_match_keeps_raw_input_and_old_unsupported_type_message() {
    for decision in ["keep_both", "dismiss"] {
        let request = DuplicateDecisionRequestV1 {
            candidate_id: " raw\0identity ".into(),
            decision: decision.into(),
        };
        assert_eq!(
            prepare_decision(request.clone()),
            DuplicateDecisionPreparationV1::Ready { request }
        );
    }
    for decision in [
        "",
        " dismiss",
        "dismiss ",
        "DISMISS",
        "merge",
        "保留",
        "dismiss\0",
    ] {
        let error = validate_decision(decision).unwrap_err();
        assert_eq!(error.code, DuplicateRejectionCodeV1::InvalidInput);
        assert_eq!(error.message, format!("不支持的文献类型：{decision}"));
        assert!(matches!(
            prepare_decision(DuplicateDecisionRequestV1 {
                candidate_id: String::new(),
                decision: decision.into()
            }),
            DuplicateDecisionPreparationV1::Rejected { .. }
        ));
    }
}

#[test]
fn actual_zero_is_not_found_and_every_nonzero_count_keeps_original_success() {
    let error = finish_decision(0).unwrap_err();
    assert_eq!(error.code, DuplicateRejectionCodeV1::NotFound);
    assert_eq!(error.message, "找不到文献或附件");
    for count in [1, 2, u64::MAX] {
        assert!(finish_decision(count).is_ok());
    }
    let input = FinishDuplicateDecisionInputV1 {
        request: DuplicateDecisionRequestV1 {
            candidate_id: "raw".into(),
            decision: "not-revalidated-after-SQL".into(),
        },
        affected_rows: 0,
    };
    assert!(
        matches!(complete_decision(&input), DuplicateDecisionCompletionV1::Rejected {error} if error.code==DuplicateRejectionCodeV1::NotFound)
    );
}

#[test]
fn same_canonical_dispatch_exposes_only_four_fixed_duplicate_operations() {
    let request = DuplicateDecisionRequestV1 {
        candidate_id: "raw".into(),
        decision: "dismiss".into(),
    };
    for (input, expected) in [
        (
            CatalogInput::ProjectDuplicateCandidates {
                rows: DataRows { rows: vec![] },
            },
            CatalogOutput::DuplicateCandidates { items: vec![] },
        ),
        (
            CatalogInput::ProjectMergeOperations {
                rows: DataRows { rows: vec![] },
            },
            CatalogOutput::MergeOperations { items: vec![] },
        ),
        (
            CatalogInput::PrepareDuplicateDecision {
                request: request.clone(),
            },
            CatalogOutput::DuplicateDecisionPreparation {
                outcome: DuplicateDecisionPreparationV1::Ready {
                    request: request.clone(),
                },
            },
        ),
        (
            CatalogInput::FinishDuplicateDecision {
                input: FinishDuplicateDecisionInputV1 {
                    request,
                    affected_rows: 1,
                },
            },
            CatalogOutput::DuplicateDecisionCompletion {
                outcome: DuplicateDecisionCompletionV1::Applied {},
            },
        ),
    ] {
        assert_eq!(dispatch(input).unwrap(), expected);
    }
}
