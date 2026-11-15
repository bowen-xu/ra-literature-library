use super::*;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

pub(super) struct Planner<'a> {
    pub input: &'a BootstrapInputV1,
    pub concepts: Vec<PreparedConceptV1>,
    pub statement_cursor: usize,
    terms: Vec<(TermLookupKeyV1, TermResolutionV1)>,
    occupied: Option<HashSet<String>>,
    generation: Option<PreparedGenerationV1>,
}

impl<'a> Planner<'a> {
    pub fn new(input: &'a BootstrapInputV1) -> Self {
        Self {
            input,
            concepts: vec![],
            statement_cursor: 0,
            terms: vec![],
            occupied: None,
            generation: None,
        }
    }

    pub fn id(&self, key: &ConceptCallKeyV1) -> Result<String, BootstrapStopV1> {
        self.input
            .identities
            .concepts
            .iter()
            .find(|value| &value.key == key)
            .map(|value| value.concept_id.clone())
            .ok_or_else(|| {
                stop(
                    BootstrapPhaseV1::TermValidation,
                    BootstrapStopReasonV1::InvalidBinding {},
                )
            })
    }

    pub fn concept(&mut self, key: ConceptCallKeyV1) -> Result<String, BootstrapStopV1> {
        let intent = self
            .input
            .probes
            .concepts
            .iter()
            .find(|value| value.key == key)
            .ok_or_else(|| {
                stop(
                    BootstrapPhaseV1::TermValidation,
                    BootstrapStopReasonV1::InvalidBinding {},
                )
            })?
            .clone();
        let slots = self
            .input
            .identities
            .concepts
            .iter()
            .find(|value| value.key == key)
            .ok_or_else(|| {
                stop(
                    BootstrapPhaseV1::TermValidation,
                    BootstrapStopReasonV1::InvalidBinding {},
                )
            })?
            .clone();
        let mut out = PreparedConceptV1 {
            key: key.clone(),
            term: SourceProbe::Skipped {},
            concept_id: slots.concept_id.clone(),
            concept_revision_id: slots.concept_revision_id.clone(),
            name_checks: vec![],
            details: SourceProbe::Skipped {},
            representation: SourceProbe::Skipped {},
            semantic_generation: SourceProbe::Skipped {},
            semantic_queue: SourceProbe::Skipped {},
        };
        let result = self.prepare(&intent, &slots, &mut out);
        self.concepts.push(out);
        result.map_err(|mut terminal| {
            terminal.concept_key = Some(key);
            terminal
        })?;
        Ok(slots.concept_id)
    }

    fn prepare(
        &mut self,
        intent: &ConceptIntentV1,
        slots: &ConceptIdentitySlotsV1,
        out: &mut PreparedConceptV1,
    ) -> Result<(), BootstrapStopV1> {
        let term = self.resolve_term(&intent.term, slots)?;
        let (text, language) = match &term {
            TermResolutionV1::Existing { term } => (term.text.clone(), term.language.clone()),
            TermResolutionV1::Create { text, language, .. }
            | TermResolutionV1::Planned { text, language, .. } => (text.clone(), language.clone()),
        };
        out.term = ready(term);
        if self.occupied.is_none() {
            self.occupied = Some(
                require(
                    &self.input.source.occupied_name_keys,
                    BootstrapPhaseV1::ConceptNameCollision,
                )?
                .iter()
                .cloned()
                .collect(),
            );
        }
        let occupied = self
            .occupied
            .as_mut()
            .expect("initialized immediately above");
        let mut name = intent.label.trim().to_owned();
        let mut index = 2;
        loop {
            let exists = occupied.contains(&policy::name_key(&name));
            out.name_checks.push(NameCheckV1 {
                candidate: name.clone(),
                exists,
            });
            if !exists {
                break;
            }
            let suffix = format!("`旧归类-{index}");
            let base = intent
                .label
                .chars()
                .take(500 - suffix.chars().count())
                .collect::<String>();
            name = format!("{}{suffix}", base.trim_end_matches('`'));
            index += 1;
        }
        let rejection = policy::validate_name(&name).err().or_else(|| {
            (name.chars().count() > 500).then_some(BootstrapRejectionV1::ConceptFieldsTooLong)
        });
        let available = !occupied.contains(&policy::name_key(name.trim()));
        let details = PreparedConceptDetailsV1 {
            label: name.trim().into(),
            explanation: intent.explanation.trim().into(),
            disambiguation: "从旧文献归类迁移，保持原身份区分".into(),
            domain: String::new(),
            tradition: String::new(),
            period: String::new(),
            rejection,
            available,
        };
        out.details = ready(details.clone());
        if let Some(reason) = rejection {
            return Err(stop(
                BootstrapPhaseV1::ConceptValidation,
                BootstrapStopReasonV1::Rejected { reason },
            ));
        }
        if !available {
            return Err(stop(
                BootstrapPhaseV1::ConceptNameAvailability,
                BootstrapStopReasonV1::Rejected {
                    reason: BootstrapRejectionV1::NameUnavailable,
                },
            ));
        }
        occupied.insert(policy::name_key(&details.label));
        let rendered_text = policy::render_prepared(&details, &text).map_err(|_| {
            stop(
                BootstrapPhaseV1::SemanticRender,
                BootstrapStopReasonV1::Rejected {
                    reason: BootstrapRejectionV1::InvalidStructure,
                },
            )
        })?;
        let facts = self
            .input
            .facts
            .concepts
            .iter()
            .find(|value| value.key == intent.key)
            .ok_or_else(|| {
                stop(
                    BootstrapPhaseV1::RepresentationLookup,
                    BootstrapStopReasonV1::InvalidBinding {},
                )
            })?;
        let existing = require(
            &facts.representation,
            BootstrapPhaseV1::RepresentationLookup,
        )?;
        let representation = PreparedRepresentationV1 {
            id: existing
                .clone()
                .unwrap_or_else(|| slots.representation_id.clone()),
            existing: existing.is_some(),
            input_sha256: format!("{:x}", Sha256::digest(rendered_text.as_bytes())),
            rendered_text,
            render_version: policy::RENDER_VERSION.into(),
            language,
        };
        out.representation = ready(representation.clone());
        let Some(space) = require(
            &self.input.probes.semantic_space,
            BootstrapPhaseV1::EmbeddingSettings,
        )?
        else {
            out.semantic_queue = ready(None);
            return Ok(());
        };
        let generation = self.generation(space)?;
        out.semantic_generation = ready(generation.clone());
        let existing_job = require(&facts.queue_job, BootstrapPhaseV1::QueueLookup)?;
        let job = match existing_job {
            Some(job_id) => QueueResolutionV1::Existing {
                job_id: job_id.clone(),
            },
            None => QueueResolutionV1::Create {
                record_id: slots.record_id.clone(),
                job_id: slots.job_id.clone(),
                row_id: policy::stable_row_id(&representation.id, &space.id, generation.generation),
                idempotency_key: format!("embedding:{}:1", slots.record_id),
            },
        };
        out.semantic_queue = ready(Some(PreparedSemanticQueueV1 {
            space: space.clone(),
            generation,
            job,
        }));
        Ok(())
    }

