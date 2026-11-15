use super::*;
use serde_json::json;
fn draft(action: &str) -> AiSuggestionItemDecisionDraft {
    AiSuggestionItemDecisionDraft {
        candidate_id: "candidate".into(),
        candidate_revision: 1,
        suggestion_id: "s".into(),
        action: action.into(),
        rationale: " Ω ".into(),
        idempotency_key: "key".into(),
        resolution: None,
    }
}
fn concept() -> Suggestion {
    serde_json::from_value(json!({"kind":"concept","id":"s","term":"Term","explanation":"Original","epistemicRole":"source_paraphrase","evidenceItemIds":["first"]})).unwrap()
}
#[test]
fn original_request_hash_keeps_serde_order_nullable_resolution_and_unicode() {
    let bytes = r#"{"candidateId":"candidate","candidateRevision":1,"suggestionId":"s","action":"defer","rationale":" Ω ","idempotencyKey":"key","resolution":null}"#;
    assert_eq!(
        request_hash(&draft("defer")).unwrap(),
        format!("{:x}", Sha256::digest(bytes.as_bytes()))
    );
    let mut invalid = draft("defer");
    invalid.candidate_revision = 0;
    let ItemReviewDecisionV1::Draft { result: Err(error) } =
        decide(ItemReviewInputV1::Draft { draft: invalid })
    else {
        panic!("draft validation");
    };
    assert_eq!(error.to_string(), "建议条目审查参数无效");
}
#[test]
fn original_action_editor_and_explicit_resolution_checks_keep_order() {
    for (action, editor, resolution, expected) in [
        (
            "accept_unchanged",
            "ai",
            Some(AiSuggestionResolutionDraft::CreateConcept),
            None,
        ),
        (
            "accept_after_edit",
            "human",
            Some(AiSuggestionResolutionDraft::Unresolved),
            None,
        ),
        (
            "accept_unchanged",
            "human",
            Some(AiSuggestionResolutionDraft::CreateConcept),
            Some("建议条目审查动作无效"),
        ),
        (
            "accept_after_edit",
            "ai",
            Some(AiSuggestionResolutionDraft::CreateConcept),
            Some("建议条目审查动作无效"),
        ),
        ("accept_unchanged", "ai", None, Some("建议条目审查动作无效")),
        (
            "accept_unchanged",
            "ai",
            Some(AiSuggestionResolutionDraft::AttachDefinition {
                concept_id: "c".into(),
            }),
            Some("建议条目目标消歧方式无效"),
        ),
        ("defer", "ai", None, None),
        ("reject", "human", None, None),
    ] {
        let mut draft = draft(action);
        draft.resolution = resolution;
        let input = ItemReviewInputV1::Action {
            draft,
            editor_kind: editor.into(),
            suggestion: Box::new(concept()),
        };
        let decision = decide(input.clone());
        assert!(input.matches_decision(&decision));
        let ItemReviewDecisionV1::Action { result } = decision else {
            panic!("action");
        };
        assert_eq!(result.err().map(|e| e.to_string()).as_deref(), expected);
    }
}
#[test]
fn original_anchor_first_match_order_and_partial_candidate_states_are_preserved() {
    let input = ItemReviewInputV1::Anchors {
        evidence_ids: vec!["second".into(), "first".into(), "second".into()],
        sources: vec![
            ("first".into(), "a".into()),
            ("first".into(), "outside-duplicate".into()),
            ("second".into(), "b".into()),
        ],
    };
    let decision = decide(input.clone());
    assert!(input.matches_decision(&decision));
    assert_eq!(
        decision,
        ItemReviewDecisionV1::Anchors {
            result: Ok(vec!["b".into(), "a".into()])
        }
    );
    for (terminal, accepted, editor, action, expected) in [
        (1, 1, "ai", "accept_unchanged", "unreviewed"),
        (1, 1, "human", "accept_after_edit", "edited"),
        (1, 0, "ai", "defer", "deferred"),
        (2, 0, "ai", "reject", "rejected"),
        (2, 1, "ai", "reject", "accepted_unchanged"),
        (2, 1, "human", "reject", "accepted_after_edit"),
    ] {
        assert_eq!(
            decide(ItemReviewInputV1::State {
                total: 2,
                terminal,
                accepted,
                editor_kind: editor.into(),
                action: action.into()
            }),
            ItemReviewDecisionV1::State {
                state: expected.into()
            }
        );
    }
}
#[test]
fn promotion_reply_binds_exact_resolution_statement_and_selected_sources() {
    let input = ItemReviewInputV1::Promotion {
        suggestion: Box::new(concept()),
        resolution: Some(AiSuggestionResolutionDraft::LinkConcept {
            concept_id: "existing".into(),
        }),
        anchor_ids: vec!["a".into()],
    };
    let mut decision = decide(input.clone());
    assert!(input.matches_decision(&decision));
    let ItemReviewDecisionV1::Promotion { result: Ok(plan) } = &mut decision else {
        panic!("promotion");
    };
    let research_workbench_native_sdk::knowledge_promotion::KnowledgePromotionV1::Concept(draft) =
        plan.as_mut()
    else {
        panic!("concept");
    };
    draft.resolution =
        research_workbench_native_sdk::knowledge_promotion::AiConceptResolution::LinkExisting(
            "outside".into(),
        );
    assert!(!input.matches_decision(&decision));
}
