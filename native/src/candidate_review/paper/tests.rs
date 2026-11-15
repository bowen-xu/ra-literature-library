use super::*;
use serde_json::json;
fn concept() -> PaperItemV1 {
    serde_json::from_value(json!({"kind":"concept","id":"c","preferredTerm":"Gate","surfaceForms":[{"text":"Gate","language":"en","relationKind":"preferred","evidenceItemIds":["first"]},{"text":"Alias","language":"en","relationKind":"alias","evidenceItemIds":[]}],"paperFunction":"focal","noveltyStatus":"introduced_by_paper","explanationStatus":"explained_in_paper","explanation":"Original","disambiguation":" Context ","roleRationale":"Role","noveltyRationale":"Novelty","definitionClaims":[{"id":"d","statement":"Definition","scopeNote":"Scope","evidenceItemIds":["second"]}],"evidenceItemIds":["first"],"referenceMentions":[{"citationText":"Ref","evidenceItemIds":["third"]}]})).unwrap()
}
fn request() -> AiSuggestionItemDecisionDraft {
    AiSuggestionItemDecisionDraft {
        candidate_id: "candidate".into(),
        candidate_revision: 1,
        suggestion_id: "c".into(),
        action: "accept_unchanged".into(),
        rationale: "Ω".into(),
        idempotency_key: "key".into(),
        resolution: Some(AiSuggestionResolutionDraft::CreateConcept),
    }
}
#[test]
fn paper_item_hash_and_role_source_bound_preparation_preserve_original_fields() {
    let draft = request();
    let input = PaperReviewInputV1::Draft {
        draft: draft.clone(),
    };
    let decision = decide(input.clone());
    assert!(input.matches_decision(&decision));
    assert_eq!(
        decision,
        PaperReviewDecisionV1::Draft {
            result: Ok(super::super::items::request_hash(&draft).unwrap())
        }
    );
    let input = PaperReviewInputV1::Promotion {
        item: concept(),
        resolution: draft.resolution,
        paper_id: "paper".into(),
        candidate_id: "candidate".into(),
        candidate_revision: 1,
        sources: vec![("first".into(), "a".into()), ("second".into(), "b".into())],
    };
    let mut decision = decide(input.clone());
    assert!(input.matches_decision(&decision));
    let PaperReviewDecisionV1::Promotion { result: Ok(plan) } = &mut decision else {
        panic!("promotion")
    };
    let KnowledgePromotionV1::PaperConcept(p) = plan.as_mut() else {
        panic!("paper")
    };
    assert_eq!(p.paper_function, "focal");
    assert_eq!(p.surface_forms[1].anchor_ids, ["a"]);
    assert_eq!(p.definition_claims[0].anchor_ids, ["b"]);
    p.source_candidate_revision = 2;
    assert!(!input.matches_decision(&decision));
}
#[test]
fn paper_item_evidence_includes_forms_definitions_and_references_with_stable_set_order() {
    assert_eq!(paper_evidence_ids(&concept()), ["first", "second", "third"]);
    assert_eq!(concept().citation_ids(), ["c", "d"]);
}
#[test]
fn paper_relation_requires_the_exact_accepted_concept_targets() {
    let relation:research_workbench_native_sdk::candidate_contracts::PaperConceptRelationPayload=serde_json::from_value(json!({"id":"r","subjectConceptCandidateId":"c","predicateKind":"builds_on","objectConceptCandidateId":"other","scopeNote":"","evidenceItemIds":["first"]})).unwrap();
    for (actual, pass) in [("second", true), ("outside", false)] {
        let input = PaperReviewInputV1::Endpoints {
            concept_ids: vec!["c".into(), "other".into()],
            relation: Box::new(relation.clone()),
            subject_id: "first".into(),
            object_id: actual.into(),
            accepted: vec![
                ("c".into(), "first".into()),
                ("other".into(), "second".into()),
            ],
        };
        let decision = decide(input.clone());
        assert!(input.matches_decision(&decision));
        assert_eq!(
            matches!(decision, PaperReviewDecisionV1::Checked { rejection: None }),
            pass
        );
    }
}
#[test]
fn paper_knowledge_preparation_keeps_resolution_and_sources_bound() {
    let input = PaperReviewInputV1::Promotion {
        item: concept(),
        resolution: request().resolution,
        paper_id: "paper".into(),
        candidate_id: "candidate".into(),
        candidate_revision: 1,
        sources: vec![("first".into(), "a".into()), ("second".into(), "b".into())],
    };
    let PaperReviewDecisionV1::Promotion { result: Ok(plan) } = decide(input) else {
        panic!("plan")
    };
    let KnowledgePromotionV1::PaperConcept(draft) = *plan else {
        panic!("paper")
    };
    let check = KnowledgeValidationInputV1::PaperConcept {
        draft: Box::new(draft),
    };
    let mut decision = crate::knowledge_promotion::decide(&check);
    assert!(check.matches_decision(&decision));
    let KnowledgeValidationDecisionV1::PaperConcept {
        result: Ok(prepared),
    } = &mut decision
    else {
        panic!("preparation")
    };
    assert_eq!(prepared.surface_forms.len(), 1);
    assert_eq!(prepared.base.disambiguation.as_deref(), Some("Context"));
    prepared.base.resolution = AiConceptResolution::LinkExisting("outside".into());
    assert!(!check.matches_decision(&decision));
}
