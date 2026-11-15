//! Original concept normalization and validation. No database, clock or IO owner.
use research_workbench_native_sdk::{
    concepts::{
        ConceptDraft, ConceptPlanV1, ConceptPreparationV1, ConceptRejectionV1 as Reject,
        ConceptRequestV1, ConceptRulesV1, ConceptTermPlanV1, NewConceptDetails,
    },
    nal_bootstrap::BootstrapRejectionV1,
};

pub fn validate_details(details: &NewConceptDetails) -> Result<(), Reject> {
    crate::nal_bootstrap::validate_name(&details.label).map_err(|reason| match reason {
        BootstrapRejectionV1::EmptyNameContext => Reject::EmptyNameContext,
        _ => Reject::InvalidNameLength,
    })?;
    if details.label.chars().count() > 500
        || details.disambiguation.chars().count() > 1_000
        || details.domain.chars().count() > 500
        || details.tradition.chars().count() > 500
        || details.period.chars().count() > 200
    {
        return Err(Reject::FieldsTooLong);
    }
    Ok(())
}

pub fn prepare_term(text: &str, language: &str) -> ConceptTermPlanV1 {
    let text = text.trim();
    let language = language.trim();
    let normalized_text = crate::nal_bootstrap::normalize_term(text);
    let rejection = if normalized_text.is_empty() {
        Some(Reject::EmptyTerm)
    } else if text.chars().count() > 500 || language.chars().count() > 32 {
        Some(Reject::TermTooLong)
    } else {
        None
    };
    ConceptTermPlanV1 {
        text: text.into(),
        normalized_text,
        language: language.into(),
        rejection,
    }
}

pub fn normalize_details(details: &NewConceptDetails) -> NewConceptDetails {
    NewConceptDetails {
        label: details.label.trim().into(),
        explanation: details.explanation.trim().into(),
        disambiguation: details.disambiguation.trim().into(),
        domain: details.domain.trim().into(),
        tradition: details.tradition.trim().into(),
        period: details.period.trim().into(),
        change_reason: details.change_reason.clone(),
    }
}

pub fn details(draft: &ConceptDraft) -> NewConceptDetails {
    NewConceptDetails {
        label: draft.label.clone(),
        explanation: draft.explanation.clone(),
        disambiguation: draft.disambiguation.clone(),
        domain: draft.domain.clone(),
        tradition: draft.tradition.clone(),
        period: draft.period.clone(),
        change_reason: draft.change_reason.clone(),
    }
}

pub fn prepare_search(query: &str) -> (String, String) {
    let normalized = crate::nal_bootstrap::normalize_term(query);
    let pattern = format!("%{normalized}%");
    (normalized, pattern)
}

pub fn concept_reason(change_reason: Option<&str>, existing: bool) -> &str {
    change_reason.unwrap_or(if existing {
        "manual_edit"
    } else {
        "manual_create"
    })
}

pub fn prepare(input: ConceptRequestV1) -> ConceptPreparationV1 {
    let plan = match &input {
        ConceptRequestV1::Search { query } => {
            let (normalized, pattern) = prepare_search(query);
            ConceptPlanV1::Search {
                query: query.clone(),
                pattern,
                normalized,
            }
        }
        ConceptRequestV1::Save { draft } => {
            let details = details(draft);
            if let Err(reason) = validate_details(&details) {
                return ConceptPreparationV1::Rejected {
                    input: Box::new(input),
                    reason,
                };
            }
            ConceptPlanV1::Save {
                draft: draft.clone(),
                details: Box::new(normalize_details(&details)),
                term: prepare_term(
                    &draft.preferred_term,
                    draft.language.as_deref().unwrap_or(""),
                ),
                rules: ConceptRulesV1 {
                    provenance_kind: "human_original".into(),
                    editor_kind: "human".into(),
                    initial_revision: 1,
                    term_object_kind: "term".into(),
                    concept_object_kind: "concept".into(),
                    term_reason: "manual_create".into(),
                    concept_reason: concept_reason(
                        draft.change_reason.as_deref(),
                        draft.id.is_some(),
                    )
                    .into(),
                    new_expected_rejection: if draft.id.is_none()
                        && draft.expected_revision.is_some()
                    {
                        Some(Reject::NewExpectedRevision)
                    } else {
                        None
                    },
                },
            }
        }
    };
    ConceptPreparationV1::Ready {
        plan: Box::new(plan),
    }
}

#[cfg(test)]
mod tests;
