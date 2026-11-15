use super::*;
use concepts::Planner;
use research_workbench_native_sdk::nal_state::NalTerm;
use std::collections::HashMap;

#[derive(Default)]
struct ImportFields {
    active: bool,
    membership: Option<String>,
    tagged: Option<String>,
    collections: Vec<CollectionBindingV1>,
    linked_predicate: Option<String>,
    type_predicates: Vec<TypePredicateBindingV1>,
    related_field_probe: Option<RelatedFieldProbeV1>,
    subfield_predicate: Option<String>,
    linked_statements: Vec<PreparedNalStatementV1>,
    relation_statements: Vec<PreparedNalStatementV1>,
    membership_statements: Vec<PreparedNalStatementV1>,
    assignment_statements: Vec<PreparedNalStatementV1>,
}

impl ImportFields {
    fn statements(&self) -> Vec<PreparedNalStatementV1> {
        [
            &self.linked_statements,
            &self.relation_statements,
            &self.membership_statements,
            &self.assignment_statements,
        ]
        .into_iter()
        .flat_map(|values| values.iter().cloned())
        .collect()
    }
    fn finish(self) -> ImportPreparationV1 {
        if !self.active {
            return ImportPreparationV1::Skipped {};
        }
        ImportPreparationV1::Prepared(Box::new(PreparedImportV1 {
            membership: self.membership,
            tagged: self.tagged,
            collections: self.collections,
            linked_predicate: self.linked_predicate,
            type_predicates: self.type_predicates,
            related_field_probe: self.related_field_probe,
            subfield_predicate: self.subfield_predicate,
            linked_statements: self.linked_statements,
            relation_statements: self.relation_statements,
            membership_statements: self.membership_statements,
            assignment_statements: self.assignment_statements,
        }))
    }
}

pub fn prepare_bootstrap(input: &BootstrapInputV1) -> BootstrapPreparationV1 {
    let mut planner = Planner::new(input);
    let mut imported = ImportFields::default();
    let mut repair_active = false;
    let mut relation = None;
    let mut rewrites = vec![];
    let result = if prepare_bootstrap_probes(&input.source) != input.probes
        || input.identities.statement_ids.len() != input.probes.statement_count
    {
        Err(stop(
            BootstrapPhaseV1::LegacyHeader,
            BootstrapStopReasonV1::InvalidBinding {},
        ))
    } else {
        import(&mut planner, &mut imported).and_then(|()| {
            repair(
                &mut planner,
                &mut repair_active,
                &mut relation,
                &mut rewrites,
            )
        })
    };
    let (cleanup, final_projection, terminal) = match result {
        Err(terminal) => (
            CleanupPreparationV1::Deferred {},
            StateProjectionV1::Deferred {},
            Some(terminal),
        ),
        Ok(()) => projection::finish(
            &input.source,
            &planner.concepts,
            &imported.statements(),
            &rewrites,
            imported.active,
            repair_active,
        ),
    };
    BootstrapPreparationV1 {
        concepts: planner.concepts,
        import: imported.finish(),
        repair: if repair_active {
            RepairPreparationV1::Prepared { relation, rewrites }
        } else {
            RepairPreparationV1::Skipped {}
        },
        cleanup,
        final_projection,
        terminal,
    }
}

fn call(
    planner: &mut Planner<'_>,
    key: ConceptCallKeyV1,
    target: &mut Option<String>,
) -> Result<(), BootstrapStopV1> {
    *target = Some(planner.id(&key)?);
    planner.concept(key)?;
    Ok(())
}

