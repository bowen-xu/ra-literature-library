//! Original four-kind item review policy. Core owns facts, history and writes.
use research_workbench_native_sdk::{
    candidate_contracts::CandidateValidationError as AiError, candidate_review::items::*,
};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
type Suggestion = SuggestionV1;
pub fn decide(input: ItemReviewInputV1) -> ItemReviewDecisionV1 {
    use ItemReviewDecisionV1 as Decision;
    use ItemReviewInputV1 as Input;
    let checked = |result: Result<(), AiError>| Decision::Checked {
        rejection: result.err(),
    };
    match input {
        Input::Promotion {
            suggestion,
            resolution,
            anchor_ids,
        } => Decision::Promotion {
            result: promote(*suggestion, resolution, anchor_ids).map(Box::new),
        },
        Input::Knowledge { input, .. } => Decision::Knowledge {
            decision: crate::knowledge_promotion::decide(&input),
        },
        Input::Draft { draft } => Decision::Draft {
            result: validate_draft(&draft).and_then(|()| request_hash(&draft)),
        },
        Input::Replay {
            draft,
            request_hash,
            existing: (id, hash),
        } => checked(if id == draft.candidate_id && hash == request_hash {
            Ok(())
        } else {
            Err(AiError::InvalidInput(
                "建议审查幂等键已被不同参数使用".into(),
            ))
        }),
        Input::Candidate {
            revision,
            current_revision,
            review_state,
        } => checked(if current_revision != revision {
            Err(AiError::InvalidInput(
                "候选版本已变化，请重新审查当前建议".into(),
            ))
        } else if matches!(
            review_state.as_str(),
            "accepted_unchanged" | "accepted_after_edit" | "rejected"
        ) {
            Err(AiError::InvalidInput("该候选审查已经结束".into()))
        } else {
            Ok(())
        }),
        Input::Terminal {
            has_terminal_decision,
        } => checked(if has_terminal_decision {
            Err(AiError::InvalidInput("该建议条目已经完成审查".into()))
        } else {
            Ok(())
        }),
        Input::Select {
            payload,
            suggestion_id,
        } => Decision::Selected {
            result: select(payload, &suggestion_id).map(Box::new),
        },
        Input::Action {
            draft,
            editor_kind,
            suggestion,
        } => Decision::Action {
            result: {
                let is_accept = matches!(
                    draft.action.as_str(),
                    "accept_unchanged" | "accept_after_edit"
                );
                validate_action(&draft, &editor_kind, &suggestion, is_accept).map(|()| {
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
                })
            },
        },
        Input::Inspection { inspected } => checked(if inspected {
            Ok(())
        } else {
            Err(AiError::InvalidInput(
                "原样接受前必须先打开该建议的至少一条来源".into(),
            ))
        }),
        Input::Anchors {
            evidence_ids,
            sources,
        } => Decision::Anchors {
            result: {
                let mut seen = HashSet::new();
                let anchors: Vec<_> = evidence_ids
                    .iter()
                    .filter_map(|key| {
                        sources
                            .iter()
                            .find(|(candidate, _)| key == candidate)
                            .map(|(_, anchor)| anchor.clone())
                    })
                    .filter(|anchor| seen.insert(anchor.clone()))
                    .collect();
                if anchors.is_empty() {
                    Err(AiError::InvalidInput("建议条目缺少可晋升来源".into()))
                } else {
                    Ok(anchors)
                }
            },
        },
        Input::State {
            total,
            terminal,
            accepted,
            editor_kind,
            action,
        } => Decision::State {
            state: if terminal == total as i64 {
                if accepted == 0 {
                    "rejected"
                } else if editor_kind == "human" {
                    "accepted_after_edit"
                } else {
                    "accepted_unchanged"
                }
            } else {
                match action.as_str() {
                    "defer" => "deferred",
                    "request_more_evidence" => "needs_more_evidence",
                    _ if editor_kind == "human" => "edited",
                    _ => "unreviewed",
                }
            }
            .into(),
        },
    }
}
fn select(payload: serde_json::Value, id: &str) -> Result<Suggestion, AiError> {
    let kind = payload["kind"].as_str();
    let suggestion = payload["suggestions"]
        .as_array()
        .and_then(|values| values.iter().find(|v| v["id"] == id));
    let decode_error = || AiError::InvalidInput("找不到待审查的建议条目".into());
    let Some(value) = suggestion else {
        return Err(decode_error());
    };
    match kind {
        Some("concept_suggestion_v1") => serde_json::from_value(value.clone())
            .map(Suggestion::Concept)
            .map_err(|_| decode_error()),
        Some("definition_suggestion_v1") => serde_json::from_value(value.clone())
            .map(Suggestion::Definition)
            .map_err(|_| decode_error()),
        Some("relation_suggestion_v1") => serde_json::from_value(value.clone())
            .map(Suggestion::Relation)
            .map_err(|_| decode_error()),
        Some("attention_suggestion_v1") => serde_json::from_value(value.clone())
            .map(Suggestion::Attention)
            .map_err(|_| decode_error()),
        _ => Err(decode_error()),
    }
}
fn validate_action(
    draft: &AiSuggestionItemDecisionDraft,
    editor_kind: &str,
    suggestion: &Suggestion,
    is_accept: bool,
) -> Result<(), AiError> {
    if !matches!(
        draft.action.as_str(),
        "accept_unchanged" | "accept_after_edit" | "reject" | "defer" | "request_more_evidence"
    ) || is_accept != draft.resolution.is_some()
        || draft.action == "accept_after_edit" && editor_kind != "human"
        || draft.action == "accept_unchanged" && !matches!(editor_kind, "ai" | "ai_retry")
        || is_accept && matches!(suggestion, Suggestion::Attention(_))
    {
        return Err(AiError::InvalidInput("建议条目审查动作无效".to_owned()));
    }
    let resolution_matches = matches!(
        (suggestion, draft.resolution.as_ref()),
        (
            Suggestion::Concept(_),
            Some(
                AiSuggestionResolutionDraft::CreateConcept
                    | AiSuggestionResolutionDraft::LinkConcept { .. }
                    | AiSuggestionResolutionDraft::Unresolved
            )
        ) | (
            Suggestion::Definition(_),
            Some(AiSuggestionResolutionDraft::AttachDefinition { .. })
        ) | (
            Suggestion::Relation(_),
            Some(AiSuggestionResolutionDraft::AssertRelation { .. })
        )
    );
    if is_accept && !resolution_matches {
        return Err(AiError::InvalidInput("建议条目目标消歧方式无效".to_owned()));
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
        return Err(AiError::InvalidInput("建议条目审查参数无效".to_owned()));
    }
    Ok(())
}

