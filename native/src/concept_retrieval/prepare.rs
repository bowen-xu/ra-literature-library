//! Finite preparation of the original retrieval stages over owned observations.
use super::*;
use research_workbench_native_sdk::concept_retrieval::{
    ConceptRetrievalDecisionV1 as Decision, ConceptRetrievalInputV1 as Input,
    ConceptRetrievalWireInputV1, ConceptRetrievalWireOutcomeV1, SourceObservationV1,
};
use research_workbench_native_sdk::paper_context_wire::{
    PaperContextCodecError, decode_payload, encode_payload,
};

pub fn prepare(
    input: ConceptRetrievalWireInputV1,
) -> Result<ConceptRetrievalWireOutcomeV1, PaperContextCodecError> {
    let decision = match decode_payload(&input.cbor_base64)? {
        Input::ValidateDraft { draft } => match validate_draft(&draft) {
            Ok(()) => Decision::Query {
                query: draft.query.trim().into(),
                fts_query: fts_query(&draft.query),
                query_sha256: crate::retrieval_trace::hash(draft.query.trim()),
            },
            Err(message) => Decision::Rejected {
                message: message.into(),
            },
        },
        Input::ValidatePaper { exists } => {
            if exists {
                Decision::PaperValidated
            } else {
                Decision::Rejected {
                    message: "当前论文不存在".into(),
                }
            }
        }
        Input::RankCandidates {
            lexical_ids,
            vector_hits,
        } => Decision::Candidates {
            candidates: rank_candidates(&lexical_hits(lexical_ids), &vector_hits),
        },
        Input::SelectSeeds { candidates } => Decision::Seeds {
            seeds: select_seeds(
                candidates
                    .into_iter()
                    .filter_map(|(rank, identity)| project_seed(&rank, identity))
                    .collect(),
            ),
        },
        Input::ProjectGraph { seed_ids, edges } => {
            let mut concept_ids = seed_ids.into_iter().collect::<BTreeSet<_>>();
            let edges = edges
                .into_iter()
                .map(|row| {
                    concept_ids.insert(row.subject_concept_id.clone());
                    concept_ids.insert(row.object_concept_id.clone());
                    ConceptRetrievalEdge {
                        relation_assertion_id: row.relation_assertion_id,
                        relation_revision: row.relation_revision,
                        subject_concept_id: row.subject_concept_id,
                        subject_label: row.subject_label,
                        predicate_kind: row.predicate_kind,
                        object_concept_id: row.object_concept_id,
                        object_label: row.object_label,
                        hop: 1,
                    }
                })
                .collect();
            Decision::Graph {
                edges,
                concept_ids: concept_ids.into_iter().collect(),
            }
        }
        Input::ProjectSources {
            paper_id,
            seeds,
            edges,
            definitions,
            usages,
        } => {
            let mut sources = definitions
                .into_iter()
                .map(|row| source(row, true))
                .collect::<Vec<_>>();
            sources.extend(usages.into_iter().map(|row| source(row, false)));
            let seed_ids = seeds
                .iter()
                .map(|seed| seed.concept_id.clone())
                .collect::<Vec<_>>();
            let sources = select_sources(&seed_ids, sources);
            let selected_source_count =
                i64::try_from(sources.iter().filter(|source| source.selected).count());
            match (
                selected_source_count,
                external_paper_count(&sources, paper_id.as_deref()),
            ) {
                (Err(_), _) => Decision::Rejected {
                    message: "来源数量超出范围".into(),
                },
                (_, Err(message)) => Decision::Rejected {
                    message: message.into(),
                },
                (Ok(selected_source_count), Ok(external_paper_count)) => {
                    let context_text = render_context(&seeds, &edges, &sources);
                    let context_sha256 = crate::retrieval_trace::hash(&context_text);
                    Decision::Trace {
                        sources,
                        selected_source_count,
                        external_paper_count,
                        context_text,
                        context_sha256,
                        config_json: configuration("used"),
                    }
                }
            }
        }
    };
    Ok(ConceptRetrievalWireOutcomeV1 {
        input: Box::new(input),
        decision_cbor_base64: encode_payload(&decision)?,
    })
}

fn source(row: SourceObservationV1, definition: bool) -> ConceptRetrievalSource {
    let (source_kind, context_text) = if definition {
        (
            "definition_claim",
            definition_context(row.text, &row.detail),
        )
    } else {
        ("term_usage", term_usage_context(&row.text, &row.detail))
    };
    ConceptRetrievalSource {
        anchor_id: row.anchor_id,
        concept_id: row.concept_id,
        concept_label: row.concept_label,
        paper_id: row.paper_id,
        paper_title: row.paper_title,
        source_kind: source_kind.into(),
        source_subject_id: row.source_subject_id,
        source_subject_revision: row.source_subject_revision,
        page_index: row.page_index,
        page_label: row.page_label,
        quote_exact: row.quote_exact,
        context_text,
        selected: false,
        omission_reason: None,
    }
}
