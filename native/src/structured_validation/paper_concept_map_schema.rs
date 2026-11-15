//! Existing paper-concept schema policy; generation and review are unchanged.
use research_workbench_native_sdk::candidate_contracts::CandidateValidationError as AiError;
use research_workbench_native_sdk::candidate_contracts::{
    PaperConceptMapPayload, PaperConceptPayload,
};
use std::collections::HashSet;

pub(super) const FUNCTIONS: [&str; 3] = ["foundational", "prerequisite", "focal"];
pub(super) const NOVELTY_STATUSES: [&str; 4] = [
    "pre_existing",
    "adapted_by_paper",
    "introduced_by_paper",
    "unclear",
];
pub(super) const EXPLANATION_STATUSES: [&str; 3] = [
    "explained_in_paper",
    "mentioned_only",
    "insufficient_evidence",
];
pub(super) const SURFACE_RELATIONS: [&str; 5] = [
    "preferred",
    "alias",
    "translation",
    "abbreviation",
    "variant",
];
pub(super) const RELATION_KINDS: [&str; 6] = [
    "depends_on",
    "builds_on",
    "extends",
    "redefines",
    "contrasts_with",
    "part_of",
];
pub(super) const OMISSION_REASONS: [&str; 3] =
    ["not_key", "insufficient_context", "reference_only"];

