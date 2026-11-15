use super::*;
use research_workbench_native_sdk::nal_state::{
    NalConcept, NalRule, NalState, NalStatement, NalTerm,
};
use std::collections::HashSet;

pub fn project_rules(ids: &[String]) -> Vec<NalRule> {
    ids.iter()
        .map(|id| NalRule {
            id: format!("transitive:{id}"),
            kind: "transitive".into(),
            relation_concept_id: id.clone(),
        })
        .collect()
}

fn decode(raw: &RawNalStateV1) -> Result<NalState, serde_json::Error> {
    let statements = raw
        .statements
        .iter()
        .map(|row| {
            Ok(NalStatement {
                id: row.id.clone(),
                subject: serde_json::from_str(&row.subject_json)?,
                predicate: serde_json::from_str(&row.predicate_json)?,
                origin: row.origin.clone(),
            })
        })
        .collect::<Result<Vec<_>, serde_json::Error>>()?;
    Ok(NalState {
        revision: raw.revision,
        concepts: raw.concepts.clone(),
        statements,
        annotations: raw.annotations.clone(),
        rules: project_rules(&raw.relation_concept_ids),
    })
}

fn references(term: &NalTerm, concept: &str) -> bool {
    match term {
        NalTerm::Concept { id } => id == concept,
        NalTerm::Product { terms } => terms.iter().any(|term| references(term, concept)),
        NalTerm::Paper { .. } => false,
    }
}

pub(super) fn obsolete(concept: &NalConcept) -> bool {
    concept.label == "related-field"
        && [
            "旧集合关系。反向显示：related-field；有向：false。",
            "从旧集合关系迁移。反向显示：related-field；有向：false。",
        ]
        .contains(&concept.explanation.as_str())
}

pub(super) fn finish(
    source: &BootstrapSourceV1,
    concepts: &[PreparedConceptV1],
    statements: &[PreparedNalStatementV1],
    rewrites: &[RawNalStatementV1],
    imported: bool,
    repaired: bool,
) -> (
    CleanupPreparationV1,
    StateProjectionV1,
    Option<BootstrapStopV1>,
) {
    if let Err(terminal) = require(&source.cleanup_exists, BootstrapPhaseV1::CleanupExistence) {
        return (
            CleanupPreparationV1::Deferred {},
            StateProjectionV1::Deferred {},
            Some(terminal),
        );
    }
    let mut raw = match require(&source.raw_state, BootstrapPhaseV1::FinalLoad) {
        Ok(raw) => raw.clone(),
        Err(terminal) => {
            return (
                CleanupPreparationV1::Deferred {},
                StateProjectionV1::Deferred {},
                Some(terminal),
            );
        }
    };
    let fresh_ids = concepts
        .iter()
        .map(|concept| concept.concept_id.as_str())
        .collect::<HashSet<_>>();
    for concept in concepts {
        let SourceProbe::Available { value: details } = &concept.details else {
            return (
                CleanupPreparationV1::Deferred {},
                StateProjectionV1::Deferred {},
                Some(stop(
                    BootstrapPhaseV1::ConceptReadback,
                    BootstrapStopReasonV1::InvalidBinding {},
                )),
            );
        };
        raw.concepts.push(NalConcept {
            id: concept.concept_id.clone(),
            label: details.label.clone(),
            explanation: details.explanation.clone(),
            revision: 1,
            concept_kind: "ordinary".into(),
        });
    }
    let Some(revision) = raw
        .revision
        .checked_add(concepts.len() as i64)
        .and_then(|value| value.checked_add(i64::from(imported)))
        .and_then(|value| value.checked_add(i64::from(repaired)))
    else {
        return (
            if raw.concepts.iter().any(obsolete) {
                CleanupPreparationV1::DecodeAtOriginalPoint {}
            } else {
                CleanupPreparationV1::Skipped {}
            },
            StateProjectionV1::DecodeAtOriginalPoint {},
            None,
        );
    };
    raw.revision = revision;
    let rules = project_rules(&raw.relation_concept_ids);
    // These startup predicates are all freshly allocated concepts. Legacy
    // coalesced ordinary rows are never guessed to be missing kind rows.
    for row in statements {
        if let Some(id) = &row.relation_concept_id
            && fresh_ids.contains(id.as_str())
            && let Some(concept) = raw.concepts.iter_mut().find(|concept| &concept.id == id)
        {
            concept.concept_kind = "relation".into();
        }
        let row = &row.statement;
        if !raw.statements.iter().any(|old| {
            old.subject_json == row.subject_json && old.predicate_json == row.predicate_json
        }) {
            raw.statements.push(row.clone());
        }
    }
    for row in rewrites {
        if let Some(existing) = raw.statements.iter_mut().find(|old| old.id == row.id) {
            *existing = row.clone();
        }
    }
    if repaired
        && let Some(relation) = concepts
            .iter()
            .find(|value| matches!(value.key, ConceptCallKeyV1::RepairPredicate {}))
        && let Some(concept) = raw
            .concepts
            .iter_mut()
            .find(|value| value.id == relation.concept_id)
    {
        concept.concept_kind = "relation".into();
    }
    raw.concepts
        .sort_by(|a, b| a.label.cmp(&b.label).then_with(|| a.id.cmp(&b.id)));
    let needs_cleanup = raw.concepts.iter().any(obsolete);
    let decoded = match decode(&raw) {
        Ok(state) => state,
        Err(_) => {
            return (
                if needs_cleanup {
                    CleanupPreparationV1::DecodeAtOriginalPoint {}
                } else {
                    CleanupPreparationV1::Skipped {}
                },
                StateProjectionV1::DecodeAtOriginalPoint {},
                Some(stop(
                    if needs_cleanup {
                        BootstrapPhaseV1::CleanupLoad
                    } else {
                        BootstrapPhaseV1::FinalLoad
                    },
                    BootstrapStopReasonV1::Rejected {
                        reason: BootstrapRejectionV1::InvalidStructure,
                    },
                )),
            );
        }
    };
    let mut deletes = vec![];
    if needs_cleanup {
        for concept in &decoded.concepts {
            if !obsolete(concept)
                || decoded.statements.iter().any(|statement| {
                    references(&statement.subject, &concept.id)
                        || references(&statement.predicate, &concept.id)
                })
                || decoded.annotations.iter().any(|annotation| {
                    annotation.target_kind == "concept" && annotation.target_id == concept.id
                })
                || decoded
                    .rules
                    .iter()
                    .any(|rule| rule.relation_concept_id == concept.id)
            {
                continue;
            }
            deletes.push(concept.id.clone());
        }
    }
    let cleanup = if needs_cleanup {
        CleanupPreparationV1::Prepared {
            delete_ids: deletes.clone(),
            expected_post_repair: raw.clone(),
        }
    } else {
        CleanupPreparationV1::Skipped {}
    };
    raw.concepts
        .retain(|concept| !deletes.contains(&concept.id));
    let Some(revision) = raw.revision.checked_add(deletes.len() as i64) else {
        return (cleanup, StateProjectionV1::DecodeAtOriginalPoint {}, None);
    };
    raw.revision = revision;
    (
        cleanup,
        StateProjectionV1::Prepared {
            raw_state: raw,
            rules,
        },
        None,
    )
}
