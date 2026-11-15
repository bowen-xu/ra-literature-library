//! Existing knowledge candidate schema policy, without generation ownership changes.
use research_workbench_native_sdk::candidate_contracts::CandidateValidationError as AiError;
use research_workbench_native_sdk::candidate_contracts::RELATION_PREDICATE_KINDS;
use research_workbench_native_sdk::candidate_contracts::{
    AttentionSuggestionPayload, ConceptSuggestionPayload, DefinitionSuggestionPayload,
    RelationSuggestionPayload,
};
use std::collections::HashSet;

pub(crate) fn validate_concepts(
    mut payload: ConceptSuggestionPayload,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<ConceptSuggestionPayload, AiError> {
    validate_payload_header(
        &payload.kind,
        payload.schema_version,
        "concept_suggestion_v1",
    )?;
    validate_suggestion_count(payload.suggestions.len())?;
    let mut seen = HashSet::new();
    for suggestion in &mut payload.suggestions {
        validate_id(&mut suggestion.id, &mut seen)?;
        normalize_required(&mut suggestion.term, 200, "概念语词")?;
        normalize_required(&mut suggestion.explanation, 2_000, "概念解释")?;
        normalize_optional(&mut suggestion.language, 40, "概念语言")?;
        normalize_optional(&mut suggestion.disambiguation, 500, "概念消歧说明")?;
        normalize_optional(&mut suggestion.domain, 200, "概念领域")?;
        normalize_optional(&mut suggestion.tradition, 200, "概念传统")?;
        normalize_optional(&mut suggestion.period, 120, "概念时期")?;
        validate_grounding(
            &suggestion.epistemic_role,
            &suggestion.evidence_item_ids,
            allowed_evidence_ids,
        )?;
    }
    Ok(payload)
}

pub(crate) fn validate_definitions(
    mut payload: DefinitionSuggestionPayload,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<DefinitionSuggestionPayload, AiError> {
    validate_payload_header(
        &payload.kind,
        payload.schema_version,
        "definition_suggestion_v1",
    )?;
    validate_suggestion_count(payload.suggestions.len())?;
    let mut seen = HashSet::new();
    for suggestion in &mut payload.suggestions {
        validate_id(&mut suggestion.id, &mut seen)?;
        normalize_required(&mut suggestion.term, 200, "定义语词")?;
        normalize_required(&mut suggestion.statement, 2_000, "定义陈述")?;
        normalize_optional(&mut suggestion.scope_note, 1_000, "定义范围")?;
        validate_grounding(
            &suggestion.epistemic_role,
            &suggestion.evidence_item_ids,
            allowed_evidence_ids,
        )?;
    }
    Ok(payload)
}

pub(crate) fn validate_relations(
    mut payload: RelationSuggestionPayload,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<RelationSuggestionPayload, AiError> {
    validate_payload_header(
        &payload.kind,
        payload.schema_version,
        "relation_suggestion_v1",
    )?;
    validate_suggestion_count(payload.suggestions.len())?;
    let mut seen = HashSet::new();
    for suggestion in &mut payload.suggestions {
        validate_id(&mut suggestion.id, &mut seen)?;
        normalize_required(&mut suggestion.subject_term, 200, "关系起点语词")?;
        normalize_required(&mut suggestion.object_term, 200, "关系终点语词")?;
        if suggestion.subject_term == suggestion.object_term
            || !RELATION_PREDICATE_KINDS.contains(&suggestion.predicate_kind.as_str())
        {
            return Err(invalid("关系候选端点或关系类型无效"));
        }
        normalize_optional(&mut suggestion.scope_note, 1_000, "关系范围")?;
        validate_grounding(
            &suggestion.epistemic_role,
            &suggestion.evidence_item_ids,
            allowed_evidence_ids,
        )?;
    }
    Ok(payload)
}

pub(crate) fn validate_attention(
    mut payload: AttentionSuggestionPayload,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<AttentionSuggestionPayload, AiError> {
    validate_payload_header(
        &payload.kind,
        payload.schema_version,
        "attention_suggestion_v1",
    )?;
    validate_suggestion_count(payload.suggestions.len())?;
    let mut seen = HashSet::new();
    for suggestion in &mut payload.suggestions {
        validate_id(&mut suggestion.id, &mut seen)?;
        normalize_required(&mut suggestion.title, 240, "注意力标题")?;
        normalize_required(&mut suggestion.reason, 2_000, "注意力理由")?;
        if !matches!(suggestion.priority.as_str(), "high" | "medium" | "low") {
            return Err(invalid("注意力优先级无效"));
        }
        validate_evidence(&suggestion.evidence_item_ids, 1, allowed_evidence_ids)?;
    }
    Ok(payload)
}

fn validate_payload_header(kind: &str, version: i64, expected: &str) -> Result<(), AiError> {
    if kind == expected && version == 1 {
        Ok(())
    } else {
        Err(invalid("知识候选类型或 schema 版本无效"))
    }
}

fn validate_suggestion_count(count: usize) -> Result<(), AiError> {
    if (1..=12).contains(&count) {
        Ok(())
    } else {
        Err(invalid("知识候选条目数量无效"))
    }
}

fn validate_id(id: &mut String, seen: &mut HashSet<String>) -> Result<(), AiError> {
    *id = id.trim().to_owned();
    let mut characters = id.chars();
    let valid = characters
        .next()
        .is_some_and(|first| first.is_ascii_lowercase())
        && characters.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '_' | '-')
        });
    if id.len() > 64 || !valid || !seen.insert(id.clone()) {
        Err(invalid("知识候选 ID 无效或重复"))
    } else {
        Ok(())
    }
}

fn normalize_required(value: &mut String, maximum: usize, label: &str) -> Result<(), AiError> {
    *value = value.trim().to_owned();
    if value.is_empty() || value.chars().count() > maximum {
        Err(invalid(&format!("{label}无效")))
    } else {
        Ok(())
    }
}

fn normalize_optional(
    value: &mut Option<String>,
    maximum: usize,
    label: &str,
) -> Result<(), AiError> {
    if let Some(content) = value {
        normalize_required(content, maximum, label)?;
    }
    Ok(())
}

fn validate_grounding(
    role: &str,
    evidence_item_ids: &[String],
    allowed_evidence_ids: &HashSet<String>,
) -> Result<(), AiError> {
    let minimum = match role {
        "synthesis" => 2,
        "source_paraphrase" | "inference" | "uncertain" => 1,
        _ => return Err(invalid("知识候选认识角色无效")),
    };
    validate_evidence(evidence_item_ids, minimum, allowed_evidence_ids)
}

fn validate_evidence(
    evidence_item_ids: &[String],
    minimum: usize,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<(), AiError> {
    let mut seen = HashSet::new();
    if evidence_item_ids.len() < minimum
        || evidence_item_ids.len() > 8
        || evidence_item_ids
            .iter()
            .any(|id| id.len() > 80 || !allowed_evidence_ids.contains(id) || !seen.insert(id))
    {
        Err(invalid("知识候选证据数量、范围或唯一性无效"))
    } else {
        Ok(())
    }
}

fn invalid(message: &str) -> AiError {
    AiError::InvalidInput(message.to_owned())
}
