use super::*;
use research_workbench_native_sdk::nal_state::NalConcept;

pub fn source() -> BootstrapSourceV1 {
    BootstrapSourceV1 {
        legacy_imported: ready(false),
        collections: ready(vec![]),
        relation_types: SourceProbe::Skipped {},
        related_field_used: SourceProbe::Skipped {},
        relations: SourceProbe::Skipped {},
        memberships: SourceProbe::Skipped {},
        assignments: SourceProbe::Skipped {},
        repair_version: ready(1),
        repair_records: SourceProbe::Skipped {},
        cleanup_exists: ready(false),
        raw_state: ready(RawNalStateV1 {
            revision: 0,
            concepts: vec![],
            statements: vec![],
            annotations: vec![],
            relation_concept_ids: vec![],
        }),
        occupied_name_keys: ready(vec![]),
        configured_embedding: ready(None),
    }
}

pub fn collection(id: &str, name: &str) -> LegacyCollectionV1 {
    LegacyCollectionV1 {
        id: id.into(),
        name: name.into(),
        description: "Synthetic".into(),
        concept_id: None,
    }
}

pub fn with_collections(collections: Vec<LegacyCollectionV1>) -> BootstrapSourceV1 {
    BootstrapSourceV1 {
        collections: ready(collections),
        relation_types: ready(vec![]),
        relations: ready(vec![]),
        memberships: ready(vec![]),
        assignments: ready(vec![]),
        ..source()
    }
}

pub fn input(source: BootstrapSourceV1) -> BootstrapInputV1 {
    let probes = prepare_bootstrap_probes(&source);
    let concepts = probes
        .concepts
        .iter()
        .enumerate()
        .map(|(index, intent)| ConceptIdentitySlotsV1 {
            key: intent.key.clone(),
            term_id: format!("term-{index}"),
            term_revision_id: format!("term-revision-{index}"),
            concept_id: format!("concept-{index}"),
            concept_revision_id: format!("concept-revision-{index}"),
            representation_id: format!("representation-{index}"),
            record_id: format!("record-{index}"),
            job_id: format!("job-{index}"),
        })
        .collect();
    let facts = BootstrapProbeFactsV1 {
        terms: probes
            .term_keys
            .iter()
            .cloned()
            .map(|key| TermLookupFactV1 {
                key,
                result: ready(None),
                failure_phase: None,
            })
            .collect(),
        generation: SourceProbe::Skipped {},
        next_generation: SourceProbe::Skipped {},
        concepts: probes
            .concepts
            .iter()
            .map(|intent| ConceptSemanticFactV1 {
                key: intent.key.clone(),
                representation: ready(None),
                queue_job: SourceProbe::Skipped {},
            })
            .collect(),
    };
    let identities = BootstrapIdentitiesV1 {
        concepts,
        generation_id: Some("generation-slot".into()),
        statement_ids: (0..probes.statement_count)
            .map(|index| format!("statement-{index}"))
            .collect(),
    };
    BootstrapInputV1 {
        source,
        probes,
        facts,
        identities,
    }
}

pub fn raw(source: &mut BootstrapSourceV1) -> &mut RawNalStateV1 {
    let SourceProbe::Available { value } = &mut source.raw_state else {
        panic!("fixture raw state")
    };
    value
}

pub fn projected(plan: &BootstrapPreparationV1) -> &RawNalStateV1 {
    assert!(
        plan.terminal.is_none(),
        "unexpected terminal: {:?}",
        plan.terminal
    );
    let StateProjectionV1::Prepared { raw_state, .. } = &plan.final_projection else {
        panic!("fixture expected successful projection")
    };
    raw_state
}

pub fn placeholder(id: &str) -> NalConcept {
    NalConcept {
        id: id.into(),
        label: "related-field".into(),
        explanation: "从旧集合关系迁移。反向显示：related-field；有向：false。".into(),
        revision: 4,
        concept_kind: "ordinary".into(),
    }
}
