use super::*;
use crate::catalog::{CatalogDecodeError, CatalogInput, CatalogOutput};
use research_workbench_native_sdk::{
    catalog_save::{CatalogSaveInput, CatalogSaveOutcome, CatalogSaveRejection, PreparedDoi},
    data::{DataRows, DataValue},
};
use serde_json::{Value, json};

mod projection;

fn input(title: &str) -> CatalogSaveInput {
    CatalogSaveInput {
        draft: serde_json::from_value(json!({"itemType":"document","title":title})).unwrap(),
        doi: PreparedDoi {
            display: " Core DOI ".into(),
            normalized: "10.1000/core".into(),
        },
    }
}

#[test]
fn prepare_records_original_drafts_before_bibtex_source_and_save_normalization() {
    let mut original = input(" \u{2003}Raw title\0 ");
    original.draft.id = Some(" existing id ".into());
    original.draft.bibtex_key = " key\0 ".into();
    original.draft.source_kind = Some("original-source".into());
    original.draft.raw_bibtex = Some(" @article{ raw }\n".into());
    original.draft.tags = vec![" raw ".into(), "raw".into(), String::new()];
    original.draft.creators = serde_json::from_value(json!([{
        "familyName":" Family ","givenName":" Given ","role":" editor "
    }]))
    .unwrap();
    let raw = prepare_inputs(std::slice::from_ref(&original.draft)).unwrap();
    assert_eq!(raw[0].0, " key\0 ");
    assert_eq!(raw[0].1, serde_json::to_string(&original.draft).unwrap());
    let BibtexPreparationV1::Ready { plan } = prepare(PrepareBibtexInputV1 {
        inputs: vec![original.clone()],
    })
    .unwrap() else {
        unreachable!()
    };
    assert_eq!(plan.entries.len(), 1);
    assert_eq!(plan.entries[0].input_label, raw[0].0);
    assert_eq!(plan.entries[0].raw_input, raw[0].1);
    let stored: Value = serde_json::from_str(&plan.entries[0].raw_input).unwrap();
    assert_eq!(stored["sourceKind"], "original-source");
    assert_eq!(stored["tags"], json!([" raw ", "raw", ""]));
    let CatalogSaveOutcome::Planned { plan: save } = &plan.entries[0].save else {
        unreachable!()
    };
    assert_eq!(save.item.id, original.draft.id);
    assert_eq!(save.item.title, "Raw title\0");
    assert_eq!(save.item.raw_bibtex, original.draft.raw_bibtex);
    assert_eq!(save.provenance.source_kind, "bibtex");
    assert!(!save.provenance.confirmed_by_user);
    assert_eq!(save.creators[0].family_name, "Family");
    assert_eq!(save.creators[0].role, " editor ");
    assert_eq!(save.tags, ["raw", "raw"]);
    assert_eq!(save.doi, Some(original.doi));
}

#[test]
fn labels_use_unmodified_title_when_unicode_key_is_whitespace_and_keep_duplicates() {
    let mut value = input(" untrimmed title ");
    value.draft.bibtex_key = " \u{2003}\n".into();
    let values = vec![value.draft.clone(), value.draft];
    let labels = prepare_inputs(&values).unwrap();
    assert_eq!(labels.len(), 2);
    assert_eq!(labels[0].0, " untrimmed title ");
    assert_eq!(labels[0], labels[1]);
}

#[test]
fn empty_batch_rejects_but_each_invalid_save_remains_deferred_in_input_order() {
    assert_eq!(
        prepare(PrepareBibtexInputV1 { inputs: Vec::new() }).unwrap(),
        BibtexPreparationV1::Rejected {
            reason: ImportJobsRejectionV1::EmptyTitle {},
            message: "标题不能为空".into()
        }
    );
    let mut invalid_type = input("");
    invalid_type.draft.item_type = " invalid type ".into();
    let BibtexPreparationV1::Ready { plan } = prepare(PrepareBibtexInputV1 {
        inputs: vec![invalid_type, input(" \n"), input("valid")],
    })
    .unwrap() else {
        unreachable!()
    };
    assert_eq!(plan.entries.len(), 3);
    assert_eq!(
        plan.entries[0].save,
        CatalogSaveOutcome::Rejected {
            reason: CatalogSaveRejection::UnsupportedType {
                item_type: " invalid type ".into()
            }
        }
    );
    assert_eq!(
        plan.entries[1].save,
        CatalogSaveOutcome::Rejected {
            reason: CatalogSaveRejection::EmptyTitle
        }
    );
    assert!(matches!(
        plan.entries[2].save,
        CatalogSaveOutcome::Planned { .. }
    ));
    assert_eq!(plan.rules.source_kind, "bibtex");
    assert_eq!(plan.rules.imported_state, "imported");
    assert_eq!(plan.rules.failed_state, "failed");
    assert_eq!(plan.rules.not_found_message, "找不到文献或附件");
    assert_eq!(plan.rules.empty_title_message, "标题不能为空");
    assert_eq!(plan.rules.unsupported_type_prefix, "不支持的文献类型：");
    assert_eq!(plan.rules.database_error_prefix, "文献数据库操作失败：");
    assert_eq!(plan.rules.finish_states.no_failed, "completed");
    assert_eq!(plan.rules.finish_states.no_imported, "failed");
    assert_eq!(plan.rules.finish_states.mixed, "completed_with_errors");
    for (imported, failed, state) in [
        (0, 0, "completed"),
        (usize::MAX, 0, "completed"),
        (0, usize::MAX, "failed"),
        (1, 1, "completed_with_errors"),
    ] {
        assert_eq!(finish_state(imported, failed), state);
    }
}

#[test]
fn two_finite_dispatches_roundtrip_and_keep_safe_decode_errors() {
    let request = CatalogInput::PrepareBibtex {
        input: PrepareBibtexInputV1 {
            inputs: vec![input("one")],
        },
    };
    let request = serde_json::from_slice(&serde_json::to_vec(&request).unwrap()).unwrap();
    let output = crate::catalog::dispatch(request).unwrap();
    assert_eq!(
        output.operation(),
        research_workbench_native_sdk::catalog::CatalogOperation::PrepareBibtex
    );
    assert_eq!(
        serde_json::from_slice::<CatalogOutput>(&serde_json::to_vec(&output).unwrap()).unwrap(),
        output
    );
    let output = crate::catalog::dispatch(CatalogInput::ProjectImportJobs {
        input: ImportJobsProjectionInputV1::Cancel { affected_rows: 0 },
    })
    .unwrap();
    assert_eq!(
        output,
        CatalogOutput::ImportJobsProjection {
            outcome: ImportJobsProjectionOutcomeV1::NotFound {
                message: "找不到文献或附件".into()
            }
        }
    );
    let error = project(&ImportJobsProjectionInputV1::Jobs {
        expected_ids: Vec::new(),
        rows: vec![ImportJobRowsV1 {
            header: DataRows { rows: Vec::new() },
            results: None,
        }],
    })
    .unwrap_err();
    assert_eq!(error, CatalogDecodeError::InvalidImportJobsProjection);
    assert_eq!(error.code(), "literature_catalog_input_invalid");
    assert!(!error.to_string().contains("private-input"));
}