pub(crate) fn validate_paper_concept_map(
    mut payload: PaperConceptMapPayload,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<PaperConceptMapPayload, AiError> {
    if payload.kind != "paper_concept_map_v1"
        || payload.schema_version != 1
        || payload.concepts.is_empty()
        || payload.concepts.len() > 24
        || payload.relations.len() > 48
        || payload.omissions.len() > 48
    {
        return Err(invalid("论文概念图类型、版本或条目数量无效"));
    }
    let mut concept_ids = HashSet::new();
    let mut definition_ids = HashSet::new();
    for concept in &mut payload.concepts {
        validate_concept(
            concept,
            allowed_evidence_ids,
            &mut concept_ids,
            &mut definition_ids,
        )?;
    }
    let mut relation_ids = HashSet::new();
    for relation in &mut payload.relations {
        trim_required(&mut relation.id, 80, "概念关系 ID 无效")?;
        if !valid_local_id(&relation.id) || !relation_ids.insert(relation.id.clone()) {
            return Err(invalid("概念关系 ID 重复或无效"));
        }
        trim_required(
            &mut relation.subject_concept_candidate_id,
            80,
            "概念关系起点无效",
        )?;
        trim_required(
            &mut relation.object_concept_candidate_id,
            80,
            "概念关系终点无效",
        )?;
        if relation.subject_concept_candidate_id == relation.object_concept_candidate_id
            || !concept_ids.contains(&relation.subject_concept_candidate_id)
            || !concept_ids.contains(&relation.object_concept_candidate_id)
            || !RELATION_KINDS.contains(&relation.predicate_kind.as_str())
        {
            return Err(invalid("概念关系端点、谓词或自环无效"));
        }
        trim_optional(&mut relation.scope_note, 2_000, "概念关系范围说明无效")?;
        validate_evidence(
            &mut relation.evidence_item_ids,
            allowed_evidence_ids,
            12,
            true,
        )?;
    }
    for omission in &mut payload.omissions {
        trim_required(&mut omission.term, 240, "省略术语无效")?;
        if !OMISSION_REASONS.contains(&omission.reason.as_str()) {
            return Err(invalid("省略原因无效"));
        }
        validate_evidence(
            &mut omission.evidence_item_ids,
            allowed_evidence_ids,
            8,
            false,
        )?;
    }
    Ok(payload)
}

fn validate_concept(
    concept: &mut PaperConceptPayload,
    allowed_evidence_ids: &HashSet<String>,
    concept_ids: &mut HashSet<String>,
    definition_ids: &mut HashSet<String>,
) -> Result<(), AiError> {
    trim_required(&mut concept.id, 80, "概念局部 ID 无效")?;
    if !valid_local_id(&concept.id) || !concept_ids.insert(concept.id.clone()) {
        return Err(invalid("概念局部 ID 重复或无效"));
    }
    trim_required(&mut concept.preferred_term, 240, "概念首选词无效")?;
    if concept.surface_forms.is_empty()
        || concept.surface_forms.len() > 24
        || !FUNCTIONS.contains(&concept.paper_function.as_str())
        || !NOVELTY_STATUSES.contains(&concept.novelty_status.as_str())
        || !EXPLANATION_STATUSES.contains(&concept.explanation_status.as_str())
        || concept.definition_claims.len() > 12
        || concept.reference_mentions.len() > 16
    {
        return Err(invalid("概念角色、状态或子项数量无效"));
    }
    let mut surface_keys = HashSet::new();
    let mut preferred_count = 0;
    for form in &mut concept.surface_forms {
        trim_required(&mut form.text, 240, "概念词形无效")?;
        if let Some(language) = &mut form.language {
            trim_required(language, 32, "概念词形语言无效")?;
        }
        if !SURFACE_RELATIONS.contains(&form.relation_kind.as_str()) {
            return Err(invalid("概念词形 relationKind 不受支持"));
        }
        if !surface_keys.insert((
            form.text.clone(),
            form.language.clone().unwrap_or_default(),
            form.relation_kind.clone(),
        )) {
            return Err(invalid("同一概念包含重复词形"));
        }
        if form.relation_kind == "preferred" && form.text == concept.preferred_term {
            preferred_count += 1;
        }
        validate_evidence(&mut form.evidence_item_ids, allowed_evidence_ids, 8, false)?;
    }
    if preferred_count != 1 {
        return Err(invalid("首选词必须恰好对应一个 preferred 词形"));
    }
    trim_optional(&mut concept.explanation, 4_000, "概念解释无效")?;
    trim_optional(&mut concept.disambiguation, 2_000, "概念消歧说明无效")?;
    trim_required(&mut concept.role_rationale, 2_000, "概念角色理由无效")?;
    trim_optional(&mut concept.novelty_rationale, 2_000, "概念新颖性理由无效")?;
    validate_evidence(
        &mut concept.evidence_item_ids,
        allowed_evidence_ids,
        16,
        false,
    )?;
    for definition in &mut concept.definition_claims {
        trim_required(&mut definition.id, 80, "定义局部 ID 无效")?;
        if !valid_local_id(&definition.id) || !definition_ids.insert(definition.id.clone()) {
            return Err(invalid("定义局部 ID 重复或无效"));
        }
        trim_required(&mut definition.statement, 4_000, "定义正文无效")?;
        trim_optional(&mut definition.scope_note, 2_000, "定义范围说明无效")?;
        validate_evidence(
            &mut definition.evidence_item_ids,
            allowed_evidence_ids,
            8,
            true,
        )?;
    }
    for mention in &mut concept.reference_mentions {
        trim_required(&mut mention.citation_text, 1_000, "引用线索无效")?;
        if let Some(cited_key) = &mut mention.cited_key {
            trim_required(cited_key, 240, "引用 key 无效")?;
        }
        validate_evidence(
            &mut mention.evidence_item_ids,
            allowed_evidence_ids,
            8,
            true,
        )?;
    }
    if concept.explanation_status == "explained_in_paper"
        && (concept.explanation.is_empty() || concept.evidence_item_ids.is_empty())
    {
        return Err(invalid("本文已解释的概念必须包含解释和直接来源"));
    }
    if concept.explanation_status == "mentioned_only" && concept.reference_mentions.is_empty() {
        return Err(invalid("本文仅提及的概念必须包含引用线索"));
    }
    if concept.novelty_status == "introduced_by_paper"
        && (concept.novelty_rationale.is_empty() || concept.evidence_item_ids.is_empty())
    {
        return Err(invalid("本文提出的概念必须包含新颖性理由和直接来源"));
    }
    Ok(())
}

fn validate_evidence(
    evidence_ids: &mut Vec<String>,
    allowed_evidence_ids: &HashSet<String>,
    maximum: usize,
    required: bool,
) -> Result<(), AiError> {
    if evidence_ids.len() > maximum || required && evidence_ids.is_empty() {
        return Err(invalid("概念候选的来源数量无效"));
    }
    let mut seen = HashSet::new();
    for evidence_id in evidence_ids {
        *evidence_id = evidence_id.trim().to_owned();
        if evidence_id.is_empty()
            || evidence_id.len() > 80
            || !allowed_evidence_ids.contains(evidence_id)
            || !seen.insert(evidence_id.clone())
        {
            return Err(invalid("概念候选包含未知或重复来源 ID"));
        }
    }
    Ok(())
}

fn trim_required(value: &mut String, maximum: usize, message: &str) -> Result<(), AiError> {
    *value = value.trim().to_owned();
    if value.is_empty() || value.chars().count() > maximum {
        return Err(invalid(message));
    }
    Ok(())
}

fn trim_optional(value: &mut String, maximum: usize, message: &str) -> Result<(), AiError> {
    *value = value.trim().to_owned();
    if value.chars().count() > maximum {
        return Err(invalid(message));
    }
    Ok(())
}

fn valid_local_id(value: &str) -> bool {
    let mut chars = value.chars();
    chars.next().is_some_and(|first| first.is_ascii_lowercase())
        && chars.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || character == '_'
                || character == '-'
        })
}

