//! Original confirmation qualification and field interpretation over owned values.
use research_workbench_native_sdk::{
    candidate_contracts::{CandidateValidationError as AiError, PaperOverviewField},
    candidate_review::contracts::AiCandidate,
    paper_confirmation::contracts::{
        AiOverviewFieldConfirmationDraft, AiPaperReviewConfirmationDraft,
    },
};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

const CONFIRMABLE_METADATA_FIELDS: [&str; 14] = [
    "itemType",
    "title",
    "abstractText",
    "issuedYear",
    "containerTitle",
    "volume",
    "issue",
    "pages",
    "doi",
    "url",
    "language",
    "bibtexKey",
    "creators",
    "tags",
];

pub fn validate_confirmation_draft(
    draft: &AiOverviewFieldConfirmationDraft,
) -> Result<(), AiError> {
    if draft.field_kinds.is_empty()
        || !matches!(draft.scope_kind.as_str(), "field" | "block" | "paper")
        || draft.idempotency_key.trim().is_empty()
        || draft.idempotency_key.chars().count() > 200
    {
        return Err(AiError::InvalidInput("字段确认参数无效".to_owned()));
    }
    Ok(())
}
pub fn latest_field_editor(
    candidate: &AiCandidate,
    field_kind: &str,
) -> Result<&'static str, AiError> {
    let mut previous_hash = None;
    let mut editor = "ai_unchanged";
    for revision in &candidate.revisions {
        let field = revision.payload["fields"]
            .as_array()
            .and_then(|fields| {
                fields.iter().find(|field| {
                    field.get("field").and_then(serde_json::Value::as_str) == Some(field_kind)
                })
            })
            .ok_or_else(|| AiError::InvalidInput("候选修订缺少结构化字段".to_owned()))?;
        let current_hash = hash_value(field)?;
        if previous_hash.as_ref() != Some(&current_hash) {
            editor = if revision.editor_kind == "human" {
                "human_edited"
            } else {
                "ai_unchanged"
            };
            previous_hash = Some(current_hash);
        }
    }
    Ok(editor)
}
pub fn field_hash(field: &PaperOverviewField) -> Result<String, AiError> {
    crate::candidate_revision::field_hash(field)
}
pub fn hash_value(value: &serde_json::Value) -> Result<String, AiError> {
    let json = serde_json::to_string(value)
        .map_err(|_| AiError::InvalidInput("无法规范化概要字段".to_owned()))?;
    Ok(format!("{:x}", Sha256::digest(json.as_bytes())))
}
pub fn overview_field_role(field: &PaperOverviewField) -> &'static str {
    let first = field
        .statements
        .first()
        .map(|statement| statement.epistemic_role.as_str())
        .unwrap_or("synthesis");
    if field
        .statements
        .iter()
        .all(|statement| statement.epistemic_role == first)
    {
        match first {
            "source_paraphrase" => "source_paraphrase",
            "inference" => "inference",
            "hypothesis" => "hypothesis",
            "question" => "question",
            "working_note" => "working_note",
            _ => "synthesis",
        }
    } else {
        "synthesis"
    }
}
pub fn field_label(field: &str) -> &str {
    match field {
        "research_question" => "研究问题",
        "approach" => "研究方法",
        "key_result" => "关键结果",
        "conclusion" => "结论",
        "limitation" => "局限",
        "open_question" => "开放问题",
        "argument" => "论证",
        "objection" => "反对意见",
        "response" => "回应",
        _ => field,
    }
}

pub fn normalize_paper_draft(draft: &mut AiPaperReviewConfirmationDraft) -> Result<(), AiError> {
    if draft.paper_id.trim().is_empty() {
        return Err(AiError::InvalidInput("文献 ID 不能为空".to_owned()));
    }
    draft.project_id = None;
    validate_key(&draft.idempotency_key, "确认幂等键")?;
    draft.metadata_field_names.sort();
    draft.metadata_field_names.dedup();
    if let Some(field) = draft
        .metadata_field_names
        .iter()
        .find(|field| !CONFIRMABLE_METADATA_FIELDS.contains(&field.as_str()))
    {
        return Err(AiError::InvalidInput(format!(
            "元数据确认字段无效：{field}"
        )));
    }
    for target in &mut draft.overview_targets {
        target.field_kinds.sort();
        target.field_kinds.dedup();
    }
    draft
        .overview_targets
        .sort_by(|left, right| left.candidate_id.cmp(&right.candidate_id));
    if draft.metadata_field_names.is_empty() && draft.overview_targets.is_empty() {
        return Err(AiError::InvalidInput("文献确认范围不能为空".to_owned()));
    }
    if draft
        .overview_targets
        .iter()
        .any(|target| target.field_kinds.is_empty())
    {
        return Err(AiError::InvalidInput(
            "结构化阅读确认字段不能为空".to_owned(),
        ));
    }
    let ids = draft
        .overview_targets
        .iter()
        .map(|target| &target.candidate_id)
        .collect::<HashSet<_>>();
    if ids.len() != draft.overview_targets.len() {
        return Err(AiError::InvalidInput(
            "同一候选不能在文献批次中重复".to_owned(),
        ));
    }
    Ok(())
}
pub fn validate_key(value: &str, label: &str) -> Result<(), AiError> {
    if value.trim().is_empty() || value.chars().count() > 200 {
        return Err(AiError::InvalidInput(format!("{label}无效")));
    }
    Ok(())
}
