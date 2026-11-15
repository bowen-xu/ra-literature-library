//! Original knowledge write-boundary decisions, without storage or an index owner.
use research_workbench_native_sdk::knowledge_promotion::{
    KnowledgeValidationDecisionV1 as Decision, KnowledgeValidationInputV1 as Input,
};
mod identity;
mod relation;
pub mod storage;
pub fn decide(input: &Input) -> Decision {
    let checked = |rejection: Option<&str>| Decision::Checked {
        rejection: rejection.map(str::to_owned),
    };
    match input {
        Input::FoundationScope {
            invalid_id,
            unique_papers,
        } => checked(crate::concept_algorithms::foundations::validate_scope(
            *invalid_id,
            *unique_papers,
        )),
        Input::FoundationComparison { input } => Decision::FoundationComparison {
            result: research_workbench_native_sdk::paper_context_wire::encode_payload(
                &crate::concept_algorithms::foundations::calculate(input),
            )
            .map_err(|error| error.to_string()),
        },
        Input::AlgorithmId {
            purpose,
            is_empty,
            bytes,
        } => checked(crate::concept_algorithms::validate_id(
            *purpose, *is_empty, *bytes,
        )),
        Input::EvolutionEvents {
            novelty_statuses, ..
        } => Decision::EvolutionEvents {
            result: crate::concept_algorithms::event_kinds(novelty_statuses),
        },
        Input::IdentityMergeRationale { characters } => {
            checked(identity::merge_rationale(*characters))
        }
        Input::IdentityMergeShape {
            source_count,
            survivor_is_empty,
            duplicate_sources,
            includes_survivor,
        } => checked(identity::merge_shape(
            *source_count,
            *survivor_is_empty,
            *duplicate_sources,
            *includes_survivor,
        )),
        Input::IdentitySplitShape {
            source_count,
            rationale_characters,
            duplicate_sources,
        } => checked(identity::split_shape(
            *source_count,
            *rationale_characters,
            *duplicate_sources,
        )),
        Input::IdentityTarget {
            mapped,
            has_children,
            ..
        } => checked(identity::target(*mapped, *has_children)),
        Input::IdentitySnapshot { .. } => checked(None),
        Input::IdentitySplitEvent {
            is_merge,
            selected_are_active,
            ..
        } => checked(identity::split_event(*is_merge, *selected_are_active)),
        Input::IdentityMappingDeleted { changed } => checked(identity::mapping_deleted(*changed)),
        Input::RelationDraft { facts } => relation::draft(facts),
        Input::RelationNode {
            node_kind,
            id_is_empty,
            id_bytes,
        } => relation::node(node_kind, *id_is_empty, *id_bytes),
        Input::RelationEndpoints { same, .. } => {
            checked(same.then_some("关系的起点和终点不能是同一对象"))
        }
        Input::RelationRevision {
            current_revision,
            expected_revision,
            ..
        } => relation::revision(*current_revision, *expected_revision),
        Input::RelationSearch { query_characters } => relation::search(*query_characters),
        Input::DefinitionRevision {
            expected_revision,
            current_revision,
        } => {
            use research_workbench_native_sdk::knowledge_promotion::manual::DefinitionRevisionRejectionV1 as Rejection;
            Decision::DefinitionRevision {
                rejection: match current_revision {
                    Some(current) if *expected_revision != Some(*current) => {
                        Some(Rejection::Conflict {
                            current_revision: *current,
                        })
                    }
                    None if expected_revision.is_some() => Some(Rejection::NewExpectedRevision),
                    _ => None,
                },
            }
        }
        Input::RevisionKind { object_kind } => checked(
            (!matches!(
                object_kind.as_str(),
                "claim"
                    | "reading_unit"
                    | "term"
                    | "concept"
                    | "term_usage"
                    | "definition_claim"
                    | "relation_assertion"
            ))
            .then_some("不支持的研究对象类型"),
        ),
        Input::Capture { draft, quote } => Decision::Capture {
            prepared: Box::new(capture_plan(draft, quote)),
        },
        Input::PaperConcept { draft } => Decision::PaperConcept {
            result: prepare_paper(draft).map(Box::new),
        },
        Input::Origin {
            provenance_kind,
            anchor_ids,
        } => checked(
            (!matches!(
                provenance_kind.as_str(),
                "ai_accepted_unchanged" | "ai_accepted_after_edit"
            ) || anchor_ids.is_empty()
                || anchor_ids.len() > 8)
                .then_some("AI 知识晋升来源或 provenance 无效"),
        ),
        Input::UniqueAnchor { duplicate } => checked(duplicate.then_some("AI 知识来源重复")),
        Input::Term { text, language } => Decision::Term {
            prepared: crate::concepts::prepare_term(text, language),
        },
        Input::Details { details } => Decision::Details {
            result: crate::concepts::validate_details(details)
                .map_err(|reason| reason.message().into())
                .and_then(|()| {
                    crate::nal_bootstrap::validate_name(&details.label)
                        .map(|name| (crate::concepts::normalize_details(details), name.to_owned()))
                        .map_err(|reason| crate::nal_bootstrap::rejection_message(&reason).into())
                }),
        },
        Input::NameCollision { collision } => {
            checked(collision.then_some("概念名称已存在，请使用不同名称，或用 ` 添加语境"))
        }
        Input::ManualDefinition {
            statement_is_empty, ..
        } => checked(definition_rejection(*statement_is_empty)),
        Input::Definition {
            statement,
            scope_note,
        } => Decision::Definition {
            result: match definition_rejection(statement.trim().is_empty()) {
                Some(message) => Err(message.into()),
                None => Ok((statement.trim().into(), scope_note.trim().into())),
            },
        },
        Input::Predicate { predicate_kind } => checked(
            (!research_workbench_native_sdk::candidate_contracts::RELATION_PREDICATE_KINDS
                .contains(&predicate_kind.as_str()))
            .then_some("关系类型无效"),
        ),
        Input::DifferentConcepts { same } => {
            checked(same.then_some("关系的起点和终点不能是同一概念"))
        }
        Input::Node { id } => {
            checked((id.trim().is_empty() || id.len() > 200).then_some("关系端点无效"))
        }
    }
}

