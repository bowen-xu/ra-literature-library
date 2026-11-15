//! Original paper-concept review policy, without a data or transaction owner.
use research_workbench_native_sdk::{
    candidate_contracts::{
        CandidateValidationError as AiError, PaperConceptMapPayload, PaperConceptPayload,
    },
    candidate_review::{
        items::{
            AiSuggestionItemDecisionDraft, AiSuggestionResolutionDraft, SuggestionSemanticsV1,
            resolution_kind,
        },
        paper::*,
    },
    knowledge_promotion::{paper::*, *},
};
mod promotion;
pub fn decide(input: PaperReviewInputV1) -> PaperReviewDecisionV1 {
    use PaperReviewDecisionV1 as D;
    use PaperReviewInputV1 as I;
    let checked = |r: Result<(), AiError>| D::Checked { rejection: r.err() };
    match input {
        I::Draft { draft } => D::Draft {
            result: validate_draft(&draft).and_then(|()| super::items::request_hash(&draft)),
        },
        I::Replay {
            draft,
            request_hash,
            existing: (id, hash),
        } => checked(if id == draft.candidate_id && hash == request_hash {
            Ok(())
        } else {
            Err(AiError::InvalidInput(
                "概念审查幂等键已被不同参数使用".into(),
            ))
        }),
        I::Candidate {
            revision,
            current_revision,
            review_state,
        } => checked(if revision != current_revision {
            Err(AiError::InvalidInput("候选版本已变化".into()))
        } else if matches!(
            review_state.as_str(),
            "accepted_unchanged" | "accepted_after_edit" | "rejected"
        ) {
            Err(AiError::InvalidInput("该概念候选审查已经结束".into()))
        } else {
            Ok(())
        }),
        I::Select {
            payload,
            suggestion_id,
        } => D::Selected {
            result: select(payload, &suggestion_id).map(Box::new),
        },
        I::Action {
            draft,
            editor_kind,
            item,
        } => {
            let is_accept = matches!(
                draft.action.as_str(),
                "accept_unchanged" | "accept_after_edit"
            );
            D::Action {
                result: validate_action(&draft, &editor_kind, &item, is_accept).map(|()| {
                    SuggestionSemanticsV1 {
                        is_accept,
                        provenance: if draft.action == "accept_after_edit" {
                            "ai_accepted_after_edit"
                        } else {
                            "ai_accepted_unchanged"
                        }
                        .into(),
                        resolution_kind: resolution_kind(draft.resolution.as_ref()).into(),
                    }
                }),
            }
        }
        I::Inspection { inspected } => checked(if inspected {
            Ok(())
        } else {
            Err(AiError::InvalidInput(
                "原样接受前必须先打开该概念或关系的至少一条来源".into(),
            ))
        }),
        I::Paper { paper_ids } => {
            let papers = paper_ids
                .into_iter()
                .collect::<std::collections::BTreeSet<_>>();
            D::Paper {
                result: if papers.len() != 1 {
                    Err(AiError::InvalidInput("概念候选来源论文不唯一".into()))
                } else {
                    papers
                        .into_iter()
                        .next()
                        .ok_or_else(|| AiError::InvalidInput("概念候选缺少来源论文".into()))
                },
            }
        }
        I::Evidence { item } => D::Evidence {
            evidence_ids: paper_evidence_ids(&item),
        },
        I::Endpoints {
            concept_ids,
            relation,
            subject_id,
            object_id,
            accepted,
        } => {
            let expected = accepted
                .into_iter()
                .collect::<std::collections::HashMap<_, _>>();
            let matches = expected.get(&relation.subject_concept_candidate_id) == Some(&subject_id)
                && expected.get(&relation.object_concept_candidate_id) == Some(&object_id);
            let exists = concept_ids.contains(&relation.subject_concept_candidate_id)
                && concept_ids.contains(&relation.object_concept_candidate_id);
            checked(if exists && matches {
                Ok(())
            } else {
                Err(AiError::InvalidInput(
                    "关系两端必须先完成概念消歧并使用其已接受 Concept".into(),
                ))
            })
        }
        I::Promotion {
            item,
            resolution,
            paper_id,
            candidate_id,
            candidate_revision,
            sources,
        } => D::Promotion {
            result: promotion::prepare(
                item,
                resolution,
                &paper_id,
                &candidate_id,
                candidate_revision,
                &sources,
            )
            .map(Box::new),
        },
        I::State {
            total,
            terminal,
            accepted,
            editor_kind,
            action,
        } => {
            let research_workbench_native_sdk::candidate_review::items::ItemReviewDecisionV1::State{state}=super::items::decide(research_workbench_native_sdk::candidate_review::items::ItemReviewInputV1::State{total,terminal,accepted,editor_kind,action})else{unreachable!("state decision")};
            D::State { state }
        }
    }
}
fn select(value: serde_json::Value, id: &str) -> Result<PaperItemV1, AiError> {
    if value["kind"] != "paper_concept_map_v1" {
        return Err(AiError::InvalidInput("候选不是论文概念图".into()));
    }
    let map: PaperConceptMapPayload = serde_json::from_value(value)
        .map_err(|_| AiError::InvalidInput("候选不是论文概念图".into()))?;
    if let Some(concept) = map.concepts.into_iter().find(|c| c.id == id) {
        return Ok(PaperItemV1::Concept(Box::new(concept)));
    }
    map.relations
        .into_iter()
        .find(|r| r.id == id)
        .map(|r| PaperItemV1::Relation(Box::new(r)))
        .ok_or_else(|| AiError::InvalidInput("找不到待审查的概念或关系".into()))
}
fn validate_action(
    draft: &AiSuggestionItemDecisionDraft,
    editor_kind: &str,
    item: &PaperItemV1,
    is_accept: bool,
) -> Result<(), AiError> {
    if !matches!(
        draft.action.as_str(),
        "accept_unchanged" | "accept_after_edit" | "reject" | "defer" | "request_more_evidence"
    ) || is_accept != draft.resolution.is_some()
        || draft.action == "accept_after_edit" && editor_kind != "human"
        || draft.action == "accept_unchanged" && !matches!(editor_kind, "ai" | "ai_retry")
    {
        return Err(AiError::InvalidInput("论文概念条目审查动作无效".to_owned()));
    }
    let resolution_matches = matches!(
        (item, draft.resolution.as_ref()),
        (
            PaperItemV1::Concept(_),
            Some(
                AiSuggestionResolutionDraft::CreateConcept
                    | AiSuggestionResolutionDraft::LinkConcept { .. }
                    | AiSuggestionResolutionDraft::Unresolved
            )
        ) | (
            PaperItemV1::Relation(_),
            Some(AiSuggestionResolutionDraft::AssertRelation { .. })
        )
    );
    if is_accept && !resolution_matches {
        return Err(AiError::InvalidInput("论文概念条目消歧方式无效".to_owned()));
    }
    Ok(())
}

fn validate_draft(draft: &AiSuggestionItemDecisionDraft) -> Result<(), AiError> {
    if draft.candidate_revision < 1
        || draft.suggestion_id.is_empty()
        || draft.suggestion_id.len() > 80
        || draft.rationale.chars().count() > 2_000
        || draft.idempotency_key.is_empty()
        || draft.idempotency_key.len() > 200
    {
        Err(AiError::InvalidInput("概念条目审查参数无效".to_owned()))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests;
