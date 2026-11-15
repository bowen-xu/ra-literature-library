use super::*;
use research_workbench_native_sdk::candidate_review::wire::*;
fn draft(action: &str) -> AiReviewDecisionDraft {
    AiReviewDecisionDraft {
        candidate_id: "candidate".into(),
        candidate_revision: 1,
        action: action.into(),
        rationale: " Reviewed Ω ".into(),
        idempotency_key: "decision".into(),
        reading_unit_title: None,
        project_id: None,
    }
}
fn observation() -> GenericCandidateObservation {
    GenericCandidateObservation {
        candidate_kind: "reference_record_candidate_v1".into(),
        current_revision: 1,
        review_state: "pending".into(),
        has_active_confirmations: false,
        has_revision_item_decisions: false,
        current_editor_kind: Some("ai".into()),
    }
}
#[test]
fn original_actions_and_qualification_error_order_remain() {
    for (action, editor, state, provenance, inspection, citations) in [
        (
            "accept_unchanged",
            "ai",
            "accepted_unchanged",
            Some("ai_accepted_unchanged"),
            true,
            true,
        ),
        (
            "accept_unchanged",
            "ai_retry",
            "accepted_unchanged",
            Some("ai_accepted_unchanged"),
            true,
            true,
        ),
        (
            "accept_after_edit",
            "human",
            "accepted_after_edit",
            Some("ai_accepted_after_edit"),
            false,
            true,
        ),
        ("reject", "ai", "rejected", None, false, false),
        ("defer", "ai", "deferred", None, false, false),
        (
            "request_more_evidence",
            "ai",
            "needs_more_evidence",
            None,
            false,
            false,
        ),
    ] {
        let draft = draft(action);
        let mut observation = observation();
        observation.current_editor_kind = Some(editor.into());
        let input = ReviewInputV1::Candidate { draft, observation };
        let decision = decide(input.clone());
        assert!(input.matches_decision(&decision));
        let ReviewDecisionV1::Candidate { result } = decision else {
            panic!("wrong decision")
        };
        assert_eq!(
            result.unwrap(),
            GenericReviewSemanticsV1 {
                review_state: state.into(),
                provenance: provenance.map(str::to_owned),
                requires_inspection: inspection,
                requires_citations: citations
            }
        );
    }
    let draft = draft("accept_unchanged");
    let mut value = observation();
    value.has_active_confirmations = true;
    value.review_state = "rejected".into();
    value.current_revision = 2;
    value.has_revision_item_decisions = true;
    value.current_editor_kind = None;
    assert!(
        validate_candidate(&draft, &value)
            .unwrap_err()
            .to_string()
            .contains("字段确认")
    );
    value.has_active_confirmations = false;
    assert!(
        validate_candidate(&draft, &value)
            .unwrap_err()
            .to_string()
            .contains("审查已经结束")
    );
    value.review_state = "pending".into();
    assert!(
        validate_candidate(&draft, &value)
            .unwrap_err()
            .to_string()
            .contains("候选版本已变化")
    );
    value.current_revision = 1;
    assert!(
        validate_candidate(&draft, &value)
            .unwrap_err()
            .to_string()
            .contains("逐条审查")
    );
    value.has_revision_item_decisions = false;
    validate_candidate(&draft, &value).unwrap();
    assert_eq!(
        action_semantics(&draft, &value).unwrap_err().to_string(),
        "候选缺少当前修订"
    );
    assert!(
        validate_inspection(false)
            .unwrap_err()
            .to_string()
            .contains("打开至少一条")
    );
    assert!(
        validate_project_membership(false)
            .unwrap_err()
            .to_string()
            .contains("不包含")
    );
    validate_replay(
        &draft,
        &(
            "candidate".into(),
            1,
            "accept_unchanged".into(),
            "Reviewed Ω".into(),
        ),
    )
    .unwrap();
    assert!(
        validate_replay(
            &draft,
            &(
                "other".into(),
                1,
                "accept_unchanged".into(),
                "Reviewed Ω".into()
            )
        )
        .unwrap_err()
        .to_string()
        .contains("幂等键")
    );
}
#[test]
fn original_generic_review_flows_through_the_existing_catalog_and_workflow_codec() {
    use research_workbench_native_sdk::{
        analysis_workflow::wire::*,
        catalog::{CatalogInput, CatalogOutput},
        paper_context_wire::{decode_payload, encode_payload},
    };
    let request = WorkflowInputV1::CandidateReview {
        input: Box::new(ReviewInputV1::Candidate {
            draft: draft("accept_unchanged"),
            observation: observation(),
        }),
    };
    let input = WorkflowWireInputV1 {
        cbor_base64: encode_payload(&request).unwrap(),
    };
    let output = crate::catalog::dispatch(CatalogInput::DecideAnalysisWorkflow {
        input: Box::new(input.clone()),
    })
    .unwrap();
    let CatalogOutput::AnalysisWorkflow { outcome } = output else {
        panic!("wrong family")
    };
    assert_eq!(outcome.input, input);
    let decision: WorkflowDecisionV1 = decode_payload(&outcome.decision_cbor_base64).unwrap();
    assert!(request.matches_decision(&decision));
    assert!(!request.matches_decision(&WorkflowDecisionV1::Validated { rejection: None }));
    assert!(matches!(
        decision,
        WorkflowDecisionV1::CandidateReview {
            decision: ReviewDecisionV1::Candidate { result: Ok(_) }
        }
    ));
}
