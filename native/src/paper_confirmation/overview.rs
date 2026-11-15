//! Original candidate qualification and ordered field selection, with an injected decoder.
use research_workbench_native_sdk::{
    candidate_contracts::{
        CandidatePayload, CandidateValidationError as AiError, PaperOverviewField,
        PaperOverviewPayload,
    },
    candidate_review::contracts::{AiCandidate, AiOverviewFieldConfirmation},
    paper_confirmation::{
        contracts::AiOverviewFieldConfirmationDraft, overview::QualifiedOverviewV1,
    },
};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

struct DecodeInput {
    paper_id: String,
    value: Value,
    allowed: HashSet<String>,
}
fn decode_input(
    candidate: &AiCandidate,
    draft: &AiOverviewFieldConfirmationDraft,
) -> Result<DecodeInput, AiError> {
    if candidate.candidate_kind != "paper_overview_unit_v1" {
        return Err(AiError::InvalidInput(
            "只有结构化阅读候选支持字段确认".to_owned(),
        ));
    }
    if candidate.current_revision != draft.candidate_revision {
        return Err(AiError::InvalidInput(
            "AI 候选已产生新版本，请重新载入后确认".to_owned(),
        ));
    }
    if matches!(
        candidate.review_state.as_str(),
        "accepted_unchanged" | "accepted_after_edit" | "rejected"
    ) {
        return Err(AiError::InvalidInput("候选审查已经结束".to_owned()));
    }
    let paper_id = candidate
        .evidence_bundle
        .items
        .first()
        .map(|item| item.paper_id.clone())
        .ok_or_else(|| AiError::InvalidInput("概要候选缺少来源文献".to_owned()))?;
    if !candidate
        .evidence_bundle
        .items
        .iter()
        .all(|item| item.paper_id == paper_id)
    {
        return Err(AiError::InvalidInput(
            "结构化阅读候选跨越了多篇文献".to_owned(),
        ));
    }
    let current_revision = candidate
        .revisions
        .iter()
        .find(|revision| revision.revision == candidate.current_revision)
        .ok_or_else(|| AiError::InvalidInput("找不到候选当前版本".to_owned()))?;
    let allowed = candidate
        .evidence_bundle
        .items
        .iter()
        .map(|item| item.citation_key.clone())
        .collect::<HashSet<_>>();
    Ok(DecodeInput {
        paper_id,
        value: current_revision.payload.clone(),
        allowed,
    })
}

/// The original static composition may supply its existing pure decoder.
/// The independent host supplies the canonical decoder from the same library.
pub fn qualify<E: From<AiError>>(
    candidate: &AiCandidate,
    draft: &AiOverviewFieldConfirmationDraft,
    decode: impl FnOnce(Value, &HashSet<String>) -> Result<CandidatePayload, E>,
) -> Result<QualifiedOverviewV1, E> {
    let input = decode_input(candidate, draft).map_err(E::from)?;
    let payload = decode(input.value, &input.allowed)?;
    let CandidatePayload::PaperOverview(overview) = payload else {
        return Err(AiError::InvalidInput("候选概要格式无效".to_owned()).into());
    };
    Ok(QualifiedOverviewV1 {
        paper_id: input.paper_id,
        populated_field_count: overview
            .fields
            .iter()
            .filter(|field| !field.statements.is_empty() && field.status != "not_found")
            .map(|field| field.field.as_str())
            .collect::<HashSet<_>>()
            .len(),
        overview,
    })
}

pub fn select_fields(
    overview: &PaperOverviewPayload,
    requested_fields: &[String],
    confirmed_fields: &[AiOverviewFieldConfirmation],
) -> Result<Vec<PaperOverviewField>, AiError> {
    let by_field = overview
        .fields
        .iter()
        .map(|field| (field.field.as_str(), field))
        .collect::<HashMap<_, _>>();
    let active_fields = confirmed_fields
        .iter()
        .filter(|field| field.active)
        .map(|field| field.field_kind.as_str())
        .collect::<HashSet<_>>();
    let requested = requested_fields.iter().collect::<HashSet<_>>();
    if requested.len() != requested_fields.len() {
        return Err(AiError::InvalidInput("确认字段不能重复".to_owned()));
    }
    let mut fields = Vec::new();
    for field_kind in requested_fields {
        if active_fields.contains(field_kind.as_str()) {
            return Err(AiError::InvalidInput(format!("字段 {field_kind} 已经确认")));
        }
        let field = by_field
            .get(field_kind.as_str())
            .copied()
            .ok_or_else(|| AiError::InvalidInput(format!("候选不包含字段 {field_kind}")))?;
        if field.statements.is_empty() || field.status == "not_found" {
            return Err(AiError::InvalidInput(format!(
                "字段 {field_kind} 没有可确认内容"
            )));
        }
        fields.push(field.clone());
    }
    Ok(fields)
}
