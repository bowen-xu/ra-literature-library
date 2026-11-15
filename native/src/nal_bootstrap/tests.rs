use super::*;

mod fixture;
use fixture::*;

#[test]
fn completed_and_empty_branches_do_not_require_skipped_legacy_tables_or_concepts() {
    let mut completed = source();
    completed.legacy_imported = ready(true);
    completed.collections = SourceProbe::Deferred {};
    let plan = prepare_bootstrap(&input(completed));
    assert!(plan.concepts.is_empty());
    assert!(matches!(plan.import, ImportPreparationV1::Skipped {}));
    assert_eq!(projected(&plan).revision, 0);
    let mut source = source();
    source.repair_version = ready(0);
    source.repair_records = ready(vec![]);
    let input = input(source);
    assert_eq!(input.probes.statement_count, 0);
    let plan = prepare_bootstrap(&input);
    assert!(plan.concepts.is_empty());
    assert_eq!(projected(&plan).revision, 2);
}

#[test]
fn early_term_rejection_beats_later_sources_but_retains_the_earlier_concept_schedule() {
    let mut source = with_collections(vec![collection("bad", "\t")]);
    source.relation_types = SourceProbe::Deferred {};
    raw(&mut source).statements.push(RawNalStatementV1 {
        id: "bad-fact".into(),
        subject_json: "null".into(),
        predicate_json: "null".into(),
        origin: "human".into(),
    });
    let plan = prepare_bootstrap(&input(source));
    assert_eq!(plan.concepts.len(), 3);
    let terminal = plan.terminal.unwrap();
    assert_eq!(terminal.phase, BootstrapPhaseV1::TermValidation);
    assert!(matches!(
        terminal.reason,
        BootstrapStopReasonV1::Rejected {
            reason: BootstrapRejectionV1::EmptyTerm
        }
    ));
    assert!(matches!(
        plan.concepts[0].term,
        SourceProbe::Available {
            value: TermResolutionV1::Create { .. }
        }
    ));
    assert!(matches!(plan.concepts[2].term, SourceProbe::Skipped {}));
    let plan = prepare_bootstrap(&input(with_collections(vec![collection("bad", "`")])));
    assert_eq!(
        plan.terminal.unwrap().phase,
        BootstrapPhaseV1::ConceptValidation
    );
    assert!(matches!(
        plan.concepts[2].term,
        SourceProbe::Available {
            value: TermResolutionV1::Create { .. }
        }
    ));
}

#[test]
fn lookup_and_later_term_readback_deferred_failures_keep_their_exact_original_phase() {
    for phase in [BootstrapPhaseV1::TermLookup, BootstrapPhaseV1::TermReadback] {
        let mut input = input(with_collections(vec![collection("a", "Valid")]));
        input.facts.terms[0].result = SourceProbe::Deferred {};
        input.facts.terms[0].failure_phase = Some(phase);
        let plan = prepare_bootstrap(&input);
        assert_eq!(plan.terminal.unwrap().phase, phase);
        assert_eq!(plan.concepts.len(), 1);
    }
}

#[test]
fn ordered_name_checks_preserve_raw_suffix_candidates_and_the_later_trimmed_availability_check() {
    let mut source = with_collections(vec![collection("a", " A ")]);
    source.occupied_name_keys = ready(vec![policy::name_key("A"), policy::name_key("A `旧归类-2")]);
    let plan = prepare_bootstrap(&input(source));
    let concept = &plan.concepts[2];
    assert_eq!(
        concept.name_checks,
        vec![
            NameCheckV1 {
                candidate: "A".into(),
                exists: true
            },
            NameCheckV1 {
                candidate: " A `旧归类-2".into(),
                exists: false
            }
        ]
    );
    assert_eq!(
        plan.terminal.unwrap().phase,
        BootstrapPhaseV1::ConceptNameAvailability
    );
    let SourceProbe::Available { value: details } = &concept.details else {
        panic!("prepared details")
    };
    assert_eq!(details.label, "A `旧归类-2");
    assert!(!details.available);
}

