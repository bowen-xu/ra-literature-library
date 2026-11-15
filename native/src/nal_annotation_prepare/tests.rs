use super::*;
use crate::nal_bootstrap::prepare_bootstrap_probes;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    nal_annotation_prepare::NalAnnotationIdentities,
    nal_bootstrap::*,
    nal_state::NalConcept,
};

fn ready<T>(value: T) -> SourceProbe<T> {
    SourceProbe::Available { value }
}

fn annotation() -> NalAnnotation {
    NalAnnotation {
        id: "annotation".into(),
        target_kind: "concept".into(),
        target_id: "target".into(),
        note_page_id: "note".into(),
    }
}

fn concept(id: &str) -> NalConcept {
    NalConcept {
        id: id.into(),
        label: "Synthetic target".into(),
        explanation: "".into(),
        revision: 1,
        concept_kind: "ordinary".into(),
    }
}

fn input() -> NalAnnotationPrepareInput {
    let source = BootstrapSourceV1 {
        legacy_imported: ready(true),
        collections: SourceProbe::Skipped {},
        relation_types: SourceProbe::Skipped {},
        related_field_used: SourceProbe::Skipped {},
        relations: SourceProbe::Skipped {},
        memberships: SourceProbe::Skipped {},
        assignments: SourceProbe::Skipped {},
        repair_version: ready(1),
        repair_records: SourceProbe::Skipped {},
        cleanup_exists: ready(false),
        raw_state: ready(RawNalStateV1 {
            revision: 7,
            concepts: vec![],
            statements: vec![],
            annotations: vec![],
            relation_concept_ids: vec![],
        }),
        occupied_name_keys: ready(vec![]),
        configured_embedding: ready(None),
    };
    NalAnnotationPrepareInput {
        bootstrap: BootstrapInputV1 {
            probes: prepare_bootstrap_probes(&source),
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
        request: NalAnnotationRequest {
            target_kind: "concept".into(),
            target_id: "target".into(),
            title: " Raw title ".into(),
        },
        identities: NalAnnotationIdentities {
            page_id: " proposed page ".into(),
            annotation_id: " proposed annotation ".into(),
        },
    }
}

fn raw(input: &mut NalAnnotationPrepareInput) -> &mut RawNalStateV1 {
    let SourceProbe::Available { value } = &mut input.bootstrap.source.raw_state else {
        panic!("synthetic raw state must be available")
    };
    value
}

#[test]
fn prevalidation_uses_original_domain_rules_without_the_core_title_limit() {
    let mut request = input().request;
    request.title = "文".repeat(300);
    assert_eq!(validate(&request), NalAnnotationValidation::Valid {});
    request.title.push('文');
    assert_eq!(
        validate(&request),
        NalAnnotationValidation::InvalidRequest {}
    );
    request.title = "Title".into();
    request.target_id = "é".repeat(100);
    assert_eq!(validate(&request), NalAnnotationValidation::Valid {});
    request.target_id.push('é');
    assert_eq!(
        validate(&request),
        NalAnnotationValidation::InvalidRequest {}
    );
}

#[test]
fn link_identity_guard_precedes_load_conflicts_and_preserves_original_byte_limit() {
    let conflicting = [annotation()];
    for id in [" \t".into(), "a".repeat(201), "文".repeat(67)] {
        let mut proposed = annotation();
        proposed.id = id;
        proposed.target_kind = "invalid".into();
        assert_eq!(
            validate_link_id(&proposed),
            Err(NalAnnotationLinkError::InvalidAnnotationId)
        );
        assert_eq!(
            prepare_link(&proposed, &conflicting),
            NalAnnotationLinkPreparation::RejectedBeforeLoad {
                reason: Before::InvalidAnnotationId
            }
        );
    }
    for id in [
        " not-a-uuid ".into(),
        "é".repeat(100),
        "文".repeat(66) + "ab",
    ] {
        let mut proposed = annotation();
        proposed.id = id;
        assert!(validate_link_id(&proposed).is_ok());
        assert!(matches!(
            prepare_link(&proposed, &[]),
            NalAnnotationLinkPreparation::ReadActive { .. }
        ));
    }
}

#[test]
fn link_identity_conflict_wins_over_target_conflict_and_keeps_all_observed_rows() {
    let proposed = annotation();
    let mut same_id = proposed.clone();
    same_id.note_page_id = "different-note".into();
    let mut same_target = same_id.clone();
    same_target.id = "other-annotation".into();
    let observed = vec![same_id, same_target, proposed.clone()];
    assert_eq!(
        prepare_link(&proposed, &observed),
        NalAnnotationLinkPreparation::AfterLoadRejected {
            annotations: observed,
            reason: After::IdentityConflict
        }
    );
    let observed = vec![NalAnnotation {
        id: "another".into(),
        note_page_id: "another-note".into(),
        ..proposed.clone()
    }];
    assert_eq!(
        prepare_link(&proposed, &observed),
        NalAnnotationLinkPreparation::AfterLoadRejected {
            annotations: observed,
            reason: After::TargetConflict
        }
    );
    assert_eq!(
        NalAnnotationLinkError::from(After::IdentityConflict).to_string(),
        "笔记关联身份冲突"
    );
    assert_eq!(
        NalAnnotationLinkError::from(After::TargetConflict).to_string(),
        "每个概念或语句只能关联一份笔记"
    );
}

#[test]
fn link_preserves_first_identity_match_and_defers_invalid_kind_until_after_active_read() {
    let proposed = annotation();
    let observed = vec![
        proposed.clone(),
        NalAnnotation {
            target_id: "different-target".into(),
            note_page_id: "different-note".into(),
            ..proposed.clone()
        },
        NalAnnotation {
            id: "another-id".into(),
            ..proposed.clone()
        },
    ];
    assert_eq!(
        prepare_link(&proposed, &observed),
        NalAnnotationLinkPreparation::ReadActive {
            annotations: observed,
            target: NalAnnotationLinkTarget::Concept {
                id: proposed.target_id
            }
        }
    );
    for kind in ["statement", " concept", ""] {
        let proposed = NalAnnotation {
            target_kind: kind.into(),
            target_id: " raw target ".into(),
            ..annotation()
        };
        let expected = if kind == "statement" {
            NalAnnotationLinkTarget::Statement {
                id: proposed.target_id.clone(),
            }
        } else {
            NalAnnotationLinkTarget::InvalidTargetKind {}
        };
        assert_eq!(
            prepare_link(&proposed, &[]),
            NalAnnotationLinkPreparation::ReadActive {
                annotations: vec![],
                target: expected
            }
        );
    }
    assert_eq!(
        NalAnnotationLinkError::InactiveNote.to_string(),
        "笔记不存在或不在活跃状态"
    );
    assert_eq!(
        NalAnnotationLinkError::InvalidTargetKind.to_string(),
        "笔记目标类型无效"
    );
}

#[test]
fn existing_reuses_first_identity_after_pending_bootstrap_even_with_missing_target() {
    let mut input = input();
    input.bootstrap.source.legacy_imported = ready(false);
    input.bootstrap.source.collections = ready(vec![]);
    input.bootstrap.probes = prepare_bootstrap_probes(&input.bootstrap.source);
    input.request.title = "文".repeat(300);
    input.identities.annotation_id = "".into();
    input.identities.page_id = "unused-proposed-page".into();
    let existing = annotation();
    raw(&mut input).annotations = vec![
        existing.clone(),
        NalAnnotation {
            id: "second".into(),
            ..existing.clone()
        },
    ];
    let prepared = prepare(&input).unwrap();
    assert_eq!(
        prepared.bootstrap,
        crate::nal_bootstrap::prepare_bootstrap(&input.bootstrap)
    );
    assert!(prepared.bootstrap.terminal.is_none());
    assert!(matches!(
        prepared.bootstrap.import,
        ImportPreparationV1::Prepared(_)
    ));
    assert_eq!(
        prepared.decision,
        NalAnnotationDecision::Existing {
            annotation: existing
        }
    );
}

#[test]
fn create_keeps_core_slots_raw_title_and_original_target_kind() {
    for kind in ["concept", "statement"] {
        let mut input = input();
        input.request.target_kind = kind.into();
        input.request.target_id = " raw target ".into();
        input.request.title = "文".repeat(300);
        let target = input.request.target_id.clone();
        if kind == "concept" {
            raw(&mut input).concepts.push(concept(&target));
        } else {
            raw(&mut input).statements.push(RawNalStatementV1 {
                id: target.clone(),
                subject_json: "{\"kind\":\"concept\",\"id\":\"s\"}".into(),
                predicate_json: "{\"kind\":\"concept\",\"id\":\"p\"}".into(),
                origin: "human".into(),
            });
        }
        let observed = vec![NalAnnotation {
            id: "unrelated".into(),
            target_id: "another-target".into(),
            ..annotation()
        }];
        raw(&mut input).annotations = observed.clone();
        let prepared = prepare(&input).unwrap();
        let NalAnnotationDecision::Create {
            annotation,
            raw_title,
            link,
        } = prepared.decision
        else {
            panic!("expected Create: {prepared:?}")
        };
        assert_eq!(annotation.id, input.identities.annotation_id);
        assert_eq!(annotation.note_page_id, input.identities.page_id);
        assert_eq!(annotation.target_id, input.request.target_id);
        assert_eq!(annotation.target_kind, kind);
        assert_eq!(raw_title, input.request.title);
        let target = if kind == "concept" {
            NalAnnotationLinkTarget::Concept { id: target }
        } else {
            NalAnnotationLinkTarget::Statement { id: target }
        };
        assert_eq!(
            link,
            NalAnnotationLinkPreparation::ReadActive {
                annotations: observed,
                target
            }
        );
    }
}

#[test]
fn missing_target_is_consumed_after_bootstrap_not_after_link_slot_validation() {
    let mut input = input();
    input.identities.annotation_id = "".into();
    let prepared = prepare(&input).unwrap();
    assert!(prepared.bootstrap.terminal.is_none());
    assert_eq!(prepared.decision, NalAnnotationDecision::TargetMissing {});
}

#[test]
fn prior_bootstrap_failure_defers_missing_target_existing_and_link_rejections() {
    let mut input = input();
    input.identities.annotation_id = "".into();
    input.bootstrap.source.legacy_imported = SourceProbe::Deferred {};
    input.bootstrap.probes = prepare_bootstrap_probes(&input.bootstrap.source);
    let prepared = prepare(&input).unwrap();
    assert_eq!(
        prepared.bootstrap.terminal.unwrap().phase,
        BootstrapPhaseV1::LegacyHeader
    );
    assert_eq!(
        prepared.decision,
        NalAnnotationDecision::DeferredAfterBootstrap {}
    );

    let mut input = self::input();
    raw(&mut input).annotations.push(annotation());
    raw(&mut input).statements.push(RawNalStatementV1 {
        id: "bad-fact".into(),
        subject_json: "{\"kind\":\"variable\",\"name\":\"x\"}".into(),
        predicate_json: "{\"kind\":\"concept\",\"id\":\"p\"}".into(),
        origin: "human".into(),
    });
    let prepared = prepare(&input).unwrap();
    assert!(prepared.bootstrap.terminal.is_some());
    assert_eq!(
        prepared.decision,
        NalAnnotationDecision::DeferredAfterBootstrap {}
    );
}

#[test]
fn dispatch_exposes_only_two_named_calls_and_rejects_bypassing_prevalidation_safely() {
    let mut input = input();
    input.request.title = "".into();
    let output = crate::catalog::dispatch(CatalogInput::ValidateNalAnnotation {
        request: input.request.clone(),
    })
    .unwrap();
    assert_eq!(output.operation(), CatalogOperation::ValidateNalAnnotation);
    assert_eq!(
        output,
        CatalogOutput::NalAnnotationValidation {
            outcome: NalAnnotationValidation::InvalidRequest {}
        }
    );
    assert_eq!(
        prepare(&input).unwrap_err(),
        NalAnnotationError::InvalidRequest
    );
    let error = crate::catalog::dispatch(CatalogInput::PrepareNalAnnotation {
        input: Box::new(input),
    })
    .unwrap_err();
    assert_eq!(error.code(), "literature_catalog_input_invalid");
    assert_eq!(
        error.to_string(),
        "literature_catalog_input_invalid: annotation preparation requires a valid original request"
    );
    let output = crate::catalog::dispatch(CatalogInput::PrepareNalAnnotation {
        input: Box::new(self::input()),
    })
    .unwrap();
    assert_eq!(output.operation(), CatalogOperation::PrepareNalAnnotation);
    assert!(matches!(
        output,
        CatalogOutput::NalAnnotationPreparation { .. }
    ));
}