fn statement(
    planner: &mut Planner<'_>,
    phase: BootstrapPhaseV1,
    subject: NalTerm,
    predicate: &str,
) -> Result<PreparedNalStatementV1, BootstrapStopV1> {
    let id = planner
        .input
        .identities
        .statement_ids
        .get(planner.statement_cursor)
        .ok_or_else(|| stop(phase, BootstrapStopReasonV1::InvalidBinding {}))?
        .clone();
    planner.statement_cursor += 1;
    let encode = |term| {
        serde_json::to_string(&term).map_err(|_| {
            stop(
                phase,
                BootstrapStopReasonV1::Rejected {
                    reason: BootstrapRejectionV1::InvalidStructure,
                },
            )
        })
    };
    let relation_concept_id =
        matches!(&subject, NalTerm::Product { .. }).then(|| predicate.to_owned());
    Ok(PreparedNalStatementV1 {
        relation_concept_id,
        statement: RawNalStatementV1 {
            id,
            subject_json: encode(subject)?,
            predicate_json: encode(NalTerm::Concept {
                id: predicate.into(),
            })?,
            origin: "legacy".into(),
        },
    })
}

fn concept(id: &str) -> NalTerm {
    NalTerm::Concept { id: id.into() }
}
fn product(terms: Vec<NalTerm>) -> NalTerm {
    NalTerm::Product { terms }
}

fn binding<T>(value: Option<T>, phase: BootstrapPhaseV1) -> Result<T, BootstrapStopV1> {
    value.ok_or_else(|| stop(phase, BootstrapStopReasonV1::InvalidBinding {}))
}

fn import(planner: &mut Planner<'_>, out: &mut ImportFields) -> Result<(), BootstrapStopV1> {
    let source = &planner.input.source;
    if *require(&source.legacy_imported, BootstrapPhaseV1::LegacyHeader)? {
        return Ok(());
    }
    out.active = true;
    let collections = require(&source.collections, BootstrapPhaseV1::Collections)?;
    if collections.is_empty() {
        return Ok(());
    }
    call(
        planner,
        ConceptCallKeyV1::Membership {},
        &mut out.membership,
    )?;
    call(planner, ConceptCallKeyV1::Tagged {}, &mut out.tagged)?;
    let mut ids = HashMap::new();
    let mut linked = vec![];
    for collection in collections {
        let key = ConceptCallKeyV1::Collection {
            source_id: collection.id.clone(),
        };
        let target = planner.id(&key)?;
        out.collections.push(CollectionBindingV1 {
            source_id: collection.id.clone(),
            concept_id: target.clone(),
        });
        planner.concept(key)?;
        if let Some(existing) = &collection.concept_id {
            linked.push((target.clone(), existing.clone()));
        }
        ids.insert(collection.id.clone(), target);
    }
    if !linked.is_empty() {
        call(
            planner,
            ConceptCallKeyV1::LinkedPredicate {},
            &mut out.linked_predicate,
        )?;
        let predicate = binding(
            out.linked_predicate.as_deref(),
            BootstrapPhaseV1::Collections,
        )?;
        for (collection, existing) in linked {
            out.linked_statements.push(statement(
                planner,
                BootstrapPhaseV1::Collections,
                product(vec![concept(&collection), concept(&existing)]),
                predicate,
            )?);
        }
    }
    let types = require(&source.relation_types, BootstrapPhaseV1::RelationTypes)?;
    let mut predicates = HashMap::new();
    for kind in types {
        if kind.id == "related-field" {
            out.related_field_probe = Some(RelatedFieldProbeV1 {
                source_id: kind.id.clone(),
                result: source.related_field_used.clone(),
            });
            if !*require(
                &source.related_field_used,
                BootstrapPhaseV1::RelatedFieldExistence,
            )? {
                continue;
            }
        }
        if kind.id != "sub-field" {
            let key = ConceptCallKeyV1::TypePredicate {
                source_id: kind.id.clone(),
            };
            let id = planner.id(&key)?;
            out.type_predicates.push(TypePredicateBindingV1 {
                source_id: kind.id.clone(),
                concept_id: id.clone(),
                directed: kind.directed,
            });
            planner.concept(key)?;
            predicates.insert(kind.id.clone(), (id, kind.directed));
        }
    }
    let relations = require(&source.relations, BootstrapPhaseV1::Relations)?;
    if relations.iter().any(|value| value.type_id == "sub-field") {
        call(
            planner,
            ConceptCallKeyV1::SubFieldPredicate {},
            &mut out.subfield_predicate,
        )?;
    }
    let mut relation_terms = HashMap::new();
    for relation in relations {
        let a = concept(binding(
            ids.get(&relation.source_id),
            BootstrapPhaseV1::Relations,
        )?);
        let b = concept(binding(
            ids.get(&relation.target_id),
            BootstrapPhaseV1::Relations,
        )?);
        let (predicate, directed) = if relation.type_id == "sub-field" {
            (
                binding(out.subfield_predicate.clone(), BootstrapPhaseV1::Relations)?,
                true,
            )
        } else {
            binding(
                predicates.get(&relation.type_id).cloned(),
                BootstrapPhaseV1::Relations,
            )?
        };
        out.relation_statements.push(statement(
            planner,
            BootstrapPhaseV1::Relations,
            product(vec![a.clone(), b.clone()]),
            &predicate,
        )?);
        if !directed {
            out.relation_statements.push(statement(
                planner,
                BootstrapPhaseV1::Relations,
                product(vec![b.clone(), a.clone()]),
                &predicate,
            )?);
        }
        relation_terms.insert(relation.id.clone(), (product(vec![a, b]), predicate));
    }
    let members = require(&source.memberships, BootstrapPhaseV1::Memberships)?;
    for member in members {
        let target = binding(
            ids.get(&member.collection_id),
            BootstrapPhaseV1::Memberships,
        )?;
        let predicate = binding(out.membership.as_deref(), BootstrapPhaseV1::Memberships)?;
        out.membership_statements.push(statement(
            planner,
            BootstrapPhaseV1::Memberships,
            product(vec![
                NalTerm::Paper {
                    id: member.item_id.clone(),
                },
                concept(target),
            ]),
            predicate,
        )?);
    }
    let assignments = require(&source.assignments, BootstrapPhaseV1::Assignments)?;
    for assignment in assignments {
        let (pair, predicate) = binding(
            relation_terms.get(&assignment.relation_id),
            BootstrapPhaseV1::Assignments,
        )?;
        let tagged = binding(out.tagged.as_deref(), BootstrapPhaseV1::Assignments)?;
        out.assignment_statements.push(statement(
            planner,
            BootstrapPhaseV1::Assignments,
            product(vec![
                NalTerm::Paper {
                    id: assignment.item_id.clone(),
                },
                pair.clone(),
                concept(predicate),
            ]),
            tagged,
        )?);
    }
    Ok(())
}

