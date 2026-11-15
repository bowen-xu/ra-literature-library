//! Original text decoding and frozen context policy, independent of storage owners.
pub use research_workbench_native_sdk::candidate_contracts::GENERIC_OVERVIEW_FIELDS;
use research_workbench_native_sdk::{
    analysis_workflow::candidate::{CandidateDecisionV1 as Decision, CandidateInputV1 as Input},
    paper_context_wire::{decode_payload, encode_payload},
};
use research_workbench_native_sdk::{
    candidate_contracts::{
        AiOverviewProfileContext, CandidatePayload, CandidateValidationError as AiError,
    },
    generation::AiMatrixSynthesisContext,
};
use std::collections::HashSet;

pub fn decide(input: Input) -> Result<Decision, crate::catalog::CatalogDecodeError> {
    use crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput as Malformed;
    Ok(match input {
        Input::Decode {
            content,
            evidence_keys,
        } => match decode_candidate_content(&content, &evidence_keys.into_iter().collect()) {
            Ok(payload) => Decision::Decoded {
                payload_cbor_base64: encode_payload(&payload).map_err(|_| Malformed)?,
            },
            Err(error) => Decision::Rejected { error },
        },
        Input::KindAndQuotes {
            payload_cbor_base64,
            task_kind,
            suggestion_kind,
            evidence,
        } => {
            let payload: CandidatePayload =
                decode_payload(&payload_cbor_base64).map_err(|_| Malformed)?;
            let result =
                validate_run_candidate_kind(&task_kind, suggestion_kind.as_deref(), payload.kind())
                    .and_then(|()| crate::structured_validation::quotes(&payload, &evidence));
            match result {
                Ok(()) => Decision::Validated {},
                Err(error) => Decision::Rejected { error },
            }
        }
        Input::Profile {
            payload_cbor_base64,
            profile,
        } => {
            let payload: CandidatePayload =
                decode_payload(&payload_cbor_base64).map_err(|_| Malformed)?;
            match validate_overview_profile(&payload, profile.as_ref()) {
                Ok(()) => Decision::Validated {},
                Err(error) => Decision::Rejected { error },
            }
        }
        Input::Finalize {
            payload_cbor_base64,
            matrix,
        } => {
            let payload: CandidatePayload =
                decode_payload(&payload_cbor_base64).map_err(|_| Malformed)?;
            let result =
                validate_generated_research_context(&payload, matrix.as_ref()).and_then(|()| {
                    serde_json::to_string(&payload)
                        .map_err(|_| AiError::InvalidInput("无法规范化 AI 候选".into()))
                });
            match result {
                Ok(canonical_json) => Decision::Prepared { canonical_json },
                Err(error) => Decision::Rejected { error },
            }
        }
        Input::RevisionQuotesAndKind {
            payload_cbor_base64,
            candidate_kind,
            evidence,
        } => {
            let payload = decode_payload(&payload_cbor_base64).map_err(|_| Malformed)?;
            match crate::candidate_revision::quotes_and_kind(&payload, &candidate_kind, &evidence) {
                Ok(()) => Decision::Validated {},
                Err(error) => Decision::Rejected { error },
            }
        }
        Input::RevisionMatrix {
            payload_cbor_base64,
            matrix,
        } => {
            let payload = decode_payload(&payload_cbor_base64).map_err(|_| Malformed)?;
            match validate_revised_research_context(&payload, matrix.as_ref()) {
                Ok(()) => Decision::Validated {},
                Err(error) => Decision::Rejected { error },
            }
        }
        Input::RevisionConfirmedFields {
            payload_cbor_base64,
            active_fields,
        } => {
            let payload = decode_payload(&payload_cbor_base64).map_err(|_| Malformed)?;
            let result =
                crate::candidate_revision::confirmed_fields_unchanged(&payload, active_fields)
                    .and_then(|()| crate::candidate_revision::canonical_json(&payload));
            match result {
                Ok(canonical_json) => Decision::Prepared { canonical_json },
                Err(error) => Decision::Rejected { error },
            }
        }
    })
}