fn definition_rejection(empty: bool) -> Option<&'static str> {
    empty.then_some("定义陈述不能为空")
}

fn prepare_paper(
    draft: &research_workbench_native_sdk::knowledge_promotion::paper::AiPaperConceptPromotion,
) -> Result<
    research_workbench_native_sdk::knowledge_promotion::paper::PaperConceptPreparationV1,
    String,
> {
    use research_workbench_native_sdk::knowledge_promotion::{paper::*, *};
    if draft.paper_id.trim().is_empty()
        || draft.source_candidate_id.trim().is_empty()
        || draft.source_candidate_revision < 1
        || draft.source_local_concept_id.trim().is_empty()
        || draft.surface_forms.is_empty()
        || draft.anchor_ids.is_empty()
    {
        return Err("论文概念晋升参数不完整".into());
    }
    Ok(PaperConceptPreparationV1 {
        base: AiConceptPromotion {
            term: draft.preferred_term.clone(),
            language: draft.preferred_language.clone(),
            explanation: draft.explanation.clone(),
            disambiguation: (!draft.disambiguation.trim().is_empty())
                .then(|| draft.disambiguation.trim().into()),
            domain: None,
            tradition: None,
            period: None,
            resolution: draft.resolution.clone(),
            anchor_ids: draft.anchor_ids.clone(),
        },
        surface_forms: draft
            .surface_forms
            .iter()
            .filter(|f| !(f.text == draft.preferred_term && f.language == draft.preferred_language))
            .cloned()
            .collect(),
        definition_claims: draft.definition_claims.clone(),
    })
}

fn capture_plan(
    draft: &research_workbench_native_sdk::knowledge_promotion::capture::ConceptCaptureDraft,
    quote: &str,
) -> research_workbench_native_sdk::knowledge_promotion::capture::ConceptCapturePlanV1 {
    use research_workbench_native_sdk::knowledge_promotion::capture::*;
    let mut resolution = draft.resolution.clone();
    match &mut resolution {
        ConceptResolutionDraft::CreateNew {
            definition_statement,
            ..
        }
        | ConceptResolutionDraft::LinkExisting {
            definition_statement,
            ..
        } => {
            *definition_statement = definition_statement
                .take()
                .filter(|value| !value.trim().is_empty());
        }
        ConceptResolutionDraft::Unresolved => {}
    }
    ConceptCapturePlanV1 {
        usage_text: if draft.usage_text.trim().is_empty() {
            quote.into()
        } else {
            draft.usage_text.trim().into()
        },
        resolution,
    }
}

#[cfg(test)]
mod manual_definition_tests {
    use super::*;
    use research_workbench_native_sdk::knowledge_promotion::manual::DefinitionRevisionRejectionV1 as Rejection;
    #[test]
    fn manual_definition_keeps_revision_order_and_original_normalization() {
        for (expected_revision, current_revision, rejection) in [
            (None, None, None),
            (Some(1), None, Some(Rejection::NewExpectedRevision)),
            (Some(2), Some(2), None),
            (
                None,
                Some(2),
                Some(Rejection::Conflict {
                    current_revision: 2,
                }),
            ),
            (
                Some(1),
                Some(2),
                Some(Rejection::Conflict {
                    current_revision: 2,
                }),
            ),
        ] {
            let input = Input::DefinitionRevision {
                expected_revision,
                current_revision,
            };
            let decision = decide(&input);
            assert_eq!(decision, Decision::DefinitionRevision { rejection });
            assert!(input.matches_decision(&decision));
        }
        for statement_is_empty in [false, true] {
            let input = Input::ManualDefinition {
                concept_identity_sha256: [0; 32],
                statement_is_empty,
            };
            assert_eq!(
                decide(&input),
                Decision::Checked {
                    rejection: definition_rejection(statement_is_empty).map(str::to_owned)
                }
            );
            assert!(input.matches_decision(&decide(&input)));
        }
        let input = Input::Definition {
            statement: " Definition Ω ".into(),
            scope_note: " Scope ".into(),
        };
        assert_eq!(
            decide(&input),
            Decision::Definition {
                result: Ok(("Definition Ω".into(), "Scope".into()))
            }
        );
    }

    #[test]
    fn original_revision_kinds_remain_finite() {
        for kind in [
            "claim",
            "reading_unit",
            "term",
            "concept",
            "term_usage",
            "definition_claim",
            "relation_assertion",
        ] {
            let input = Input::RevisionKind {
                object_kind: kind.into(),
            };
            assert_eq!(decide(&input), Decision::Checked { rejection: None });
            assert!(input.matches_decision(&decide(&input)));
        }
        assert_eq!(
            decide(&Input::RevisionKind {
                object_kind: "arbitrary".into()
            }),
            Decision::Checked {
                rejection: Some("不支持的研究对象类型".into())
            }
        );
    }
}
