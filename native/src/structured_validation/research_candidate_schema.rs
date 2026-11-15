//! Existing research candidate schema policy, without generation ownership changes.
use research_workbench_native_sdk::candidate_contracts::CandidateValidationError as AiError;
#[cfg(test)]
use research_workbench_native_sdk::candidate_contracts::{
    DerivedResearchViewCandidateItem, ReferenceFieldCandidate,
};
use research_workbench_native_sdk::candidate_contracts::{
    DerivedResearchViewCandidatePayload, ReferenceRecordCandidatePayload,
};
use std::collections::HashSet;

pub(crate) fn validate_reference_record(
    mut payload: ReferenceRecordCandidatePayload,
    allowed: &HashSet<String>,
) -> Result<ReferenceRecordCandidatePayload, AiError> {
    validate_header(
        &payload.kind,
        payload.schema_version,
        "reference_record_candidate_v1",
    )?;
    normalize_required(&mut payload.raw_text, 8_000, "参考条目原文")?;
    validate_evidence(&payload.evidence_item_ids, 1, 4, allowed)?;
    if payload.fields.len() > 4 || payload.uncertainties.len() > 12 {
        return Err(invalid("参考条目字段或不确定性数量超限"));
    }
    let mut field_names = HashSet::new();
    for field in &mut payload.fields {
        if !matches!(field.name.as_str(), "title" | "authors" | "year" | "doi")
            || !field_names.insert(field.name.clone())
        {
            return Err(invalid("参考条目字段名称无效或重复"));
        }
        normalize_required(&mut field.value, 2_000, "参考条目字段")?;
        validate_evidence(&field.evidence_item_ids, 1, 4, allowed)?;
    }
    for uncertainty in &mut payload.uncertainties {
        normalize_required(uncertainty, 1_000, "参考条目不确定性")?;
    }
    Ok(payload)
}

pub(crate) fn validate_derived_view(
    mut payload: DerivedResearchViewCandidatePayload,
    allowed: &HashSet<String>,
) -> Result<DerivedResearchViewCandidatePayload, AiError> {
    validate_header(
        &payload.kind,
        payload.schema_version,
        "derived_research_view_v1",
    )?;
    if !matches!(
        payload.view_kind.as_str(),
        "taxonomy" | "historical_context" | "gap_hypothesis" | "innovation_hypothesis"
    ) || !(1..=24).contains(&payload.items.len())
    {
        return Err(invalid("派生视图类型或条目数量无效"));
    }
    normalize_required(&mut payload.title, 240, "派生视图标题")?;
    normalize_required(&mut payload.scope_note, 4_000, "派生视图范围说明")?;
    let hypothesis_view = matches!(
        payload.view_kind.as_str(),
        "gap_hypothesis" | "innovation_hypothesis"
    );
    let mut item_ids = HashSet::new();
    for item in &mut payload.items {
        normalize_id(&mut item.id, &mut item_ids)?;
        normalize_required(&mut item.text, 4_000, "派生视图条目")?;
        let minimum = match item.epistemic_role.as_str() {
            "synthesis" => 2,
            "inference" | "hypothesis" => 1,
            _ => return Err(invalid("派生视图认识角色无效")),
        };
        if hypothesis_view && item.epistemic_role != "hypothesis" {
            return Err(invalid("领域空白和创新视图只能包含假设"));
        }
        validate_evidence(&item.evidence_item_ids, minimum, 16, allowed)?;
    }
    Ok(payload)
}

fn validate_header(kind: &str, version: i64, expected: &str) -> Result<(), AiError> {
    if kind == expected && version == 1 {
        Ok(())
    } else {
        Err(invalid("研究候选类型或 schema 版本无效"))
    }
}

fn normalize_id(value: &mut String, seen: &mut HashSet<String>) -> Result<(), AiError> {
    *value = value.trim().to_owned();
    let mut chars = value.chars();
    let valid = chars.next().is_some_and(|item| item.is_ascii_lowercase())
        && chars.all(|item| {
            item.is_ascii_lowercase() || item.is_ascii_digit() || matches!(item, '_' | '-')
        });
    if value.len() > 80 || !valid || !seen.insert(value.clone()) {
        Err(invalid("研究候选条目 ID 无效或重复"))
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

fn validate_evidence(
    values: &[String],
    minimum: usize,
    maximum: usize,
    allowed: &HashSet<String>,
) -> Result<(), AiError> {
    let unique = values.iter().collect::<HashSet<_>>();
    if values.len() < minimum
        || values.len() > maximum
        || unique.len() != values.len()
        || values.iter().any(|value| !allowed.contains(value))
    {
        Err(invalid(
            "研究候选引用了越界、重复或数量无效的 Evidence Item",
        ))
    } else {
        Ok(())
    }
}

fn invalid(message: &str) -> AiError {
    AiError::InvalidInput(message.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed() -> HashSet<String> {
        ["E1", "E2"].into_iter().map(str::to_owned).collect()
    }

    #[test]
    fn reference_fields_remain_unverified_candidates_with_bounded_evidence() {
        let candidate = validate_reference_record(
            ReferenceRecordCandidatePayload {
                kind: "reference_record_candidate_v1".to_owned(),
                schema_version: 1,
                raw_text: "Doe (2024). Grounded research systems.".to_owned(),
                evidence_item_ids: vec!["E1".to_owned()],
                fields: vec![ReferenceFieldCandidate {
                    name: "title".to_owned(),
                    value: "Grounded research systems".to_owned(),
                    evidence_item_ids: vec!["E1".to_owned()],
                }],
                uncertainties: vec!["DOI is absent from the selected text.".to_owned()],
            },
            &allowed(),
        )
        .expect("valid reference candidate");

        assert_eq!(candidate.fields[0].name, "title");
    }

    #[test]
    fn derived_views_reject_factualized_hypotheses_and_out_of_scope_evidence() {
        let factualized_gap = DerivedResearchViewCandidatePayload {
            kind: "derived_research_view_v1".to_owned(),
            schema_version: 1,
            view_kind: "gap_hypothesis".to_owned(),
            title: "Candidate gaps".to_owned(),
            scope_note: "Selected matrix revisions only.".to_owned(),
            items: vec![DerivedResearchViewCandidateItem {
                id: "gap_1".to_owned(),
                text: "No study evaluates retention.".to_owned(),
                epistemic_role: "inference".to_owned(),
                evidence_item_ids: vec!["OUTSIDE".to_owned()],
                has_conflict: false,
            }],
        };

        assert!(validate_derived_view(factualized_gap, &allowed()).is_err());
    }

    #[test]
    fn synthesis_requires_evidence_from_at_least_two_frozen_items() {
        let one_source = DerivedResearchViewCandidatePayload {
            kind: "derived_research_view_v1".to_owned(),
            schema_version: 1,
            view_kind: "taxonomy".to_owned(),
            title: "Approach taxonomy".to_owned(),
            scope_note: "Selected matrix revisions only.".to_owned(),
            items: vec![DerivedResearchViewCandidateItem {
                id: "family_1".to_owned(),
                text: "The papers form two approach families.".to_owned(),
                epistemic_role: "synthesis".to_owned(),
                evidence_item_ids: vec!["E1".to_owned()],
                has_conflict: false,
            }],
        };

        assert!(validate_derived_view(one_source, &allowed()).is_err());
    }
}
