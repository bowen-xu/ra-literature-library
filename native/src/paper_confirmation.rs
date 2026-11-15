//! Canonical original field and paper confirmation policy.
pub mod field;
pub mod overview;
pub mod paper;
pub mod undo;
pub mod unit;
pub mod wire;

pub mod rules;
pub mod storage;

#[cfg(test)]
#[path = "paper_confirmation/tests.rs"]
mod field_tests;
#[cfg(test)]
#[path = "paper_confirmation/unit_tests.rs"]
mod unit_tests;

#[cfg(test)]
mod tests {
    use super::rules;
    use research_workbench_native_sdk::paper_confirmation::contracts::{
        AiOverviewFieldConfirmationDraft, AiPaperReviewConfirmationDraft,
        AiPaperReviewOverviewTargetDraft,
    };

    #[test]
    fn original_overview_draft_defers_duplicates_and_preserves_key_identity() {
        let mut draft = AiOverviewFieldConfirmationDraft {
            candidate_id: "candidate".into(),
            candidate_revision: 1,
            field_kinds: vec!["field".into(), "field".into()],
            scope_kind: "field".into(),
            project_id: Some("project".into()),
            idempotency_key: " Ω ".into(),
        };
        rules::validate_confirmation_draft(&draft).unwrap();
        assert_eq!(draft.idempotency_key, " Ω ");
        draft.idempotency_key = "Ω".repeat(200);
        rules::validate_confirmation_draft(&draft).unwrap();
        draft.idempotency_key.push('Ω');
        assert_eq!(
            rules::validate_confirmation_draft(&draft)
                .unwrap_err()
                .to_string(),
            "字段确认参数无效"
        );
    }

    #[test]
    fn original_paper_normalization_keeps_error_order_sorting_and_paper_scope() {
        let mut draft = AiPaperReviewConfirmationDraft {
            paper_id: "paper".into(),
            project_id: Some("ignored-project".into()),
            metadata_field_names: vec!["title".into(), "doi".into(), "title".into()],
            overview_targets: vec![AiPaperReviewOverviewTargetDraft {
                candidate_id: "candidate".into(),
                candidate_revision: 3,
                field_kinds: vec!["key_result".into(), "approach".into(), "key_result".into()],
            }],
            idempotency_key: " paper-key ".into(),
        };
        rules::normalize_paper_draft(&mut draft).unwrap();
        assert!(draft.project_id.is_none());
        assert_eq!(draft.metadata_field_names, ["doi", "title"]);
        assert_eq!(
            draft.overview_targets[0].field_kinds,
            ["approach", "key_result"]
        );
        assert_eq!(draft.idempotency_key, " paper-key ");
        draft.metadata_field_names.push("invalid".into());
        draft.overview_targets[0].field_kinds.clear();
        assert_eq!(
            rules::normalize_paper_draft(&mut draft)
                .unwrap_err()
                .to_string(),
            "元数据确认字段无效：invalid"
        );
        draft.paper_id = " ".into();
        draft.project_id = Some("still-present-before-early-error".into());
        assert_eq!(
            rules::normalize_paper_draft(&mut draft)
                .unwrap_err()
                .to_string(),
            "文献 ID 不能为空"
        );
        assert!(draft.project_id.is_some());
    }
}