    fn resolve_term(
        &mut self,
        validation: &TermValidationV1,
        slots: &ConceptIdentitySlotsV1,
    ) -> Result<TermResolutionV1, BootstrapStopV1> {
        let TermValidationV1::Prepared {
            trimmed_text,
            normalized_text,
            language,
        } = validation
        else {
            let TermValidationV1::Rejected { reason } = validation else {
                unreachable!()
            };
            return Err(stop(
                BootstrapPhaseV1::TermValidation,
                BootstrapStopReasonV1::Rejected { reason: *reason },
            ));
        };
        let key = TermLookupKeyV1 {
            normalized_text: normalized_text.clone(),
            language: language.clone(),
        };
        if let Some((_, term)) = self.terms.iter().find(|(existing, _)| existing == &key) {
            return Ok(match term {
                TermResolutionV1::Existing { term } => {
                    TermResolutionV1::Existing { term: term.clone() }
                }
                TermResolutionV1::Create {
                    id,
                    text,
                    normalized_text,
                    language,
                    ..
                }
                | TermResolutionV1::Planned {
                    id,
                    text,
                    normalized_text,
                    language,
                } => TermResolutionV1::Planned {
                    id: id.clone(),
                    text: text.clone(),
                    normalized_text: normalized_text.clone(),
                    language: language.clone(),
                },
            });
        }
        let fact = self
            .input
            .facts
            .terms
            .iter()
            .find(|value| value.key == key)
            .ok_or_else(|| {
                stop(
                    BootstrapPhaseV1::TermLookup,
                    BootstrapStopReasonV1::InvalidBinding {},
                )
            })?;
        let failure_phase = match fact.failure_phase {
            Some(BootstrapPhaseV1::TermLookup | BootstrapPhaseV1::TermReadback) => {
                fact.failure_phase.unwrap_or(BootstrapPhaseV1::TermLookup)
            }
            None => BootstrapPhaseV1::TermLookup,
            Some(_) => {
                return Err(stop(
                    BootstrapPhaseV1::TermLookup,
                    BootstrapStopReasonV1::InvalidBinding {},
                ));
            }
        };
        let term = match require(&fact.result, failure_phase)? {
            Some(term) => TermResolutionV1::Existing { term: term.clone() },
            None => TermResolutionV1::Create {
                id: slots.term_id.clone(),
                text: trimmed_text.clone(),
                normalized_text: normalized_text.clone(),
                language: language.clone(),
                revision_id: slots.term_revision_id.clone(),
            },
        };
        self.terms.push((key, term.clone()));
        Ok(term)
    }

    fn generation(
        &mut self,
        space: &PreparedSemanticSpaceV1,
    ) -> Result<PreparedGenerationV1, BootstrapStopV1> {
        if let Some(generation) = &self.generation {
            let mut reused = generation.clone();
            reused.create = false;
            return Ok(reused);
        }
        let generation = match require(
            &self.input.facts.generation,
            BootstrapPhaseV1::ActiveGeneration,
        )? {
            Some(value) => PreparedGenerationV1 {
                id: value.id.clone(),
                embedding_space_id: value.embedding_space_id.clone(),
                generation: value.generation,
                create: false,
                relative_database_path: format!("{}/generation-{:06}", space.id, value.generation),
            },
            None => {
                let generation = *require(
                    &self.input.facts.next_generation,
                    BootstrapPhaseV1::NextGeneration,
                )?;
                let id = self.input.identities.generation_id.clone().ok_or_else(|| {
                    stop(
                        BootstrapPhaseV1::GenerationInsert,
                        BootstrapStopReasonV1::InvalidBinding {},
                    )
                })?;
                PreparedGenerationV1 {
                    id,
                    embedding_space_id: space.id.clone(),
                    generation,
                    create: true,
                    relative_database_path: format!("{}/generation-{generation:06}", space.id),
                }
            }
        };
        self.generation = Some(generation.clone());
        Ok(generation)
    }
}
