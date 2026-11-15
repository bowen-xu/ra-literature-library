//! Original manual reading-unit normalization and decision order; no I/O owner.
use research_workbench_native_sdk::reading_units::{
    ReadingUnitPlanV1, ReadingUnitPreparationV1, ReadingUnitRejectionV1 as Reject,
    ReadingUnitRequestV1, ReadingUnitRulesV1, StructuredReadingUnitDraft,
};

pub(super) const UNIT_KINDS: &[&str] = &[
    "research_question",
    "approach",
    "key_result",
    "conclusion",
    "limitation",
    "open_question",
    "argument",
    "objection",
    "response",
    "other",
];
pub(super) const EPISTEMIC_ROLES: &[&str] = &[
    "source_paraphrase",
    "synthesis",
    "inference",
    "hypothesis",
    "question",
    "working_note",
];
pub mod accepted;

pub fn validate_and_normalize(draft: &mut StructuredReadingUnitDraft) -> Result<(), Reject> {
    draft.title = draft.title.trim().to_owned();
    draft.body = draft.body.trim().to_owned();
    if draft.body.is_empty() {
        return Err(Reject::EmptyBody);
    }
    if draft.title.chars().count() > 240 {
        return Err(Reject::TitleTooLong);
    }
    if !UNIT_KINDS.contains(&draft.unit_kind.as_str()) {
        return Err(Reject::UnitKind);
    }
    if !EPISTEMIC_ROLES.contains(&draft.epistemic_role.as_str()) {
        return Err(Reject::EpistemicRole);
    }
    if !["supports", "opposes", "context"]
        .contains(&draft.evidence_stance.as_deref().unwrap_or("context"))
    {
        return Err(Reject::EvidenceStance);
    }
    Ok(())
}
pub fn prepare(input: ReadingUnitRequestV1) -> ReadingUnitPreparationV1 {
    let plan = match &input {
        ReadingUnitRequestV1::List {
            project_id,
            paper_id,
        } => ReadingUnitPlanV1::List {
            project_id: project_id.clone(),
            paper_id: paper_id.clone(),
        },
        ReadingUnitRequestV1::Save { draft } => {
            let mut normalized = draft.as_ref().clone();
            if let Err(reason) = validate_and_normalize(&mut normalized) {
                return ReadingUnitPreparationV1::Rejected {
                    input: Box::new(input),
                    reason,
                };
            }
            ReadingUnitPlanV1::Save {
                draft: draft.clone(),
                title: normalized.title,
                body: normalized.body,
                evidence_stance: draft.evidence_stance.as_deref().unwrap_or("context").into(),
                evidence_rationale: draft
                    .evidence_rationale
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .into(),
                rules: Box::new(ReadingUnitRulesV1 {
                    provenance_kind: "human_original".into(),
                    object_kind: "reading_unit".into(),
                    editor_kind: "human".into(),
                    change_reason: draft
                        .change_reason
                        .as_deref()
                        .unwrap_or("manual_save")
                        .into(),
                    initial_revision: 1,
                    new_expected_rejection: (draft.id.is_none()
                        && draft.expected_revision.is_some())
                    .then_some(Reject::NewExpectedRevision),
                }),
            }
        }
    };
    ReadingUnitPreparationV1::Ready {
        plan: Box::new(plan),
    }
}

#[cfg(test)]
mod tests;
