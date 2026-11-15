//! Original generic candidate review policy over shared owned values.
use research_workbench_native_sdk::{
    candidate_contracts::CandidateValidationError as AiError,
    candidate_review::contracts::{AiReviewDecisionDraft, GenericCandidateObservation},
};
pub mod derived;
pub mod generic;
pub mod items;
pub mod reference;

pub fn validate_draft(draft: &AiReviewDecisionDraft) -> Result<(), AiError> {
    if draft.idempotency_key.trim().is_empty()
        || draft.idempotency_key.len() > 200
        || draft.rationale.chars().count() > 2_000
        || draft
            .reading_unit_title
            .as_ref()
            .is_some_and(|title| title.chars().count() > 240)
    {
        return Err(AiError::InvalidInput("审查决定参数无效".to_owned()));
    }
    Ok(())
}

pub fn action_semantics<'a>(
    draft: &AiReviewDecisionDraft,
    candidate: &'a GenericCandidateObservation,
) -> Result<(&'a str, Option<&'static str>), AiError> {
    let editor_kind = candidate
        .current_editor_kind
        .as_deref()
        .ok_or_else(|| AiError::InvalidInput("候选缺少当前修订".to_owned()))?;
    let promotes_through_generic_review = matches!(
        candidate.candidate_kind.as_str(),
        "paper_portrait_v1"
            | "selection_explanation_v1"
            | "paper_overview_unit_v1"
            | "reference_record_candidate_v1"
            | "derived_research_view_v1"
    );
    match (draft.action.as_str(), editor_kind) {
        ("accept_unchanged" | "accept_after_edit", _) if !promotes_through_generic_review => {
            Err(AiError::InvalidInput(
                "该候选必须在类型专用审查中消歧并确认目标，不能创建通用阅读单元".to_owned(),
            ))
        }
        ("accept_unchanged", "ai" | "ai_retry") => {
            Ok(("accepted_unchanged", Some("ai_accepted_unchanged")))
        }
        ("accept_after_edit", "human") => {
            Ok(("accepted_after_edit", Some("ai_accepted_after_edit")))
        }
        ("reject", _) => Ok(("rejected", None)),
        ("defer", _) => Ok(("deferred", None)),
        ("request_more_evidence", _) => Ok(("needs_more_evidence", None)),
        ("accept_unchanged" | "accept_after_edit", _) => Err(AiError::InvalidInput(
            "接受方式与当前候选版本不匹配".to_owned(),
        )),
        _ => Err(AiError::InvalidInput("未知的审查动作".to_owned())),
    }
}

pub fn validate_candidate(
    draft: &AiReviewDecisionDraft,
    candidate: &GenericCandidateObservation,
) -> Result<(), AiError> {
    if candidate.has_active_confirmations {
        return Err(AiError::InvalidInput(
            "结构化阅读候选已开始字段确认，请继续使用字段或整块确认".to_owned(),
        ));
    }
    if matches!(
        candidate.review_state.as_str(),
        "accepted_unchanged" | "accepted_after_edit" | "rejected"
    ) {
        return Err(AiError::InvalidInput("该候选的审查已经结束".to_owned()));
    }
    if candidate.current_revision != draft.candidate_revision {
        return Err(AiError::InvalidInput(
            "候选版本已变化，请重新审查当前版本".to_owned(),
        ));
    }
    if candidate.has_revision_item_decisions {
        return Err(AiError::InvalidInput(
            "该候选已开始逐条审查，请继续处理各建议条目".to_owned(),
        ));
    }
    Ok(())
}
pub fn validate_replay(
    draft: &AiReviewDecisionDraft,
    existing: &(String, i64, String, String),
) -> Result<(), AiError> {
    if existing.0 != draft.candidate_id
        || existing.1 != draft.candidate_revision
        || existing.2 != draft.action
        || existing.3 != draft.rationale.trim()
    {
        return Err(AiError::InvalidInput(
            "审查幂等键已被不同的决定参数使用".to_owned(),
        ));
    }
    Ok(())
}

pub fn requires_inspection(
    draft: &AiReviewDecisionDraft,
    candidate: &GenericCandidateObservation,
) -> bool {
    draft.action == "accept_unchanged" && candidate.candidate_kind != "paper_portrait_v1"
}
pub fn requires_citations(
    draft: &AiReviewDecisionDraft,
    candidate: &GenericCandidateObservation,
) -> bool {
    candidate.candidate_kind != "paper_portrait_v1"
        && matches!(
            draft.action.as_str(),
            "accept_unchanged" | "accept_after_edit"
        )
}
pub fn validate_inspection(inspected: bool) -> Result<(), AiError> {
    if inspected {
        Ok(())
    } else {
        Err(AiError::InvalidInput(
            "原样接受前必须先打开至少一条候选证据".to_owned(),
        ))
    }
}
pub fn validate_project_membership(contains: bool) -> Result<(), AiError> {
    if contains {
        Ok(())
    } else {
        Err(AiError::InvalidInput(
            "所选项目不包含该证据对应的文献".to_owned(),
        ))
    }
}
pub fn decide(
    input: research_workbench_native_sdk::candidate_review::wire::ReviewInputV1,
) -> research_workbench_native_sdk::candidate_review::wire::ReviewDecisionV1 {
    use research_workbench_native_sdk::candidate_review::wire::{
        GenericReviewSemanticsV1, ReviewDecisionV1 as Decision, ReviewInputV1 as Input,
    };
    match input {
        Input::GenericPromotion { input } => Decision::GenericPromotion {
            result: generic::prepare(&input).map(Box::new),
        },
        Input::ReadingUnitValidation { draft, .. } => Decision::ReadingUnitValidation {
            rejection: crate::reading_units::accepted::validate(&draft).err(),
        },
        Input::DerivedPromotion { input } => Decision::DerivedPromotion {
            result: derived::prepare(&input).map(Box::new),
        },
        Input::DerivedValidation { input } => Decision::DerivedValidation {
            rejection: crate::derived_view::validate(&input).err(),
        },
        Input::ReferencePromotion { input } => Decision::ReferencePromotion {
            result: reference::prepare(&input).map(Box::new),
        },
        Input::ValidateDraft { draft } => Decision::Validated {
            rejection: validate_draft(&draft).err(),
        },
        Input::Replay { draft, existing } => Decision::Validated {
            rejection: validate_replay(&draft, &existing).err(),
        },
        Input::Candidate { draft, observation } => Decision::Candidate {
            result: validate_candidate(&draft, &observation)
                .and_then(|()| action_semantics(&draft, &observation))
                .map(|(state, provenance)| GenericReviewSemanticsV1 {
                    review_state: state.to_owned(),
                    provenance: provenance.map(str::to_owned),
                    requires_inspection: requires_inspection(&draft, &observation),
                    requires_citations: requires_citations(&draft, &observation),
                }),
        },
        Input::Inspection { inspected } => Decision::Validated {
            rejection: validate_inspection(inspected).err(),
        },
        Input::ProjectMembership { contains } => Decision::Validated {
            rejection: validate_project_membership(contains).err(),
        },
    }
}

#[cfg(test)]
mod tests;

pub mod paper;