fn invalid(message: &str) -> AiError {
    AiError::InvalidInput(message.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_payload() -> serde_json::Value {
        serde_json::json!({
            "kind": "paper_concept_map_v1", "schemaVersion": 1,
            "concepts": [{
                "id": "concept_x", "preferredTerm": "Concept X",
                "surfaceForms": [{"text": "Concept X", "relationKind": "preferred", "evidenceItemIds": ["P1-T1"]}],
                "paperFunction": "focal", "noveltyStatus": "introduced_by_paper",
                "explanationStatus": "explained_in_paper", "explanation": "An identity.",
                "disambiguation": "", "roleRationale": "It organizes the paper.",
                "noveltyRationale": "The authors introduce it.",
                "definitionClaims": [{"id": "definition_x", "statement": "A definition.", "scopeNote": "", "evidenceItemIds": ["P1-T1"]}],
                "evidenceItemIds": ["P1-T1"], "referenceMentions": []
            }],
            "relations": [], "omissions": []
        })
    }

    #[test]
    fn validates_grounded_concept_map() {
        let allowed = HashSet::from(["P1-T1".to_owned()]);
        let payload: PaperConceptMapPayload = serde_json::from_value(valid_payload()).unwrap();
        assert!(validate_paper_concept_map(payload, &allowed).is_ok());
    }

    #[test]
    fn rejects_unknown_evidence_and_missing_reference_clue() {
        let mut value = valid_payload();
        value["concepts"][0]["evidenceItemIds"] = serde_json::json!(["UNKNOWN"]);
        let payload: PaperConceptMapPayload = serde_json::from_value(value).unwrap();
        assert!(validate_paper_concept_map(payload, &HashSet::new()).is_err());

        let mut mentioned = valid_payload();
        mentioned["concepts"][0]["noveltyStatus"] = serde_json::json!("pre_existing");
        mentioned["concepts"][0]["explanationStatus"] = serde_json::json!("mentioned_only");
        mentioned["concepts"][0]["explanation"] = serde_json::json!("");
        mentioned["concepts"][0]["referenceMentions"] = serde_json::json!([]);
        let payload: PaperConceptMapPayload = serde_json::from_value(mentioned).unwrap();
        assert!(validate_paper_concept_map(payload, &HashSet::from(["P1-T1".to_owned()])).is_err());
    }

    #[test]
    fn distinguishes_unknown_surface_relations_from_duplicate_forms() {
        let allowed = HashSet::from(["P1-T1".to_owned()]);
        let mut unknown = valid_payload();
        unknown["concepts"][0]["surfaceForms"][0]["relationKind"] = serde_json::json!("synonym");
        let payload: PaperConceptMapPayload = serde_json::from_value(unknown).unwrap();
        assert!(
            validate_paper_concept_map(payload, &allowed)
                .unwrap_err()
                .to_string()
                .contains("relationKind 不受支持")
        );

        let mut duplicate = valid_payload();
        let form = duplicate["concepts"][0]["surfaceForms"][0].clone();
        duplicate["concepts"][0]["surfaceForms"] = serde_json::json!([form.clone(), form]);
        let payload: PaperConceptMapPayload = serde_json::from_value(duplicate).unwrap();
        assert!(
            validate_paper_concept_map(payload, &allowed)
                .unwrap_err()
                .to_string()
                .contains("重复词形")
        );
    }
}
