//! Canonical bibliography query preparation and projection over owned rows.
//! SQLite, guards, package acceptance and request transport remain outside.
pub use research_workbench_native_sdk::catalog::{
    CatalogAttachment, CatalogCreator, CatalogInput, CatalogItem, CatalogItemRows,
    CatalogMetadataSource, CatalogOutput, CatalogProjectionInput, CatalogProjectionOutcome,
    CatalogQueryPlan, CatalogRelatedRows, CatalogRequest, CatalogSelectionRows,
};
use research_workbench_native_sdk::data::{DataRows, DataValue};
pub mod bibliography;
mod context_metadata;
mod paper_context;

/// Only schema/indices and expected primitive types enter this diagnostic.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum CatalogDecodeError {
    #[error(
        "literature_catalog_input_invalid: {group} row {row} has {actual} columns; expected {expected}"
    )]
    Columns {
        group: &'static str,
        row: usize,
        expected: usize,
        actual: usize,
    },
    #[error(
        "literature_catalog_input_invalid: {group} row {row} column {column} requires {expected}"
    )]
    Cell {
        group: &'static str,
        row: usize,
        column: usize,
        expected: &'static str,
    },
    #[error("literature_catalog_input_invalid: main query_row result has multiple rows")]
    MultipleMainRows,
    #[error("literature_catalog_input_invalid: existing main row has no related read bundle")]
    MissingRelated,
    #[error("literature_catalog_input_invalid: Get requires one captured item result")]
    InvalidGetCount,
    #[error("literature_catalog_input_invalid: Get result has another item identity")]
    ItemIdentityMismatch,
    #[error(
        "literature_catalog_input_invalid: annotation preparation requires a valid original request"
    )]
    InvalidAnnotationPreparation,
    #[error(
        "literature_catalog_input_invalid: mutation preparation requires a canonical original mutation"
    )]
    InvalidMutationPreparation,
    #[error(
        "literature_catalog_input_invalid: duplicate undo preparation requires a valid original merge snapshot"
    )]
    InvalidDuplicateUndoPreparation,
    #[error(
        "literature_catalog_input_invalid: metadata preparation requires its prepared Core DOI"
    )]
    InvalidMetadataPreparation,
    #[error(
        "literature_catalog_input_invalid: BibTeX preparation could not encode its original inputs"
    )]
    InvalidImportJobsPreparation,
    #[error("literature_catalog_input_invalid: PDF header could not encode its original inputs")]
    InvalidPdfImportPreparation,
    #[error("literature_catalog_input_invalid: import-job captured row bundle is incomplete")]
    InvalidImportJobsProjection,
    #[error("literature_catalog_input_invalid: import-job header has another requested identity")]
    ImportJobIdentityMismatch,
    #[error(
        "literature_catalog_input_invalid: DOI candidate requires its original captured item result"
    )]
    InvalidDoiPreviewCapture,
    #[error(
        "literature_catalog_input_invalid: DOI publisher outcome contains a resolver-only failure"
    )]
    InvalidDoiPreviewPublisher,
    #[error("literature_catalog_input_invalid: structured candidate JSON is invalid")]
    InvalidStructuredValidationInput,
    #[error("literature_catalog_input_invalid: editable template JSON is invalid")]
    InvalidEditableTemplateInput,
    #[error("literature_catalog_input_invalid: paper context JSON is invalid")]
    InvalidPaperContextInput,
    #[error("literature_concept_retrieval_input_invalid")]
    InvalidConceptRetrievalInput,
    #[error("semantic index input is invalid")]
    InvalidSemanticIndexInput,
    #[error("literature_catalog_input_invalid: context metadata payload is invalid")]
    InvalidContextMetadataInput,
    #[error("literature_catalog_input_invalid: analysis history payload is invalid")]
    InvalidAnalysisHistoryInput,
    #[error("literature_catalog_input_invalid: analysis workflow payload is invalid")]
    InvalidAnalysisWorkflowInput,
    #[error("literature_catalog_input_invalid: paper confirmation payload is invalid")]
    InvalidPaperConfirmationInput,
}

