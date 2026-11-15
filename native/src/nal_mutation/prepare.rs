use super::*;
use research_workbench_native_sdk::{nal_bootstrap::StateProjectionV1, nal_mutation::*};

pub fn prepare(
    input: &NalMutationPrepareInput,
) -> Result<NalMutationPreparation, serde_json::Error> {
    let mutation: NalMutation = serde_json::from_str(&input.mutation_json)?;
    let bootstrap = crate::nal_bootstrap::prepare_bootstrap(&input.bootstrap);
    let (decision, rule_projection) = if bootstrap.terminal.is_some() {
        (NalMutationDecision::DeferredAfterBootstrap {}, vec![])
    } else if let StateProjectionV1::Prepared { raw_state, .. } = &bootstrap.final_projection {
        let mut ids = raw_state.relation_concept_ids.clone();
        if let NalMutation::SetTransitivity {
            relation_concept_id,
            ..
        } = &mutation
            && !ids.contains(relation_concept_id)
        {
            ids.push(relation_concept_id.clone());
        }
        let rules = crate::nal_bootstrap::project_rules(&ids);
        let plan = match mutation {
            NalMutation::DeleteConcept { id } => NalMutationPlan::DeleteConcept {
                id,
                missing_rejection: R::MissingConcept,
            },
            NalMutation::SetConceptKind {
                concept_id,
                concept_kind,
            } => {
                let term = term(
                    &NalTerm::Concept {
                        id: concept_id.clone(),
                    },
                    0,
                    &mut 1,
                )
                .0;
                NalMutationPlan::SetConceptKind {
                    concept_id,
                    term,
                    after_term: prepare_concept_kind(&concept_kind),
                }
            }
            NalMutation::SetTransitivity {
                relation_concept_id,
                enabled,
            } => {
                let term = term(
                    &NalTerm::Concept {
                        id: relation_concept_id.clone(),
                    },
                    0,
                    &mut 1,
                )
                .0;
                NalMutationPlan::SetTransitivity {
                    relation_concept_id,
                    term,
                    action: prepare_transitivity(enabled),
                }
            }
            NalMutation::AddStatements { statements } => NalMutationPlan::AddStatements {
                batch: statements_plan(&statements)?,
            },
            NalMutation::DeleteStatement { id } => NalMutationPlan::DeleteStatement {
                id,
                missing_rejection: R::MissingStatement,
            },
            NalMutation::LinkAnnotation { annotation } => {
                let link = crate::nal_annotation_prepare::prepare_link(
                    &annotation,
                    &raw_state.annotations,
                );
                NalMutationPlan::LinkAnnotation { annotation, link }
            }
            NalMutation::UnlinkAnnotation { id } => NalMutationPlan::UnlinkAnnotation { id },
        };
        (
            NalMutationDecision::Prepared {
                mutation: Box::new(plan),
            },
            rules,
        )
    } else {
        (NalMutationDecision::DeferredAfterBootstrap {}, vec![])
    };
    Ok(NalMutationPreparation {
        bootstrap,
        decision,
        rule_projection,
    })
}

fn term(value: &NalTerm, depth: usize, remaining: &mut usize) -> (NalTermPreparation, bool) {
    if let Err(error) = validate_term_node(value, depth, remaining) {
        return (
            NalTermPreparation::Rejected {
                reason: error.reason,
            },
            true,
        );
    }
    match value {
        NalTerm::Product { terms } => {
            let mut prefix = Vec::new();
            for value in terms {
                let (value, stopped) = term(value, depth + 1, remaining);
                prefix.push(value);
                if stopped {
                    return (NalTermPreparation::Product { terms: prefix }, true);
                }
            }
            (NalTermPreparation::Product { terms: prefix }, false)
        }
        NalTerm::Concept { id } => (
            NalTermPreparation::Concept {
                id: id.clone(),
                missing_rejection: R::MissingTerm,
            },
            false,
        ),
        NalTerm::Paper { id } => (
            NalTermPreparation::Paper {
                id: id.clone(),
                missing_rejection: R::MissingTerm,
            },
            false,
        ),
    }
}

fn statements_plan(
    statements: &[NalStatement],
) -> Result<NalStatementBatchPreparation, serde_json::Error> {
    if let Err(error) = validate_statement_count(statements.len()) {
        return Ok(NalStatementBatchPreparation::Rejected {
            reason: error.reason,
        });
    }
    let mut remaining = 16000;
    let mut prefix = Vec::new();
    for statement in statements {
        let id = statement.id.clone();
        let origin = statement.origin.clone();
        if let Err(error) = validate_statement_identity(statement) {
            prefix.push(NalStatementPreparation::RejectedIdentity {
                id,
                origin,
                reason: error.reason,
            });
            break;
        }
        let (subject, stopped) = term(&statement.subject, 0, &mut remaining);
        if stopped {
            prefix.push(NalStatementPreparation::SubjectRejected {
                id,
                origin,
                subject,
            });
            break;
        }
        let (predicate, stopped) = term(&statement.predicate, 0, &mut remaining);
        if stopped {
            prefix.push(NalStatementPreparation::PredicateRejected {
                id,
                origin,
                subject,
                predicate,
            });
            break;
        }
        prefix.push(NalStatementPreparation::Ready {
            id,
            origin,
            subject,
            predicate,
            subject_json: serde_json::to_string(&statement.subject)?,
            predicate_json: serde_json::to_string(&statement.predicate)?,
        });
    }
    Ok(NalStatementBatchPreparation::Prepared { statements: prefix })
}
