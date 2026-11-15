//! Original human revision qualification and immutable confirmed-field protection.
use research_workbench_native_sdk::candidate_contracts::{
    CandidatePayload, CandidateValidationError as AiError, EvidenceQuote, PaperOverviewField,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

pub fn quotes_and_kind(
    payload: &CandidatePayload,
    candidate_kind: &str,
    evidence: &[EvidenceQuote],
) -> Result<(), AiError> {
    crate::structured_validation::quotes(payload, evidence)?;
    if payload.kind() != candidate_kind {
        return Err(AiError::InvalidInput("候选修订不能改变候选类型".to_owned()));
    }
    Ok(())
}
pub fn confirmed_fields_unchanged(
    payload: &CandidatePayload,
    active: Vec<(String, String)>,
) -> Result<(), AiError> {
    let CandidatePayload::PaperOverview(overview) = payload else {
        return Ok(());
    };
    let active = active.into_iter().collect::<HashMap<_, _>>();
    for field in &overview.fields {
        if let Some(expected) = active.get(&field.field)
            && field_hash(field)? != *expected
        {
            return Err(AiError::InvalidInput(format!(
                "字段 {} 已确认，不能再修改候选内容",
                field.field
            )));
        }
    }
    Ok(())
}
pub fn field_hash(field: &PaperOverviewField) -> Result<String, AiError> {
    let value = serde_json::to_value(field)
        .map_err(|_| AiError::InvalidInput("无法规范化概要字段".to_owned()))?;
    let json = serde_json::to_string(&value)
        .map_err(|_| AiError::InvalidInput("无法规范化概要字段".to_owned()))?;
    Ok(format!("{:x}", Sha256::digest(json.as_bytes())))
}
pub fn canonical_json(payload: &CandidatePayload) -> Result<String, AiError> {
    serde_json::to_string(payload)
        .map_err(|_| AiError::InvalidInput("无法规范化候选修订".to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use research_workbench_native_sdk::{
        analysis_workflow::candidate::{
            CandidateDecisionV1 as Decision, CandidateInputV1 as Input,
        },
        paper_context_wire::encode_payload,
    };
    fn overview() -> CandidatePayload {
        serde_json::from_value(serde_json::json!({
            "kind":"paper_overview_unit_v1","schemaVersion":1,"profileId":"generic_overview_v1",
            "fields":crate::analysis_workflow::candidate::GENERIC_OVERVIEW_FIELDS.iter().map(|field|serde_json::json!({"field":field,"status":"not_found","statements":[]})).collect::<Vec<_>>()
        })).unwrap()
    }
    #[test]
    fn original_revision_wire_preserves_quotes_kind_matrix_and_canonical_bytes() {
        let payload = overview();
        let encoded = encode_payload(&payload).unwrap();
        for input in [
            Input::RevisionQuotesAndKind {
                payload_cbor_base64: encoded.clone(),
                candidate_kind: payload.kind().into(),
                evidence: vec![],
            },
            Input::RevisionMatrix {
                payload_cbor_base64: encoded.clone(),
                matrix: None,
            },
        ] {
            let decision = crate::analysis_workflow::candidate::decide(input.clone()).unwrap();
            assert!(input.matches_decision(&decision));
            assert_eq!(decision, Decision::Validated {});
        }
        let input = Input::RevisionQuotesAndKind {
            payload_cbor_base64: encoded.clone(),
            candidate_kind: "reference_record_candidate_v1".into(),
            evidence: vec![],
        };
        assert_eq!(
            crate::analysis_workflow::candidate::decide(input).unwrap(),
            Decision::Rejected {
                error: AiError::InvalidInput("候选修订不能改变候选类型".into())
            }
        );
        let input = Input::RevisionConfirmedFields {
            payload_cbor_base64: encoded,
            active_fields: vec![],
        };
        let decision = crate::analysis_workflow::candidate::decide(input.clone()).unwrap();
        assert!(input.matches_decision(&decision));
        assert_eq!(
            decision,
            Decision::Prepared {
                canonical_json: serde_json::to_string(&payload).unwrap()
            }
        );
        assert!(!input.matches_decision(&Decision::Validated {}));
    }
    #[test]
    fn confirmed_field_hash_and_last_duplicate_protection_keep_original_behavior() {
        let mut payload = overview();
        let CandidatePayload::PaperOverview(overview) = &mut payload else {
            unreachable!()
        };
        let field = &mut overview.fields[0];
        let key = field.field.clone();
        let original = field_hash(field).unwrap();
        let value = serde_json::to_value(&*field).unwrap();
        assert_eq!(
            original,
            format!(
                "{:x}",
                Sha256::digest(serde_json::to_string(&value).unwrap().as_bytes())
            )
        );
        confirmed_fields_unchanged(
            &payload,
            vec![
                (key.clone(), "old duplicate".into()),
                (key.clone(), original.clone()),
            ],
        )
        .unwrap();
        let CandidatePayload::PaperOverview(overview) = &mut payload else {
            unreachable!()
        };
        overview.fields[0].status = "filled".into();
        assert_eq!(
            confirmed_fields_unchanged(&payload, vec![(key.clone(), original)])
                .unwrap_err()
                .to_string(),
            format!("字段 {key} 已确认，不能再修改候选内容")
        );
    }
}
