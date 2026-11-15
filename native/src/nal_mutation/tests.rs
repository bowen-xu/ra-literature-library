use super::*;
use research_workbench_native_sdk::{nal_bootstrap::*, nal_mutation::*};

fn available<T>(value: T) -> SourceProbe<T> {
    SourceProbe::Available { value }
}
fn input(mutation: NalMutation) -> NalMutationPrepareInput {
    let source = BootstrapSourceV1 {
        legacy_imported: available(true),
        collections: SourceProbe::Skipped {},
        relation_types: SourceProbe::Skipped {},
        related_field_used: SourceProbe::Skipped {},
        relations: SourceProbe::Skipped {},
        memberships: SourceProbe::Skipped {},
        assignments: SourceProbe::Skipped {},
        repair_version: available(1),
        repair_records: SourceProbe::Skipped {},
        cleanup_exists: available(false),
        raw_state: available(RawNalStateV1 {
            revision: 7,
            concepts: vec![],
            statements: vec![],
            annotations: vec![],
            relation_concept_ids: vec![],
        }),
        occupied_name_keys: available(vec![]),
        configured_embedding: available(None),
    };
    NalMutationPrepareInput {
        bootstrap: BootstrapInputV1 {
            probes: crate::nal_bootstrap::prepare_bootstrap_probes(&source),
            source,
            facts: BootstrapProbeFactsV1 {
                terms: vec![],
                generation: SourceProbe::Skipped {},
                next_generation: SourceProbe::Skipped {},
                concepts: vec![],
            },
            identities: BootstrapIdentitiesV1 {
                concepts: vec![],
                generation_id: None,
                statement_ids: vec![],
            },
        },
        mutation_json: serde_json::to_string(&mutation).unwrap(),
    }
}
fn concept(id: &str) -> NalTerm {
    NalTerm::Concept { id: id.into() }
}
fn statement(id: &str) -> NalStatement {
    NalStatement {
        id: id.into(),
        subject: concept(" raw c "),
        predicate: NalTerm::Paper {
            id: " raw p ".into(),
        },
        origin: "human".into(),
    }
}
fn plan(mutation: NalMutation) -> NalMutationPlan {
    let preparation = prepare(&input(mutation)).unwrap();
    let NalMutationDecision::Prepared { mutation } = preparation.decision else {
        panic!("unexpected startup rejection")
    };
    *mutation
}

#[test]
fn node_guards_count_before_arity_or_identity_and_keep_original_byte_depth_limits() {
    let mut budget = 1;
    assert_eq!(
        validate_term_node(&NalTerm::Product { terms: vec![] }, 0, &mut budget)
            .unwrap_err()
            .reason,
        R::ProductArity
    );
    assert_eq!(budget, 0);
    let mut budget = 3;
    assert_eq!(
        validate_term_node(&concept("id"), 13, &mut budget)
            .unwrap_err()
            .reason,
        R::TermStructureTooLarge
    );
    assert_eq!(budget, 3);
    validate_term_node(&concept("id"), 12, &mut budget).unwrap();
    assert_eq!(budget, 2);
    validate_term_node(&concept(&"é".repeat(100)), 0, &mut budget).unwrap();
    assert_eq!(
        validate_term_node(&concept(&"é".repeat(101)), 0, &mut budget)
            .unwrap_err()
            .reason,
        R::InvalidTermIdentity
    );
    assert_eq!(budget, 0);
    assert_eq!(
        validate_term_node(&concept(""), 0, &mut budget)
            .unwrap_err()
            .reason,
        R::TermStructureTooLarge
    );
    assert_eq!(
        require_term_exists(false).unwrap_err().to_string(),
        "概念或活跃文献已不存在，请刷新"
    );
}