#[test]
fn a_new_import_reference_protects_an_old_placeholder_and_statement_attempts_remain_ordered() {
    let mut first = collection("a", "A");
    first.concept_id = Some("old-placeholder".into());
    let mut source = with_collections(vec![first, collection("b", "B")]);
    raw(&mut source)
        .concepts
        .push(placeholder("old-placeholder"));
    source.cleanup_exists = ready(true);
    source.occupied_name_keys = ready(vec![policy::name_key("related-field")]);
    source.relation_types = ready(vec![LegacyRelationTypeV1 {
        id: "mutual".into(),
        name: "Mutual".into(),
        inverse_name: "Mutual".into(),
        directed: false,
    }]);
    source.relations = ready(vec![LegacyRelationV1 {
        id: "r".into(),
        source_id: "a".into(),
        target_id: "b".into(),
        type_id: "mutual".into(),
    }]);
    source.memberships = ready(vec![LegacyMembershipV1 {
        item_id: "paper".into(),
        collection_id: "a".into(),
    }]);
    source.assignments = ready(vec![LegacyAssignmentV1 {
        item_id: "paper".into(),
        relation_id: "r".into(),
    }]);
    let input = input(source);
    assert_eq!(input.probes.statement_count, 5);
    let plan = prepare_bootstrap(&input);
    let state = projected(&plan);
    assert!(
        state
            .concepts
            .iter()
            .any(|concept| concept.id == "old-placeholder" && concept.concept_kind == "ordinary")
    );
    assert_eq!(
        state
            .statements
            .iter()
            .map(|row| row.id.as_str())
            .collect::<Vec<_>>(),
        [
            "statement-0",
            "statement-1",
            "statement-2",
            "statement-3",
            "statement-4"
        ]
    );
    let CleanupPreparationV1::Prepared { delete_ids, .. } = plan.cleanup else {
        panic!("post-import cleanup")
    };
    assert!(delete_ids.is_empty());
}

#[test]
fn cleanup_recomputes_existence_after_import_even_when_the_original_probe_was_false() {
    let mut source = with_collections(vec![collection("a", "A")]);
    source.relation_types = ready(vec![LegacyRelationTypeV1 {
        id: "unused-type".into(),
        name: "related-field".into(),
        inverse_name: "related-field".into(),
        directed: false,
    }]);
    assert_eq!(source.cleanup_exists, ready(false));
    let plan = prepare_bootstrap(&input(source));
    let state = projected(&plan);
    assert_eq!(state.revision, 6);
    assert_eq!(state.concepts.len(), 3);
    let CleanupPreparationV1::Prepared {
        delete_ids,
        expected_post_repair,
    } = &plan.cleanup
    else {
        panic!("new placeholder must be cleaned")
    };
    assert_eq!(delete_ids, &["concept-3"]);
    assert_eq!(expected_post_repair.revision, 5);
}

#[test]
fn fact_decode_is_delayed_to_the_original_repair_cleanup_or_final_load_point() {
    for cleanup in [false, true] {
        let mut source = source();
        source.legacy_imported = ready(true);
        source.cleanup_exists = ready(cleanup);
        if cleanup {
            raw(&mut source).concepts.push(placeholder("old"));
        }
        raw(&mut source).statements.push(RawNalStatementV1 {
            id: "invalid".into(),
            subject_json: r#"{"kind":"variable","name":"x"}"#.into(),
            predicate_json: r#"{"kind":"concept","id":"x"}"#.into(),
            origin: "human".into(),
        });
        let plan = prepare_bootstrap(&input(source));
        assert_eq!(
            plan.terminal.unwrap().phase,
            if cleanup {
                BootstrapPhaseV1::CleanupLoad
            } else {
                BootstrapPhaseV1::FinalLoad
            }
        );
    }
    let mut source = source();
    source.legacy_imported = ready(true);
    source.repair_version = ready(0);
    source.repair_records = ready(vec![RepairRecordV1 {
        id: "legacy".into(),
        subject_json: r#"{"kind":"concept","id":null}"#.into(),
        predicate_json: r#"{"kind":"concept","id":"p"}"#.into(),
    }]);
    let plan = prepare_bootstrap(&input(source));
    assert_eq!(plan.concepts.len(), 1);
    let terminal = plan.terminal.unwrap();
    assert_eq!(terminal.phase, BootstrapPhaseV1::RepairTermDecode);
    assert_eq!(terminal.statement_id.as_deref(), Some("legacy"));
}

#[test]
fn same_call_terms_and_generation_are_reused_without_fabricated_metadata() {
    let mut source = with_collections(vec![collection("a", "原归类")]);
    source.configured_embedding = ready(Some(ConfiguredEmbeddingV1 {
        region: " cn ".into(),
        model_id: " model ".into(),
    }));
    let mut input = input(source);
    input.facts.generation = ready(None);
    input.facts.next_generation = ready(6);
    for concept in &mut input.facts.concepts {
        concept.queue_job = ready(None);
    }
    let plan = prepare_bootstrap(&input);
    projected(&plan);
    let SourceProbe::Available {
        value: TermResolutionV1::Planned { id, .. },
    } = &plan.concepts[2].term
    else {
        panic!("same normalized term should reuse first new term")
    };
    assert_eq!(id, "term-0");
    let SourceProbe::Available { value: Some(first) } = &plan.concepts[0].semantic_queue else {
        panic!("first queued representation")
    };
    assert!(first.generation.create);
    assert_eq!(first.generation.generation, 6);
    for concept in &plan.concepts[1..] {
        let SourceProbe::Available { value: Some(queue) } = &concept.semantic_queue else {
            panic!("queue")
        };
        assert!(!queue.generation.create);
        assert_eq!(queue.generation.id, "generation-slot");
    }
    assert_eq!(plan.concepts[2].name_checks[1].candidate, "原归类`旧归类-2");
}