impl CatalogDecodeError {
    pub fn code(&self) -> &'static str {
        "literature_catalog_input_invalid"
    }
}

pub fn plan(request: &CatalogRequest) -> CatalogQueryPlan {
    match request {
        CatalogRequest::Get { id } => CatalogQueryPlan::Get { id: id.clone() },
        CatalogRequest::List { query } if query.as_deref().unwrap_or("").trim().is_empty() => {
            CatalogQueryPlan::All
        }
        CatalogRequest::List { query } => {
            let query = query.as_deref().unwrap_or("");
            CatalogQueryPlan::Search {
                fts_query: format!(
                    "{{title creators}} : \"{}\"*",
                    query.trim().to_lowercase().replace('"', "\"\"")
                ),
                year: query.trim().parse::<i32>().ok(),
            }
        }
    }
}

/// The original FTS stream is retained verbatim, including its order and any
/// repeated ID. Only the later year stream appends IDs not already present.
pub fn select_ids(selection: &CatalogSelectionRows) -> Result<Vec<String>, CatalogDecodeError> {
    let mut ids = strings(&selection.primary, "primary")?;
    if let Some(year) = &selection.year {
        for id in strings(year, "year")? {
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    Ok(ids)
}

pub fn project(
    input: &CatalogProjectionInput,
) -> Result<CatalogProjectionOutcome, CatalogDecodeError> {
    if matches!(input.request, CatalogRequest::Get { .. }) && input.items.len() != 1 {
        return Err(CatalogDecodeError::InvalidGetCount);
    }
    let mut items = Vec::with_capacity(input.items.len());
    for captured in &input.items {
        let Some(item) = item(captured)? else {
            return Ok(CatalogProjectionOutcome::NotFound);
        };
        if let CatalogRequest::Get { id } = &input.request
            && item.id != *id
        {
            return Err(CatalogDecodeError::ItemIdentityMismatch);
        }
        items.push(item);
    }
    Ok(CatalogProjectionOutcome::Success { items })
}

pub fn dispatch(input: CatalogInput) -> Result<CatalogOutput, CatalogDecodeError> {
    Ok(match input {
        CatalogInput::PreparePaperConfirmation { input } => {
            use research_workbench_native_sdk::{
                paper_confirmation::wire::*, paper_context_wire::*,
            };
            let captured: PaperConfirmationInputV1 = decode_payload(&input.cbor_base64)
                .map_err(|_| CatalogDecodeError::InvalidPaperConfirmationInput)?;
            let result = crate::paper_confirmation::wire::prepare(captured);
            let result_cbor_base64 = encode_payload(&result)
                .map_err(|_| CatalogDecodeError::InvalidPaperConfirmationInput)?;
            CatalogOutput::PaperConfirmation {
                outcome: Box::new(PaperConfirmationWireOutcomeV1 {
                    input: *input,
                    result_cbor_base64,
                }),
            }
        }
        CatalogInput::ProjectReadingHistory { input } => CatalogOutput::ReadingHistory {
            decision: Box::new(crate::reading_history::project((*input).clone())),
            input,
        },
        CatalogInput::PrepareBrowserCapture { input } => CatalogOutput::BrowserCapture {
            preparation: Box::new(crate::browser_capture::prepare((*input).clone())),
            input,
        },
        CatalogInput::DecideAnalysisWorkflow { input } => CatalogOutput::AnalysisWorkflow {
            outcome: Box::new(crate::analysis_workflow::wire::project(*input)?),
        },
        CatalogInput::BibliographySearch { input } => CatalogOutput::BibliographySearch {
            decision: bibliography::search(&input)?,
        },
        CatalogInput::PlanBibliographyCandidates { input } => {
            CatalogOutput::BibliographyCandidates {
                plan: bibliography::plan(&input),
            }
        }
        CatalogInput::ProjectContextMetadata { input } => CatalogOutput::ContextMetadata {
            outcome: Box::new(context_metadata::project(input)?),
        },
        CatalogInput::ProjectAnalysisHistory { input } => {
            use research_workbench_native_sdk::{analysis_history::*, paper_context_wire::*};
            let captured: HistoryInputV1 = decode_payload(&input.cbor_base64)
                .map_err(|_| CatalogDecodeError::InvalidAnalysisHistoryInput)?;
            let result = crate::analysis_history::project(captured);
            let result_cbor_base64 = encode_payload(&result)
                .map_err(|_| CatalogDecodeError::InvalidAnalysisHistoryInput)?;
            CatalogOutput::AnalysisHistory {
                outcome: Box::new(HistoryWireOutcomeV1 {
                    input: *input,
                    result_cbor_base64,
                }),
            }
        }
        CatalogInput::PreparePaperContext { input } => CatalogOutput::PaperContext {
            outcome: Box::new(paper_context::prepare(input)?),
        },
        CatalogInput::PrepareSemanticIndex { input } => CatalogOutput::SemanticIndex {
            outcome: Box::new(
                crate::semantic_index::prepare(*input)
                    .map_err(|_| CatalogDecodeError::InvalidSemanticIndexInput)?,
            ),
        },
        CatalogInput::PrepareConceptRetrieval { input } => CatalogOutput::ConceptRetrieval {
            outcome: Box::new(
                crate::concept_retrieval::prepare(*input)
                    .map_err(|_| CatalogDecodeError::InvalidConceptRetrievalInput)?,
            ),
        },
        CatalogInput::DecidePaperRetrievalTrace { input } => CatalogOutput::PaperRetrievalTrace {
            outcome: Box::new(crate::paper_retrieval::decide(*input)),
        },
        CatalogInput::SelectUnreviewedFields { input } => {
            let selected_field_ids = crate::review_selection::unreviewed_fields(
                &input.pending_field_ids,
                &input.protected_field_ids,
                &input.reviewed_field_ids,
            );
            CatalogOutput::UnreviewedFields {
                selection: Box::new(
                    research_workbench_native_sdk::review_selection::UnreviewedSelectionV1 {
                        input,
                        selected_field_ids,
                    },
                ),
            }
        }
        CatalogInput::Plan { request } => CatalogOutput::Plan {
            plan: plan(&request),
        },
        CatalogInput::Select { selection } => CatalogOutput::Selection {
            ids: select_ids(&selection)?,
        },
        CatalogInput::Project { input } => CatalogOutput::Projection {
            outcome: project(&input)?,
        },
        CatalogInput::PrepareSave { input } => CatalogOutput::SavePlan {
            outcome: crate::catalog_save::prepare(*input),
        },
        CatalogInput::ReadNalQueries { row } => CatalogOutput::NalQueries {
            outcome: crate::nal_query::project(row),
        },
        CatalogInput::PrepareNalQuerySave { content } => {
            use research_workbench_native_sdk::nal_query::{PrepareOutcome, Rejection};
            CatalogOutput::NalQuerySavePlan {
                outcome: match content.decode_content() {
                    Ok(content) => crate::nal_query::prepare_save(&content),
                    Err(_) => PrepareOutcome::Rejected {
                        reason: Rejection::InvalidStructure,
                    },
                },
            }
        }
        CatalogInput::PrepareNalBootstrapProbes { source } => CatalogOutput::NalBootstrapProbes {
            outcome: Box::new(crate::nal_bootstrap::prepare_bootstrap_probes(&source)),
        },
        CatalogInput::PrepareNalBootstrap { input } => CatalogOutput::NalBootstrapPlan {
            outcome: Box::new(crate::nal_bootstrap::prepare_bootstrap(&input)),
        },
        CatalogInput::ValidateNalAnnotation { request } => CatalogOutput::NalAnnotationValidation {
            outcome: crate::nal_annotation_prepare::validate(&request),
        },
        CatalogInput::PrepareNalAnnotation { input } => CatalogOutput::NalAnnotationPreparation {
            outcome: Box::new(
                crate::nal_annotation_prepare::prepare(&input)
                    .map_err(|_| CatalogDecodeError::InvalidAnnotationPreparation)?,
            ),
        },
        CatalogInput::PrepareNalMutation { input } => CatalogOutput::NalMutationPreparation {
            outcome: Box::new(
                crate::nal_mutation::prepare(&input)
                    .map_err(|_| CatalogDecodeError::InvalidMutationPreparation)?,
            ),
        },
        CatalogInput::ProjectDuplicateCandidates { rows } => CatalogOutput::DuplicateCandidates {
            items: crate::duplicate_review::project_duplicate_candidates(&rows)?,
        },
        CatalogInput::ProjectMergeOperations { rows } => CatalogOutput::MergeOperations {
            items: crate::duplicate_review::project_merge_operations(&rows)?,
        },
        CatalogInput::PrepareDuplicateDecision { request } => {
            CatalogOutput::DuplicateDecisionPreparation {
                outcome: crate::duplicate_review::prepare_decision(request),
            }
        }
        CatalogInput::FinishDuplicateDecision { input } => {
            CatalogOutput::DuplicateDecisionCompletion {
                outcome: crate::duplicate_review::complete_decision(&input),
            }
        }
        CatalogInput::PrepareDuplicateUndo { input } => CatalogOutput::DuplicateUndoPreparation {
            outcome: Box::new(
                crate::duplicate_undo::prepare(&input)
                    .map_err(|_| CatalogDecodeError::InvalidDuplicateUndoPreparation)?,
            ),
        },
        CatalogInput::PrepareDuplicateMerge { input } => CatalogOutput::DuplicateMergePreparation {
            outcome: Box::new(crate::duplicate_merge_prepare::prepare(*input)),
        },
        CatalogInput::PrepareTrashCleanup {} => CatalogOutput::TrashCleanupPreparation {
            outcome: crate::trash_cleanup::prepare(),
        },
        CatalogInput::PrepareMetadata { input } => CatalogOutput::MetadataPreparation {
            outcome: crate::metadata::prepare(*input)
                .map_err(|_| CatalogDecodeError::InvalidMetadataPreparation)?,
        },
        CatalogInput::PrepareBibtex { input } => CatalogOutput::BibtexPreparation {
            outcome: crate::import_jobs::prepare(input)
                .map_err(|_| CatalogDecodeError::InvalidImportJobsPreparation)?,
        },
        CatalogInput::ProjectImportJobs { input } => CatalogOutput::ImportJobsProjection {
            outcome: crate::import_jobs::project(&input)?,
        },
        CatalogInput::DoiPreview { input } => CatalogOutput::DoiPreview {
            outcome: Box::new(crate::doi_metadata::preview(*input)?),
        },
        CatalogInput::ValidateEvidenceWrite { input } => CatalogOutput::EvidenceWriteDecision {
            decision: crate::evidence_write::decide(&input),
        },
        CatalogInput::DecideDerivedView { input } => CatalogOutput::DerivedViewDecision {
            decision: crate::derived_view::manual::decide(&input),
        },
        CatalogInput::ValidateEvidenceMatrix { input } => CatalogOutput::EvidenceMatrixValidation {
            decision: crate::evidence_matrix::decide(&input),
        },
        CatalogInput::PrepareReferenceRecord { input } => {
            CatalogOutput::ReferenceRecordPreparation {
                outcome: Box::new(crate::reference_records::prepare(input.draft)),
            }
        }
        CatalogInput::PrepareLiteratureAttachment { input } => {
            CatalogOutput::LiteratureAttachmentPreparation {
                outcome: Box::new(crate::attachments::prepare(*input)),
            }
        }
        CatalogInput::PreparePdfImportHeader { candidates } => {
            CatalogOutput::PdfImportHeaderPreparation {
                outcome: Box::new(
                    crate::pdf_import::prepare_header(candidates)
                        .map_err(|_| CatalogDecodeError::InvalidPdfImportPreparation)?,
                ),
            }
        }
        CatalogInput::DecodePdfImportCandidate { raw_input } => {
            CatalogOutput::PdfImportCandidateDecoded {
                outcome: Box::new(crate::pdf_import::decode_candidate(raw_input)),
            }
        }
        CatalogInput::PrepareReadingUnit { input } => CatalogOutput::ReadingUnitPreparation {
            outcome: Box::new(crate::reading_units::prepare(*input)),
        },
        CatalogInput::ValidateEditableTemplate { input } => {
            use research_workbench_native_sdk::editable_template::{
                EditableTemplateDecisionV1, EditableTemplateOutcomeV1,
            };
            let value = serde_json::from_str(&input.candidate_json)
                .map_err(|_| CatalogDecodeError::InvalidEditableTemplateInput)?;
            let decision = match crate::editable_template::validate_editable_template(value) {
                Ok(value) => EditableTemplateDecisionV1::Validated {
                    canonical_json: value.to_string(),
                },
                Err(message) => EditableTemplateDecisionV1::Rejected { message },
            };
            CatalogOutput::EditableTemplate {
                outcome: Box::new(EditableTemplateOutcomeV1 { input, decision }),
            }
        }
        CatalogInput::ValidateStructured { input } => {
            use research_workbench_native_sdk::structured_validation::StructuredValidationOutcomeV1;
            let value = serde_json::from_str(&input.candidate_json)
                .map_err(|_| CatalogDecodeError::InvalidStructuredValidationInput)?;
            let outcome = match crate::structured_validation::structured(
                input.target.resource_kind(),
                value,
                &input.evidence,
            ) {
                Ok(value) => StructuredValidationOutcomeV1::Validated {
                    input,
                    canonical_json: value.to_string(),
                },
                Err(error) => StructuredValidationOutcomeV1::Rejected { input, error },
            };
            CatalogOutput::StructuredValidation {
                outcome: Box::new(outcome),
            }
        }
        CatalogInput::PrepareResearchConcept { input } => {
            CatalogOutput::ResearchConceptPreparation {
                outcome: Box::new(crate::concepts::prepare(*input)),
            }
        }
        CatalogInput::PrepareLiteratureLifecycle { request } => {
            CatalogOutput::LiteratureLifecyclePreparation {
                outcome: crate::literature_lifecycle::prepare(request),
            }
        }
    })
}

pub(crate) struct Row<'a> {
    values: &'a [DataValue],
    group: &'static str,
    row: usize,
}

impl<'a> Row<'a> {
    pub(crate) fn new(
        values: &'a [DataValue],
        group: &'static str,
        row: usize,
        count: usize,
    ) -> Result<Self, CatalogDecodeError> {
        if values.len() != count {
            return Err(CatalogDecodeError::Columns {
                group,
                row,
                expected: count,
                actual: values.len(),
            });
        }
        Ok(Self { values, group, row })
    }

    pub(crate) fn invalid(&self, column: usize, expected: &'static str) -> CatalogDecodeError {
        CatalogDecodeError::Cell {
            group: self.group,
            row: self.row,
            column,
            expected,
        }
    }

    pub(crate) fn text(&self, index: usize) -> Result<String, CatalogDecodeError> {
        match &self.values[index] {
            DataValue::Text(value) => Ok(value.clone()),
            _ => Err(self.invalid(index, "String")),
        }
    }

    pub(crate) fn optional_text(&self, index: usize) -> Result<Option<String>, CatalogDecodeError> {
        match &self.values[index] {
            DataValue::Null => Ok(None),
            DataValue::Text(value) => Ok(Some(value.clone())),
            _ => Err(self.invalid(index, "Option<String>")),
        }
    }

    pub(crate) fn integer(&self, index: usize) -> Result<i64, CatalogDecodeError> {
        match &self.values[index] {
            DataValue::Integer(value) => Ok(*value),
            _ => Err(self.invalid(index, "Integer")),
        }
    }

    fn year(&self, index: usize) -> Result<Option<i32>, CatalogDecodeError> {
        if matches!(self.values[index], DataValue::Null) {
            return Ok(None);
        }
        i32::try_from(self.integer(index)?)
            .map(Some)
            .map_err(|_| self.invalid(index, "Option<i32>"))
    }
}

fn strings(rows: &DataRows, group: &'static str) -> Result<Vec<String>, CatalogDecodeError> {
    rows.rows
        .iter()
        .enumerate()
        .map(|(index, values)| Row::new(values, group, index, 1)?.text(0))
        .collect()
}

fn item(captured: &CatalogItemRows) -> Result<Option<CatalogItem>, CatalogDecodeError> {
    if captured.main.rows.is_empty() {
        return Ok(None);
    }
    if captured.main.rows.len() != 1 {
        return Err(CatalogDecodeError::MultipleMainRows);
    }
    let row = Row::new(&captured.main.rows[0], "main", 0, 21)?;
    let mut value = CatalogItem {
        id: row.text(0)?,
        item_type: row.text(1)?,
        title: row.text(2)?,
        abstract_text: row.text(3)?,
        issued_year: row.year(4)?,
        container_title: row.text(5)?,
        conference_name: row.text(6)?,
        proceedings_title: row.text(7)?,
        place: row.text(8)?,
        volume: row.text(9)?,
        issue: row.text(10)?,
        pages: row.text(11)?,
        doi: row.text(12)?,
        url: row.text(13)?,
        language: row.text(14)?,
        bibtex_key: row.text(15)?,
        raw_bibtex: row.optional_text(16)?,
        reading_status: row.text(17)?,
        creators: Vec::new(),
        tags: Vec::new(),
        attachments: Vec::new(),
        project_ids: Vec::new(),
        metadata_sources: Vec::new(),
        created_at: row.text(18)?,
        updated_at: row.text(19)?,
        trashed_at: row.optional_text(20)?,
    };
    let related = captured
        .related
        .as_ref()
        .ok_or(CatalogDecodeError::MissingRelated)?;
    value.creators = related
        .creators
        .rows
        .iter()
        .enumerate()
        .map(|(index, values)| {
            let row = Row::new(values, "creators", index, 4)?;
            Ok(CatalogCreator {
                family_name: row.text(0)?,
                given_name: row.text(1)?,
                literal_name: row.text(2)?,
                role: row.text(3)?,
            })
        })
        .collect::<Result<_, CatalogDecodeError>>()?;
    value.tags = strings(&related.tags, "tags")?;
    value.attachments = related
        .attachments
        .rows
        .iter()
        .enumerate()
        .map(|(index, values)| {
            let row = Row::new(values, "attachments", index, 5)?;
            Ok(CatalogAttachment {
                id: row.text(0)?,
                display_name: row.text(1)?,
                mime_type: row.text(2)?,
                byte_size: u64::try_from(row.integer(3)?).map_err(|_| row.invalid(3, "u64"))?,
                content_sha256: row.text(4)?,
            })
        })
        .collect::<Result<_, CatalogDecodeError>>()?;
    value.project_ids = strings(&related.project_ids, "projectIds")?;
    value.metadata_sources = related
        .metadata_sources
        .rows
        .iter()
        .enumerate()
        .map(|(index, values)| {
            let row = Row::new(values, "metadataSources", index, 3)?;
            Ok(CatalogMetadataSource {
                field_name: row.text(0)?,
                source_kind: row.text(1)?,
                confirmed_by_user: row.integer(2)? != 0,
            })
        })
        .collect::<Result<_, CatalogDecodeError>>()?;
    Ok(Some(value))
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod typed_query_tests;

#[cfg(test)]
#[path = "catalog/metadata_tests.rs"]
mod metadata_tests;