#[test]
fn role_and_transitivity_conditions_require_reads_even_when_the_value_is_not_restrictive() {
    assert!(matches!(
        prepare_concept_kind("relation"),
        NalConceptKindPreparation::ReadUsage {
            on_used: NalUsageCondition::Continue {},
            ..
        }
    ));
    assert!(require_kind_usage("relation", true).is_ok());
    assert_eq!(
        require_kind_usage("ordinary", true).unwrap_err().reason,
        R::ConceptUsedAsRelation
    );
    assert_eq!(
        validate_concept_kind(" relation ").unwrap_err().reason,
        R::InvalidConceptKind
    );
    assert_eq!(
        prepare_transitivity(false),
        NalTransitivityAction::Disable {}
    );
    assert!(require_relation_kind(false, false).is_ok());
    assert_eq!(
        require_relation_kind(true, false).unwrap_err().reason,
        R::NotRelation
    );
    assert!(require_concept_deleted(1).is_ok());
    assert_eq!(
        require_concept_deleted(0).unwrap_err().reason,
        R::MissingConcept
    );
    assert_eq!(
        require_concept_deleted(2).unwrap_err().reason,
        R::MissingConcept
    );
    assert!(require_statement_deleted(2).is_ok());
    assert_eq!(
        require_statement_deleted(0).unwrap_err().reason,
        R::MissingStatement
    );
}

#[test]
fn count_and_identity_guards_preserve_human_origin_and_raw_id_constraints() {
    for count in [1, 500] {
        validate_statement_count(count).unwrap();
    }
    for count in [0, 501] {
        assert_eq!(
            validate_statement_count(count).unwrap_err().reason,
            R::InvalidStatementCount
        );
    }
    validate_statement_identity(&statement(" not-a-uuid ")).unwrap();
    validate_statement_identity(&statement(&"é".repeat(100))).unwrap();
    for mut value in [
        statement("\t"),
        statement(&"é".repeat(101)),
        statement("id"),
    ] {
        if value.id == "id" {
            value.origin = "legacy".into();
        }
        assert_eq!(
            validate_statement_identity(&value).unwrap_err().reason,
            R::InvalidStatementIdentityOrOrigin
        );
    }
}

#[test]
fn prepared_statements_keep_ready_insert_before_later_identity_or_term_rejection() {
    let mut second = statement("second");
    second.origin = "legacy".into();
    let NalMutationPlan::AddStatements {
        batch: NalStatementBatchPreparation::Prepared { statements },
    } = plan(NalMutation::AddStatements {
        statements: vec![statement(" first "), second, statement("unreachable")],
    })
    else {
        panic!("batch")
    };
    assert_eq!(statements.len(), 2);
    let NalStatementPreparation::Ready {
        id,
        origin,
        subject_json,
        predicate_json,
        ..
    } = &statements[0]
    else {
        panic!("first SQL must remain reachable")
    };
    assert_eq!((id.as_str(), origin.as_str()), (" first ", "human"));
    assert_eq!(subject_json, "{\"kind\":\"concept\",\"id\":\" raw c \"}");
    assert_eq!(predicate_json, "{\"kind\":\"paper\",\"id\":\" raw p \"}");
    assert!(matches!(
        statements[1],
        NalStatementPreparation::RejectedIdentity {
            reason: R::InvalidStatementIdentityOrOrigin,
            ..
        }
    ));
    let mut second = statement("second");
    second.subject = NalTerm::Product { terms: vec![] };
    second.predicate = concept("");
    let NalMutationPlan::AddStatements {
        batch: NalStatementBatchPreparation::Prepared { statements },
    } = plan(NalMutation::AddStatements {
        statements: vec![statement("first"), second],
    })
    else {
        panic!("batch")
    };
    assert!(matches!(
        statements[1],
        NalStatementPreparation::SubjectRejected {
            subject: NalTermPreparation::Rejected {
                reason: R::ProductArity
            },
            ..
        }
    ));
}

#[test]
fn one_shared_16000_node_budget_stops_inside_the_later_predicate_prefix() {
    let product = NalTerm::Product {
        terms: (0..16).map(|_| concept("c")).collect(),
    };
    let values = (0..500)
        .map(|index| NalStatement {
            id: format!("s{index}"),
            subject: product.clone(),
            predicate: product.clone(),
            origin: "human".into(),
        })
        .collect();
    let NalMutationPlan::AddStatements {
        batch: NalStatementBatchPreparation::Prepared { statements },
    } = plan(NalMutation::AddStatements { statements: values })
    else {
        panic!("batch")
    };
    assert_eq!(statements.len(), 471);
    let NalStatementPreparation::PredicateRejected {
        predicate: NalTermPreparation::Product { terms },
        ..
    } = statements.last().unwrap()
    else {
        panic!("global budget must stop in predicate")
    };
    assert_eq!(terms.len(), 3);
    assert!(matches!(
        terms[2],
        NalTermPreparation::Rejected {
            reason: R::TermStructureTooLarge
        }
    ));
}

