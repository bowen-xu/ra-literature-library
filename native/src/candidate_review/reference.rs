//! Original reviewed-reference field mapping and immutable acceptance snapshot.
use research_workbench_native_sdk::{
    candidate_contracts::CandidateValidationError as AiError,
    candidate_review::reference::{ReferencePromotionInputV1, ReferencePromotionPlanV1},
    reference_records::{
        ReferenceMetadataField, ReferenceRecordDraft, ReferenceRecordPreparationV1,
    },
};

/// Static composition consumes the same canonical statements as the independent package.
pub fn acceptance_sql() -> [&'static str; 3] {
    [
        include_str!("../../data/reference-records-ai-insert.v1.sql"),
        include_str!("../../data/reference-records-ai-revision.v1.sql"),
        include_str!("../../data/reference-records-anchor-belongs.v1.sql"),
    ]
}

pub fn prepare(input: &ReferencePromotionInputV1) -> Result<ReferencePromotionPlanV1, AiError> {
    let source = input
        .sources
        .iter()
        .find(|source| source.relation_kind == "direct_quote")
        .ok_or_else(|| AiError::InvalidInput("参考条目候选缺少原文来源".to_owned()))?;
    if !matches!(
        input.provenance_kind.as_str(),
        "ai_accepted_unchanged" | "ai_accepted_after_edit"
    ) {
        return Err(AiError::InvalidInput("AI 参考条目审查来源无效".to_owned()));
    }
    let after_edit = input.provenance_kind == "ai_accepted_after_edit";
    let draft = ReferenceRecordDraft {
        id: None,
        citing_paper_id: source.paper_id.clone(),
        source_anchor_id: source.anchor_id.clone(),
        raw_text: input.reference.raw_text.clone(),
        parse_state: if input.reference.fields.is_empty() {
            "unparsed"
        } else {
            "parsed"
        }
        .into(),
        fields: input
            .reference
            .fields
            .iter()
            .map(|field| ReferenceMetadataField {
                name: field.name.clone(),
                value: field.value.clone(),
                source_kind: if after_edit { "human" } else { "ai_inference" }.into(),
                confirmed_by_user: after_edit,
            })
            .collect(),
        identity_state: "unverified".into(),
        matched_item_id: None,
        semantic_state: "unreviewed".into(),
        usage_kind: None,
        usage_summary: String::new(),
        usage_anchor_id: None,
        expected_revision: None,
        change_reason: "accepted_ai_candidate".into(),
    };
    let mut record = match crate::reference_records::prepare(draft) {
        ReferenceRecordPreparationV1::Ready { plan } => *plan,
        ReferenceRecordPreparationV1::Rejected { reason } => {
            return Err(AiError::InvalidInput(reason.message().into()));
        }
    };
    record.snapshot_json = serde_json::json!({
        "record": record.draft,
        "acceptedFrom": {"candidateId": input.candidate_id,"candidateRevision": input.candidate_revision}
    }).to_string();
    Ok(ReferencePromotionPlanV1 {
        record,
        provenance_kind: input.provenance_kind.clone(),
        candidate_id: input.candidate_id.clone(),
        candidate_revision: input.candidate_revision,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use research_workbench_native_sdk::{
        analysis_workflow::wire::*,
        candidate_review::{reference::ReferencePromotionSourceV1, wire::*},
        catalog::{CatalogInput, CatalogOutput},
        paper_context_wire::{decode_payload, encode_payload},
    };
    fn input() -> ReferencePromotionInputV1 {
        ReferencePromotionInputV1 {
            reference:serde_json::from_value(serde_json::json!({"kind":"reference_record_candidate_v1","schemaVersion":1,"rawText":"  Synthetic reference Ω.  ","evidenceItemIds":["ev-quote"],"fields":[{"name":"title","value":"Synthetic title","evidenceItemIds":["ev-quote"]}],"uncertainties":["Unverified identity"]})).unwrap(),
            sources:vec![ReferencePromotionSourceV1 {paper_id:"paper".into(),anchor_id:"anchor".into(),relation_kind:"direct_quote".into()}],
            provenance_kind:"ai_accepted_unchanged".into(),candidate_id:"candidate".into(),candidate_revision:2,
        }
    }
    #[test]
    fn original_reference_acceptance_keeps_unverified_identity_and_human_field_provenance() {
        for edited in [false, true] {
            let mut input = input();
            if edited {
                input.provenance_kind = "ai_accepted_after_edit".into();
            }
            let plan = prepare(&input).unwrap();
            assert!(plan.is_bound_to(&input));
            assert_eq!(plan.record.raw_text, "Synthetic reference Ω.");
            assert_eq!(plan.record.draft.raw_text, input.reference.raw_text);
            assert_eq!(plan.record.draft.parse_state, "parsed");
            assert_eq!(plan.record.draft.fields[0].confirmed_by_user, edited);
            assert_eq!(
                plan.record.draft.fields[0].source_kind,
                if edited { "human" } else { "ai_inference" }
            );
            assert_eq!(plan.record.draft.identity_state, "unverified");
            let mut rebound = input.clone();
            rebound.candidate_id = "another".into();
            assert!(!plan.is_bound_to(&rebound));
            let mut rebound = input.clone();
            rebound.sources[0].anchor_id = "another".into();
            assert!(!plan.is_bound_to(&rebound));
        }
        let mut input = input();
        input.reference.fields.clear();
        assert_eq!(
            prepare(&input).unwrap().record.draft.parse_state,
            "unparsed"
        );
    }
    #[test]
    fn existing_workflow_transports_the_bound_reference_plan_and_preserves_original_errors() {
        let input = input();
        let request = WorkflowInputV1::CandidateReview {
            input: Box::new(ReviewInputV1::ReferencePromotion {
                input: Box::new(input.clone()),
            }),
        };
        let wire = WorkflowWireInputV1 {
            cbor_base64: encode_payload(&request).unwrap(),
        };
        let CatalogOutput::AnalysisWorkflow { outcome } =
            crate::catalog::dispatch(CatalogInput::DecideAnalysisWorkflow {
                input: Box::new(wire.clone()),
            })
            .unwrap()
        else {
            panic!("wrong family")
        };
        assert_eq!(outcome.input, wire);
        let decision: WorkflowDecisionV1 = decode_payload(&outcome.decision_cbor_base64).unwrap();
        assert!(request.matches_decision(&decision));
        let mut missing = input.clone();
        missing.sources.clear();
        missing.provenance_kind = "invalid".into();
        assert_eq!(
            prepare(&missing).unwrap_err().to_string(),
            "参考条目候选缺少原文来源"
        );
        let mut invalid = input.clone();
        invalid.provenance_kind = "invalid".into();
        assert_eq!(
            prepare(&invalid).unwrap_err().to_string(),
            "AI 参考条目审查来源无效"
        );
        let mut invalid = input;
        invalid.reference.fields[0].name = "unsupported".into();
        assert_eq!(
            prepare(&invalid).unwrap_err().to_string(),
            "参考条目解析字段或来源无效"
        );
    }
}