pub fn decode_candidate_content(
    content: &str,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<CandidatePayload, AiError> {
    let value = parse_candidate_json(content)?;
    decode_candidate_value(value, allowed_evidence_ids)
}

fn parse_candidate_json(content: &str) -> Result<serde_json::Value, AiError> {
    match serde_json::from_str(content) {
        Ok(value) => Ok(value),
        Err(first_error) => {
            let trimmed = content.trim();
            if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}'))
                && start < end
            {
                return serde_json::from_str(&trimmed[start..=end]).map_err(|error| {
                    invalid(&format!(
                        "provider 返回的候选不是受支持的结构化 JSON：{error}"
                    ))
                });
            }
            Err(invalid(&format!(
                "provider 返回的候选不是受支持的结构化 JSON：{first_error}"
            )))
        }
    }
}

pub fn decode_candidate_value(
    value: serde_json::Value,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<CandidatePayload, AiError> {
    crate::structured_validation::decode_candidate_value(value, allowed_evidence_ids)
}

pub fn validate_overview_profile(
    payload: &CandidatePayload,
    context: Option<&AiOverviewProfileContext>,
) -> Result<(), AiError> {
    let CandidatePayload::PaperOverview(overview) = payload else {
        return Ok(());
    };
    match context {
        None if overview.profile_id == "generic_overview_v1"
            && overview.profile_refs.is_none()
            && overview
                .fields
                .iter()
                .map(|field| field.field.as_str())
                .eq(GENERIC_OVERVIEW_FIELDS) =>
        {
            Ok(())
        }
        Some(context)
            if context.paper_template.is_some()
                && overview.profile_id == "paper_template_v1"
                && overview.paper_template == context.paper_template
                && overview.profile_refs.is_none()
                && overview
                    .fields
                    .iter()
                    .map(|field| &field.field)
                    .eq(context.field_kinds.iter()) =>
        {
            Ok(())
        }
        Some(context)
            if context.paper_template.is_none()
                && overview.paper_template.is_none()
                && overview.profile_id == "reviewed_profile_composition_v1"
                && overview.profile_refs.as_ref() == Some(&context.profile_refs)
                && overview
                    .fields
                    .iter()
                    .map(|field| field.field.as_str())
                    .eq(context.field_kinds.iter().map(String::as_str)) =>
        {
            Ok(())
        }
        _ => Err(invalid(
            "论文概要字段或画像版本与本次运行冻结的上下文不一致",
        )),
    }
}

pub fn validate_generated_research_context(
    payload: &CandidatePayload,
    context: Option<&AiMatrixSynthesisContext>,
) -> Result<(), AiError> {
    validate_research_context(payload, context, ResearchContextMode::ProviderGeneration)
}

pub fn validate_revised_research_context(
    payload: &CandidatePayload,
    context: Option<&AiMatrixSynthesisContext>,
) -> Result<(), AiError> {
    validate_research_context(payload, context, ResearchContextMode::HumanRevision)
}

enum ResearchContextMode {
    ProviderGeneration,
    HumanRevision,
}

fn validate_research_context(
    payload: &CandidatePayload,
    context: Option<&AiMatrixSynthesisContext>,
    mode: ResearchContextMode,
) -> Result<(), AiError> {
    match (payload, context) {
        (CandidatePayload::DerivedResearchView(view), Some(context))
            if view.view_kind == context.view_kind
                && (!matches!(mode, ResearchContextMode::ProviderGeneration)
                    || (view.title == context.title && view.scope_note == context.scope_note)) =>
        {
            Ok(())
        }
        (CandidatePayload::DerivedResearchView(_), _) | (_, Some(_)) => {
            Err(invalid("派生视图类型或标题与冻结的矩阵综合上下文不一致"))
        }
        (_, None) => Ok(()),
    }
}

fn invalid(message: &str) -> AiError {
    AiError::InvalidInput(message.to_owned())
}

pub fn validate_run_candidate_kind(
    task_kind: &str,
    suggestion_kind: Option<&str>,
    candidate_kind: &str,
) -> Result<(), AiError> {
    let valid = match task_kind {
        "paper_profile_classification" => candidate_kind == "paper_portrait_v1",
        "selection_explanation" => candidate_kind == "selection_explanation_v1",
        "paper_overview" => candidate_kind == "paper_overview_unit_v1",
        "paper_concept_map" => candidate_kind == "paper_concept_map_v1",
        "paper_suggestions" => suggestion_kind == Some(candidate_kind),
        "reference_extraction" => candidate_kind == "reference_record_candidate_v1",
        "matrix_synthesis" => candidate_kind == "derived_research_view_v1",
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(AiError::InvalidInput(
            "provider 候选类型与冻结的任务输出类型不一致".to_owned(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    fn evidence() -> HashSet<String> {
        HashSet::from(["P1-T1".to_owned()])
    }

    #[test]
    fn generated_candidate_wire_preserves_each_original_policy_boundary() {
        let value = serde_json::json!({"kind":"paper_overview_unit_v1","schemaVersion":1,"profileId":"generic_overview_v1","fields":GENERIC_OVERVIEW_FIELDS.iter().map(|field|serde_json::json!({"field":field,"status":"not_found","statements":[]})).collect::<Vec<_>>()});
        let request = Input::Decode {
            content: format!("```json\n{value}\n```"),
            evidence_keys: vec![],
        };
        let decoded = decide(request.clone()).unwrap();
        assert!(request.matches_decision(&decoded));
        let Decision::Decoded {
            payload_cbor_base64,
        } = decoded
        else {
            panic!("expected decoded original payload");
        };
        let kind = Input::KindAndQuotes {
            payload_cbor_base64: payload_cbor_base64.clone(),
            task_kind: "paper_overview".into(),
            suggestion_kind: None,
            evidence: vec![],
        };
        assert_eq!(decide(kind).unwrap(), Decision::Validated {});
        let profile = Input::Profile {
            payload_cbor_base64: payload_cbor_base64.clone(),
            profile: None,
        };
        assert_eq!(decide(profile).unwrap(), Decision::Validated {});
        let request = Input::Finalize {
            payload_cbor_base64: payload_cbor_base64.clone(),
            matrix: None,
        };
        let result = decide(request.clone()).unwrap();
        assert!(request.matches_decision(&result));
        let Decision::Prepared { canonical_json } = result else {
            panic!("expected original canonical JSON");
        };
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&canonical_json).unwrap(),
            value
        );
        let wrong = Input::KindAndQuotes {
            payload_cbor_base64,
            task_kind: "selection_explanation".into(),
            suggestion_kind: None,
            evidence: vec![],
        };
        assert_eq!(
            decide(wrong).unwrap(),
            Decision::Rejected {
                error: AiError::InvalidInput("provider 候选类型与冻结的任务输出类型不一致".into())
            }
        );
        assert!(
            decide(Input::Profile {
                payload_cbor_base64: "malformed".into(),
                profile: None
            })
            .is_err()
        );
        assert!(!request.matches_decision(&Decision::Prepared {
            canonical_json: "{\"kind\":\"other\"}".into()
        }));
        assert!(!request.matches_decision(&Decision::Validated {}));
    }

    #[test]
    fn candidate_json_parser_accepts_fenced_json_but_still_validates_schema() {
        let content = r#"```json
{"kind":"paper_overview_unit_v1","schemaVersion":1,"profileId":"generic_overview_v1","fields":[{"field":"research_question","status":"filled","statements":[{"id":"q1","text":"Question","epistemicRole":"source_paraphrase","evidenceItemIds":["P1-T1"]}]},{"field":"approach","status":"not_found","statements":[]},{"field":"key_result","status":"not_found","statements":[]},{"field":"conclusion","status":"not_found","statements":[]},{"field":"limitation","status":"not_found","statements":[]},{"field":"open_question","status":"not_found","statements":[]}]}
```"#;

        let decoded = decode_candidate_content(content, &evidence()).expect("candidate");

        assert_eq!(decoded.kind(), "paper_overview_unit_v1");
    }

    #[test]
    fn paper_overview_schema_error_reports_serde_detail_without_raw_payload() {
        let content = r#"{"kind":"paper_overview_unit_v1","schemaVersion":1,"profileId":"generic_overview_v1","extra":"nope","fields":[]}"#;

        let error = decode_candidate_content(content, &evidence()).expect_err("schema error");
        let message = error.to_string();

        assert!(message.contains("paper_overview_unit_v1 schema"));
        assert!(message.contains("unknown field") || message.contains("extra"));
        assert!(!message.contains("nope"));
    }
}