#[test]
fn an_expression_conflict_keeps_the_original_row_id_but_consumes_the_attempt_slot_and_marks_the_new_role()
 {
    let mut source = with_collections(vec![collection("a", "A")]);
    source.memberships = ready(vec![LegacyMembershipV1 {
        item_id: "paper".into(),
        collection_id: "a".into(),
    }]);
    let mut input = input(source);
    assert_eq!(input.probes.statement_count, 1);
    raw(&mut input.source).statements.push(RawNalStatementV1 {
        id: "original-kept-id".into(),
        subject_json: r#"{"kind":"product","terms":[{"kind":"paper","id":"paper"},{"kind":"concept","id":"concept-2"}]}"#.into(),
        predicate_json: r#"{"kind":"concept","id":"concept-0"}"#.into(),
        origin: "human".into(),
    });
    let plan = prepare_bootstrap(&input);
    let state = projected(&plan);
    assert_eq!(state.statements.len(), 1);
    assert_eq!(state.statements[0].id, "original-kept-id");
    assert_eq!(state.statements[0].origin, "human");
    assert_eq!(
        state
            .concepts
            .iter()
            .find(|concept| concept.id == "concept-0")
            .unwrap()
            .concept_kind,
        "relation"
    );
    let ImportPreparationV1::Prepared(import) = plan.import else {
        panic!("import attempts")
    };
    assert_eq!(import.membership_statements[0].statement.id, "statement-0");
}

#[test]
fn a_later_queue_failure_retains_the_preceding_semantic_generation_binding() {
    let mut source = with_collections(vec![collection("a", "A")]);
    source.configured_embedding = ready(Some(ConfiguredEmbeddingV1 {
        region: "cn".into(),
        model_id: "model".into(),
    }));
    let mut input = input(source);
    input.facts.generation = ready(None);
    input.facts.next_generation = ready(1);
    input.facts.concepts[0].queue_job = SourceProbe::Deferred {};
    let plan = prepare_bootstrap(&input);
    assert_eq!(plan.terminal.unwrap().phase, BootstrapPhaseV1::QueueLookup);
    let SourceProbe::Available { value: generation } = &plan.concepts[0].semantic_generation else {
        panic!("generation binding precedes the failing queue lookup")
    };
    assert!(generation.create);
    assert_eq!(
        generation.relative_database_path,
        format!("{}/generation-000001", embedding_space_id("cn", "model"))
    );
    assert!(matches!(
        plan.concepts[0].semantic_queue,
        SourceProbe::Skipped {}
    ));
}

#[test]
fn related_field_probe_is_bound_after_prior_type_concepts_and_before_its_deferred_read() {
    let mut source = with_collections(vec![collection("a", "A")]);
    source.relation_types = ready(vec![
        LegacyRelationTypeV1 {
            id: "first".into(),
            name: "First".into(),
            inverse_name: "First".into(),
            directed: true,
        },
        LegacyRelationTypeV1 {
            id: "related-field".into(),
            name: "related-field".into(),
            inverse_name: "related-field".into(),
            directed: false,
        },
    ]);
    source.related_field_used = SourceProbe::Deferred {};
    let plan = prepare_bootstrap(&input(source));
    assert_eq!(
        plan.terminal.unwrap().phase,
        BootstrapPhaseV1::RelatedFieldExistence
    );
    assert_eq!(plan.concepts.len(), 4);
    let ImportPreparationV1::Prepared(import) = plan.import else {
        panic!("partial import")
    };
    assert_eq!(
        import.related_field_probe,
        Some(RelatedFieldProbeV1 {
            source_id: "related-field".into(),
            result: SourceProbe::Deferred {}
        })
    );
    assert_eq!(import.type_predicates.len(), 1);
    assert_eq!(import.type_predicates[0].source_id, "first");
}

#[test]
fn revision_overflow_does_not_insert_an_intermediate_load_when_cleanup_is_absent() {
    let mut source = source();
    raw(&mut source).revision = i64::MAX;
    let plan = prepare_bootstrap(&input(source));
    assert!(matches!(plan.cleanup, CleanupPreparationV1::Skipped {}));
    assert!(matches!(
        plan.final_projection,
        StateProjectionV1::DecodeAtOriginalPoint {}
    ));
    assert!(plan.terminal.is_none());
}