fn repair(
    planner: &mut Planner<'_>,
    active: &mut bool,
    relation: &mut Option<String>,
    rewrites: &mut Vec<RawNalStatementV1>,
) -> Result<(), BootstrapStopV1> {
    let source = &planner.input.source;
    if *require(&source.repair_version, BootstrapPhaseV1::RepairVersion)? == 1 {
        return Ok(());
    }
    *active = true;
    let records = require(&source.repair_records, BootstrapPhaseV1::RepairRecords)?;
    if records.is_empty() {
        return Ok(());
    }
    call(planner, ConceptCallKeyV1::RepairPredicate {}, relation)?;
    let predicate = binding(relation.as_deref(), BootstrapPhaseV1::RepairRole)?;
    for record in records {
        let decode = |raw: &str| {
            serde_json::from_str::<NalTerm>(raw).map_err(|_| {
                let mut terminal = stop(
                    BootstrapPhaseV1::RepairTermDecode,
                    BootstrapStopReasonV1::Rejected {
                        reason: BootstrapRejectionV1::InvalidStructure,
                    },
                );
                terminal.statement_id = Some(record.id.clone());
                terminal
            })
        };
        let subject = product(vec![
            decode(&record.subject_json)?,
            decode(&record.predicate_json)?,
        ]);
        let encode = |term| {
            serde_json::to_string(&term).map_err(|_| {
                stop(
                    BootstrapPhaseV1::RepairTermDecode,
                    BootstrapStopReasonV1::Rejected {
                        reason: BootstrapRejectionV1::InvalidStructure,
                    },
                )
            })
        };
        rewrites.push(RawNalStatementV1 {
            id: record.id.clone(),
            subject_json: encode(subject)?,
            predicate_json: encode(concept(predicate))?,
            origin: "legacy".into(),
        });
    }
    Ok(())
}