pub fn request_hash(draft: &AiSuggestionItemDecisionDraft) -> Result<String, AiError> {
    let bytes = serde_json::to_vec(draft)
        .map_err(|_| AiError::InvalidInput("无法规范化建议审查参数".to_owned()))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn promote(
    suggestion: Suggestion,
    resolution: Option<AiSuggestionResolutionDraft>,
    anchor_ids: Vec<String>,
) -> Result<research_workbench_native_sdk::knowledge_promotion::KnowledgePromotionV1, AiError> {
    use research_workbench_native_sdk::knowledge_promotion::*;
    match (suggestion, resolution) {
        (Suggestion::Concept(value), Some(resolution)) => {
            Ok(KnowledgePromotionV1::Concept(AiConceptPromotion {
                term: value.term,
                language: value.language,
                explanation: value.explanation,
                disambiguation: value.disambiguation,
                domain: value.domain,
                tradition: value.tradition,
                period: value.period,
                resolution: match resolution {
                    AiSuggestionResolutionDraft::CreateConcept => AiConceptResolution::CreateNew,
                    AiSuggestionResolutionDraft::LinkConcept { concept_id } => {
                        AiConceptResolution::LinkExisting(concept_id)
                    }
                    AiSuggestionResolutionDraft::Unresolved => AiConceptResolution::Unresolved,
                    _ => return Err(AiError::InvalidInput("概念消歧方式无效".into())),
                },
                anchor_ids,
            }))
        }
        (
            Suggestion::Definition(value),
            Some(AiSuggestionResolutionDraft::AttachDefinition { concept_id }),
        ) => Ok(KnowledgePromotionV1::Definition(AiDefinitionPromotion {
            concept_id,
            statement: value.statement,
            scope_note: value.scope_note,
            anchor_ids,
        })),
        (
            Suggestion::Relation(value),
            Some(AiSuggestionResolutionDraft::AssertRelation {
                subject_concept_id,
                object_concept_id,
                project_id,
            }),
        ) => Ok(KnowledgePromotionV1::Relation(AiRelationPromotion {
            project_id,
            subject_concept_id,
            predicate_kind: value.predicate_kind,
            object_concept_id,
            scope_note: value.scope_note,
            anchor_ids,
        })),
        _ => Err(AiError::InvalidInput("建议晋升目标无效".into())),
    }
}

#[cfg(test)]
mod tests;
