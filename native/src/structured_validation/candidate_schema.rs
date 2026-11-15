//! Original ten-kind decoder and normalization; no workflow or storage owner.
use super::{
    knowledge_candidate_schema::{
        validate_attention, validate_concepts, validate_definitions, validate_relations,
    },
    paper_concept_map_schema::validate_paper_concept_map,
    research_candidate_schema::{validate_derived_view, validate_reference_record},
};
use research_workbench_native_sdk::candidate_contracts::{
    AiReadingProfileRef, AtomicStatement, CandidatePayload, CandidateValidationError as AiError,
    PaperOverviewPayload, SelectionExplanationPayload,
};
pub use research_workbench_native_sdk::candidate_contracts::{
    GENERIC_OVERVIEW_FIELDS, OVERVIEW_FIELDS,
};
use std::collections::HashSet;

pub fn decode_candidate_value(
    value: serde_json::Value,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<CandidatePayload, AiError> {
    let kind = value
        .get("kind")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| invalid("候选缺少受支持的 kind"))?;
    match kind {
        "paper_portrait_v1" => {
            let payload = serde_json::from_value(value).map_err(|error| AiError::Validation {
                path: "$".into(),
                message: format!(
                    "画像 JSON 字段类型或必填字段错误：{}",
                    error.to_string().chars().take(400).collect::<String>()
                ),
            })?;
            super::paper_portrait::validate(payload, allowed_evidence_ids)
                .map(CandidatePayload::PaperPortrait)
        }
        "selection_explanation_v1" => {
            let payload = serde_json::from_value(value)
                .map_err(|_| invalid("候选不符合 selection_explanation_v1 schema"))?;
            validate_selection(payload, allowed_evidence_ids).map(CandidatePayload::Selection)
        }
        "paper_overview_unit_v1" => {
            let payload = serde_json::from_value(value).map_err(|error| {
                invalid(&format!(
                    "候选不符合 paper_overview_unit_v1 schema：{error}"
                ))
            })?;
            validate_paper_overview(payload, allowed_evidence_ids)
                .map(CandidatePayload::PaperOverview)
        }
        "paper_concept_map_v1" => {
            let payload = serde_json::from_value(value).map_err(|error| {
                invalid(&format!("候选不符合 paper_concept_map_v1 schema：{error}"))
            })?;
            validate_paper_concept_map(payload, allowed_evidence_ids)
                .map(CandidatePayload::PaperConceptMap)
        }
        "concept_suggestion_v1" => {
            let payload = serde_json::from_value(value)
                .map_err(|_| invalid("候选不符合 concept_suggestion_v1 schema"))?;
            validate_concepts(payload, allowed_evidence_ids)
                .map(CandidatePayload::ConceptSuggestion)
        }
        "definition_suggestion_v1" => {
            let payload = serde_json::from_value(value)
                .map_err(|_| invalid("候选不符合 definition_suggestion_v1 schema"))?;
            validate_definitions(payload, allowed_evidence_ids)
                .map(CandidatePayload::DefinitionSuggestion)
        }
        "relation_suggestion_v1" => {
            let payload = serde_json::from_value(value)
                .map_err(|_| invalid("候选不符合 relation_suggestion_v1 schema"))?;
            validate_relations(payload, allowed_evidence_ids)
                .map(CandidatePayload::RelationSuggestion)
        }
        "attention_suggestion_v1" => {
            let payload = serde_json::from_value(value)
                .map_err(|_| invalid("候选不符合 attention_suggestion_v1 schema"))?;
            validate_attention(payload, allowed_evidence_ids)
                .map(CandidatePayload::AttentionSuggestion)
        }
        "reference_record_candidate_v1" => {
            let payload = serde_json::from_value(value)
                .map_err(|_| invalid("候选不符合 reference_record_candidate_v1 schema"))?;
            validate_reference_record(payload, allowed_evidence_ids)
                .map(CandidatePayload::ReferenceRecord)
        }
        "derived_research_view_v1" => {
            let payload = serde_json::from_value(value)
                .map_err(|_| invalid("候选不符合 derived_research_view_v1 schema"))?;
            validate_derived_view(payload, allowed_evidence_ids)
                .map(CandidatePayload::DerivedResearchView)
        }
        _ => Err(invalid("候选 kind 不受支持")),
    }
}

