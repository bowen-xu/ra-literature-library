//! Original manual relation rules over finite observations. The Core owns every read and write.
use research_workbench_native_sdk::{
    candidate_contracts::RELATION_PREDICATE_KINDS,
    knowledge_promotion::{KnowledgeValidationDecisionV1 as Decision, relation::*},
};
pub(super) fn draft(facts: &RelationDraftFactsV1) -> Decision {
    let rejection = if !RELATION_PREDICATE_KINDS.contains(&facts.predicate_kind.as_str())
        || facts.scope_characters > 4_000
        || facts.reason_characters.is_some_and(|count| count > 500)
        || facts
            .rationale_characters
            .is_some_and(|count| count > 2_000)
    {
        Some("关系断言参数无效")
    } else {
        let complete = match (facts.anchor_present, facts.evidence_stance.as_deref()) {
            (false, None) => facts.rationale_is_empty,
            (true, Some(stance)) => matches!(stance, "supports" | "opposes" | "context"),
            _ => false,
        };
        (!complete).then_some("关系证据必须同时提供锚点和立场")
    };
    Decision::Checked {
        rejection: rejection.map(str::to_owned),
    }
}
pub(super) fn node(kind: &str, id_is_empty: bool, id_bytes: usize) -> Decision {
    let kind = match kind {
        "concept" => Some(RelationNodeKindV1::Concept),
        "definition_claim" => Some(RelationNodeKindV1::DefinitionClaim),
        "reading_unit" => Some(RelationNodeKindV1::ReadingUnit),
        "paper" => Some(RelationNodeKindV1::Paper),
        "note_page" => Some(RelationNodeKindV1::NotePage),
        _ => None,
    };
    Decision::RelationNode {
        result: kind
            .filter(|_| !id_is_empty && id_bytes <= 200)
            .ok_or_else(|| "关系端点无效".into()),
    }
}
pub(super) fn revision(current: Option<i64>, expected: Option<i64>) -> Decision {
    let rejection = match (current, expected) {
        (None, Some(_)) => Some(RelationRevisionRejectionV1::NewExpectedRevision),
        (Some(_), None) => Some(RelationRevisionRejectionV1::MissingExpectedRevision),
        (Some(current), Some(expected)) if current != expected => {
            Some(RelationRevisionRejectionV1::Conflict {
                current_revision: current,
            })
        }
        _ => None,
    };
    Decision::RelationRevision { rejection }
}
pub(super) fn search(characters: usize) -> Decision {
    Decision::RelationSearch {
        result: if characters > 500 {
            Err("关系端点检索词过长".into())
        } else {
            Ok(RelationSearchPlanV1 {
                kinds: [
                    RelationNodeKindV1::Concept,
                    RelationNodeKindV1::DefinitionClaim,
                    RelationNodeKindV1::ReadingUnit,
                    RelationNodeKindV1::Paper,
                    RelationNodeKindV1::NotePage,
                ],
                final_limit: 60,
            })
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use research_workbench_native_sdk::knowledge_promotion::KnowledgeValidationInputV1 as Input;
    fn facts() -> RelationDraftFactsV1 {
        RelationDraftFactsV1 {
            predicate_kind: "related_to".into(),
            scope_characters: 0,
            reason_characters: None,
            rationale_characters: None,
            anchor_present: false,
            evidence_stance: None,
            rationale_is_empty: true,
        }
    }
    #[test]
    fn original_relation_fields_and_evidence_keep_their_first_rejection() {
        assert_eq!(draft(&facts()), Decision::Checked { rejection: None });
        let mut invalid = facts();
        invalid.scope_characters = 4_001;
        invalid.anchor_present = true;
        assert_eq!(
            draft(&invalid),
            Decision::Checked {
                rejection: Some("关系断言参数无效".into())
            }
        );
        invalid.scope_characters = 4_000;
        assert_eq!(
            draft(&invalid),
            Decision::Checked {
                rejection: Some("关系证据必须同时提供锚点和立场".into())
            }
        );
        for stance in ["supports", "opposes", "context"] {
            invalid.evidence_stance = Some(stance.into());
            assert_eq!(draft(&invalid), Decision::Checked { rejection: None });
        }
        invalid.anchor_present = false;
        invalid.evidence_stance = None;
        invalid.rationale_is_empty = false;
        assert_eq!(
            draft(&invalid),
            Decision::Checked {
                rejection: Some("关系证据必须同时提供锚点和立场".into())
            }
        );
    }
    #[test]
    fn original_five_node_kinds_keep_byte_limits_and_named_binding() {
        for kind in [
            "concept",
            "definition_claim",
            "reading_unit",
            "paper",
            "note_page",
        ] {
            let input = Input::RelationNode {
                node_kind: kind.into(),
                id_is_empty: false,
                id_bytes: 200,
            };
            let prepared = node(kind, false, 200);
            assert!(input.matches_decision(&prepared));
            assert!(matches!(
                node(kind, false, 201),
                Decision::RelationNode { result: Err(_) }
            ));
            assert!(matches!(
                node(kind, true, 1),
                Decision::RelationNode { result: Err(_) }
            ));
        }
        assert!(matches!(
            node("unknown", false, 1),
            Decision::RelationNode { result: Err(_) }
        ));
        assert!(
            !Input::RelationNode {
                node_kind: "concept".into(),
                id_is_empty: false,
                id_bytes: 1
            }
            .matches_decision(&node("paper", false, 1))
        );
    }
    #[test]
    fn original_relation_revision_and_search_rules_stay_finite() {
        assert_eq!(
            revision(None, Some(1)),
            Decision::RelationRevision {
                rejection: Some(RelationRevisionRejectionV1::NewExpectedRevision)
            }
        );
        assert_eq!(
            revision(Some(2), None),
            Decision::RelationRevision {
                rejection: Some(RelationRevisionRejectionV1::MissingExpectedRevision)
            }
        );
        assert_eq!(
            revision(Some(2), Some(1)),
            Decision::RelationRevision {
                rejection: Some(RelationRevisionRejectionV1::Conflict {
                    current_revision: 2
                })
            }
        );
        assert_eq!(
            revision(Some(2), Some(2)),
            Decision::RelationRevision { rejection: None }
        );
        assert!(matches!(
            search(501),
            Decision::RelationSearch { result: Err(_) }
        ));
        let Decision::RelationSearch { result: Ok(plan) } = search(500) else {
            panic!("valid query rejected")
        };
        assert_eq!(plan.final_limit, 60);
        assert_eq!(
            plan.kinds.map(RelationNodeKindV1::as_str),
            [
                "concept",
                "definition_claim",
                "reading_unit",
                "paper",
                "note_page"
            ]
        );
        assert!(
            !Input::RelationRevision {
                current_revision: Some(2),
                expected_revision: Some(1),
                current_sha256: None
            }
            .matches_decision(&revision(Some(3), Some(1)))
        );
    }
}
