use super::*;

pub fn prepare_bootstrap_probes(source: &BootstrapSourceV1) -> BootstrapProbePreparationV1 {
    let mut out = BootstrapProbePreparationV1 {
        concepts: vec![],
        term_keys: vec![],
        statement_count: 0,
        representation_render_version: policy::RENDER_VERSION.into(),
        semantic_namespace: "accepted_concepts".into(),
        semantic_space: SourceProbe::Skipped {},
        earliest_unavailable: None,
        terminal: None,
    };
    if let Err(terminal) = collect(source, &mut out) {
        if matches!(terminal.reason, BootstrapStopReasonV1::Deferred {}) {
            out.earliest_unavailable = Some(terminal.phase);
        }
        out.terminal = Some(terminal);
    }
    if !out.concepts.is_empty() {
        out.semantic_space = match &source.configured_embedding {
            SourceProbe::Available { value } => {
                ready(value.as_ref().map(|settings| PreparedSemanticSpaceV1 {
                    id: policy::embedding_space_id(&settings.region, &settings.model_id),
                    region: settings.region.trim().into(),
                    model_id: settings.model_id.trim().into(),
                    dimension: 1024,
                    instruction_set_version: policy::RENDER_VERSION.into(),
                }))
            }
            SourceProbe::Deferred {} => SourceProbe::Deferred {},
            SourceProbe::Skipped {} => SourceProbe::Skipped {},
        };
    }
    out
}

fn intent(
    out: &mut BootstrapProbePreparationV1,
    key: ConceptCallKeyV1,
    label: &str,
    explanation: &str,
) -> Result<(), BootstrapStopV1> {
    let term = policy::term_validation(label, "");
    let rejection = match &term {
        TermValidationV1::Prepared {
            normalized_text,
            language,
            ..
        } => {
            let key = TermLookupKeyV1 {
                normalized_text: normalized_text.clone(),
                language: language.clone(),
            };
            if !out.term_keys.contains(&key) {
                out.term_keys.push(key);
            }
            None
        }
        TermValidationV1::Rejected { reason } => Some(*reason),
    };
    out.concepts.push(ConceptIntentV1 {
        key: key.clone(),
        label: label.into(),
        explanation: explanation.into(),
        term,
    });
    if let Some(reason) = rejection {
        let mut terminal = stop(
            BootstrapPhaseV1::TermValidation,
            BootstrapStopReasonV1::Rejected { reason },
        );
        terminal.concept_key = Some(key);
        return Err(terminal);
    }
    Ok(())
}

fn collect(
    source: &BootstrapSourceV1,
    out: &mut BootstrapProbePreparationV1,
) -> Result<(), BootstrapStopV1> {
    if !*require(&source.legacy_imported, BootstrapPhaseV1::LegacyHeader)? {
        let collections = require(&source.collections, BootstrapPhaseV1::Collections)?;
        if !collections.is_empty() {
            intent(
                out,
                ConceptCallKeyV1::Membership {},
                "原归类",
                "从旧集合成员归属迁移；仅表示原有归类，不自动解释为所属领域。",
            )?;
            intent(
                out,
                ConceptCallKeyV1::Tagged {},
                "旧关系标注",
                "有序参数：文献、旧集合端点乘积、关系词项。保留原标签含义，不推断文献间关系。",
            )?;
            for collection in collections {
                intent(
                    out,
                    ConceptCallKeyV1::Collection {
                        source_id: collection.id.clone(),
                    },
                    &collection.name,
                    &format!("从原集合迁移。{}", collection.description),
                )?;
            }
            let linked = collections
                .iter()
                .filter(|value| value.concept_id.is_some())
                .count();
            if linked != 0 {
                intent(
                    out,
                    ConceptCallKeyV1::LinkedPredicate {},
                    "旧概念关联",
                    "旧集合对既有知识概念的可选引用；不合并两者身份。",
                )?;
                out.statement_count += linked;
            }
            let types = require(&source.relation_types, BootstrapPhaseV1::RelationTypes)?;
            for kind in types {
                if kind.id == "related-field"
                    && !*require(
                        &source.related_field_used,
                        BootstrapPhaseV1::RelatedFieldExistence,
                    )?
                {
                    continue;
                }
                if kind.id != "sub-field" {
                    intent(
                        out,
                        ConceptCallKeyV1::TypePredicate {
                            source_id: kind.id.clone(),
                        },
                        &kind.name,
                        &format!(
                            "从旧集合关系迁移。反向显示：{}；有向：{}。",
                            kind.inverse_name, kind.directed
                        ),
                    )?;
                }
            }
            let relations = require(&source.relations, BootstrapPhaseV1::Relations)?;
            if relations.iter().any(|value| value.type_id == "sub-field") {
                intent(
                    out,
                    ConceptCallKeyV1::SubFieldPredicate {},
                    "旧上下位关系",
                    "从旧集合 sub-field 迁移的有向二元关系；不作为继承，传递性需显式定义。",
                )?;
            }
            for relation in relations {
                out.statement_count += if relation.type_id == "sub-field" {
                    1
                } else if types
                    .iter()
                    .any(|kind| kind.id == relation.type_id && !kind.directed)
                {
                    2
                } else {
                    1
                };
            }
            out.statement_count +=
                require(&source.memberships, BootstrapPhaseV1::Memberships)?.len();
            out.statement_count +=
                require(&source.assignments, BootstrapPhaseV1::Assignments)?.len();
        }
    }
    if *require(&source.repair_version, BootstrapPhaseV1::RepairVersion)? != 1
        && !require(&source.repair_records, BootstrapPhaseV1::RepairRecords)?.is_empty()
    {
        intent(
            out,
            ConceptCallKeyV1::RepairPredicate {},
            "旧上下位关系",
            "从旧集合 sub-field 迁移的有向二元关系；不作为继承，传递性需显式定义。",
        )?;
    }
    Ok(())
}