#[test]
fn bootstrap_failure_defers_invalid_batch_and_link_identity_instead_of_early_rejection() {
    for mutation in [
        NalMutation::AddStatements { statements: vec![] },
        NalMutation::LinkAnnotation {
            annotation: research_workbench_native_sdk::nal_annotation::NalAnnotation {
                id: "".into(),
                target_kind: "invalid".into(),
                target_id: "missing".into(),
                note_page_id: "missing".into(),
            },
        },
    ] {
        let mut input = input(mutation);
        input.bootstrap.source.legacy_imported = SourceProbe::Deferred {};
        input.bootstrap.probes =
            crate::nal_bootstrap::prepare_bootstrap_probes(&input.bootstrap.source);
        let prepared = prepare(&input).unwrap();
        assert!(prepared.bootstrap.terminal.is_some());
        assert_eq!(
            prepared.decision,
            NalMutationDecision::DeferredAfterBootstrap {}
        );
        assert!(prepared.rule_projection.is_empty());
    }
}

#[test]
fn manual_link_does_not_precheck_target_activity_and_reuses_its_closed_policy() {
    let annotation = research_workbench_native_sdk::nal_annotation::NalAnnotation {
        id: " raw a ".into(),
        target_kind: "concept".into(),
        target_id: "absent-or-soft-deleted".into(),
        note_page_id: " raw note ".into(),
    };
    let NalMutationPlan::LinkAnnotation {
        annotation: actual,
        link,
    } = plan(NalMutation::LinkAnnotation {
        annotation: annotation.clone(),
    })
    else {
        panic!("link")
    };
    assert_eq!(actual, annotation);
    assert!(matches!(link,research_workbench_native_sdk::nal_annotation_prepare::NalAnnotationLinkPreparation::ReadActive {..}));
}

#[test]
fn final_rule_map_is_only_startup_ids_plus_requested_id_not_a_future_state() {
    let mut input = input(NalMutation::SetTransitivity {
        relation_concept_id: "middle".into(),
        enabled: false,
    });
    let SourceProbe::Available { value } = &mut input.bootstrap.source.raw_state else {
        panic!("raw")
    };
    value.relation_concept_ids = vec!["a".into(), "z".into()];
    let prepared = prepare(&input).unwrap();
    assert_eq!(
        prepared
            .rule_projection
            .iter()
            .map(|rule| rule.relation_concept_id.as_str())
            .collect::<Vec<_>>(),
        vec!["a", "z", "middle"]
    );
    let StateProjectionV1::Prepared { raw_state, .. } = prepared.bootstrap.final_projection else {
        panic!("state")
    };
    assert_eq!(raw_state.relation_concept_ids, vec!["a", "z"]);
    assert!(
        matches!(prepared.decision,NalMutationDecision::Prepared {mutation} if matches!(*mutation,NalMutationPlan::SetTransitivity {action:NalTransitivityAction::Disable {},..}))
    );
}

#[test]
fn dispatch_returns_reachable_domain_rejections_as_data_and_omits_invalid_json_text() {
    use research_workbench_native_sdk::catalog::{CatalogInput, CatalogOperation, CatalogOutput};
    let value = input(NalMutation::AddStatements { statements: vec![] });
    let output = crate::catalog::dispatch(CatalogInput::PrepareNalMutation {
        input: Box::new(value),
    })
    .unwrap();
    assert_eq!(output.operation(), CatalogOperation::PrepareNalMutation);
    let CatalogOutput::NalMutationPreparation { outcome } = output else {
        panic!("operation")
    };
    assert!(
        matches!(outcome.decision,NalMutationDecision::Prepared {mutation} if matches!(*mutation,NalMutationPlan::AddStatements {batch:NalStatementBatchPreparation::Rejected {reason:R::InvalidStatementCount}}))
    );
    let mut value = input(NalMutation::UnlinkAnnotation { id: "raw".into() });
    value.mutation_json = "private-invalid-mutation-json".into();
    let error = crate::catalog::dispatch(CatalogInput::PrepareNalMutation {
        input: Box::new(value),
    })
    .unwrap_err();
    assert_eq!(error.code(), "literature_catalog_input_invalid");
    assert!(!error.to_string().contains("private-invalid-mutation-json"));
}