fn validate_selection(
    mut payload: SelectionExplanationPayload,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<SelectionExplanationPayload, AiError> {
    if payload.kind != "selection_explanation_v1" || payload.schema_version != 1 {
        return Err(invalid("候选类型或 schema 版本不受支持"));
    }
    validate_statements(&mut payload.statements, allowed_evidence_ids, false)?;
    if payload.statements.is_empty() {
        return Err(invalid("选区解释必须包含至少一条原子陈述"));
    }
    if payload.uncertainties.len() > 12 {
        return Err(invalid("候选不确定性条目超过上限"));
    }
    for uncertainty in &mut payload.uncertainties {
        *uncertainty = uncertainty.trim().to_owned();
        if uncertainty.is_empty() || uncertainty.chars().count() > 1_000 {
            return Err(invalid("候选不确定性条目无效"));
        }
    }
    Ok(payload)
}

fn validate_paper_overview(
    mut payload: PaperOverviewPayload,
    allowed_evidence_ids: &HashSet<String>,
) -> Result<PaperOverviewPayload, AiError> {
    if payload.kind != "paper_overview_unit_v1" || payload.schema_version != 1 {
        return Err(invalid("论文概要类型、版本、profile 或字段数量无效"));
    }
    match payload.profile_id.as_str() {
        "generic_overview_v1"
            if payload.profile_refs.is_none()
                && payload.fields.len() == GENERIC_OVERVIEW_FIELDS.len() => {}
        "reviewed_profile_composition_v1"
            if payload.fields.len() <= OVERVIEW_FIELDS.len()
                && !payload.fields.is_empty()
                && valid_profile_refs(payload.profile_refs.as_deref()) => {}
        "paper_template_v1"
            if payload.profile_refs.is_none()
                && payload
                    .paper_template
                    .as_ref()
                    .is_some_and(super::template::valid_snapshot)
                && payload.fields.len()
                    == payload
                        .paper_template
                        .as_ref()
                        .map_or(0, |value| value.fields.len()) => {}
        _ => return Err(invalid("论文概要 profile 或字段数量无效")),
    }
    let mut seen_fields = HashSet::new();
    let mut seen_statements = HashSet::new();
    if payload.profile_id != "paper_template_v1" && payload.paper_template.is_some() {
        return Err(invalid("旧框架不允许模板快照"));
    }
    for (index, field) in payload.fields.iter_mut().enumerate() {
        if payload
            .paper_template
            .as_ref()
            .is_some_and(|template| template.fields[index].id != field.field)
            || payload.paper_template.is_none() && !OVERVIEW_FIELDS.contains(&field.field.as_str())
            || !seen_fields.insert(field.field.clone())
        {
            return Err(invalid("论文概要包含未知或重复字段"));
        }
        match field.status.as_str() {
            "not_found" if !field.statements.is_empty() => {
                return Err(invalid("未找到来源的概要字段不能包含陈述"));
            }
            "filled" | "partial" if field.statements.is_empty() => {
                return Err(invalid("已填写或部分填写的概要字段必须包含陈述"));
            }
            "filled" | "partial" | "not_found" => {}
            _ => return Err(invalid("论文概要包含未知字段状态")),
        }
        validate_statement_items(
            &mut field.statements,
            allowed_evidence_ids,
            &mut seen_statements,
            payload.paper_template.is_some(),
        )?;
    }
    if payload.profile_id == "generic_overview_v1"
        && !GENERIC_OVERVIEW_FIELDS
            .iter()
            .all(|field| seen_fields.contains(*field))
        || seen_statements.len() > 24
    {
        return Err(invalid("论文概要字段或原子陈述数量无效"));
    }
    Ok(payload)
}

fn valid_profile_refs(refs: Option<&[AiReadingProfileRef]>) -> bool {
    let Some(refs) = refs else {
        return false;
    };
    let mut seen = HashSet::new();
    !refs.is_empty()
        && refs.len() <= 3
        && refs.iter().all(|reference| {
            !reference.profile_id.trim().is_empty()
                && reference.profile_id.chars().count() <= 120
                && reference.profile_version >= 1
                && seen.insert((reference.profile_id.as_str(), reference.profile_version))
        })
}

fn validate_statements(
    statements: &mut [AtomicStatement],
    allowed_evidence_ids: &HashSet<String>,
    allow_empty: bool,
) -> Result<(), AiError> {
    if statements.len() > 24 || (!allow_empty && statements.is_empty()) {
        return Err(invalid("候选原子陈述数量无效"));
    }
    let mut seen = HashSet::new();
    validate_statement_items(statements, allowed_evidence_ids, &mut seen, false)
}

fn validate_statement_items(
    statements: &mut [AtomicStatement],
    allowed_evidence_ids: &HashSet<String>,
    seen_statement_ids: &mut HashSet<String>,
    template_quotes: bool,
) -> Result<(), AiError> {
    for statement in statements {
        super::template::validate_statement_quotes(statement, template_quotes)?;
        statement.id = statement.id.trim().to_owned();
        statement.text = statement.text.trim().to_owned();
        if statement.id.is_empty()
            || statement.id.len() > 80
            || !seen_statement_ids.insert(statement.id.clone())
            || statement.text.is_empty()
            || statement.text.chars().count() > 2_000
            || statement.evidence_item_ids.len() > 8
        {
            return Err(invalid("候选陈述的标识、正文或证据数量无效"));
        }
        let minimum_evidence = match statement.epistemic_role.as_str() {
            "source_paraphrase" | "inference" => 1,
            "synthesis" => 2,
            "uncertain" => 0,
            _ => return Err(invalid("候选包含未知的认识角色")),
        };
        if statement.evidence_item_ids.len() < minimum_evidence {
            return Err(invalid("候选陈述没有满足对应认识角色的最低证据要求"));
        }
        let mut cited = HashSet::new();
        for evidence_id in &statement.evidence_item_ids {
            if !allowed_evidence_ids.contains(evidence_id) || !cited.insert(evidence_id) {
                return Err(invalid("候选引用了未知或重复的 Evidence Item"));
            }
        }
    }
    Ok(())
}

fn invalid(message: &str) -> AiError {
    AiError::InvalidInput(message.to_owned())
}
