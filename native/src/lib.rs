//! Canonical literature business decisions, independent of Core integration.
#![forbid(unsafe_code)]

pub mod analysis_attempt;
pub mod analysis_history;
pub mod analysis_workflow;
pub mod attachments;
pub mod candidate_review;
pub mod candidate_revision;
pub mod catalog;
pub mod catalog_save;
pub mod concepts;
pub mod context_metadata;
pub mod derived_view;
pub mod doi_metadata;
pub mod duplicate_merge;
pub mod duplicate_merge_prepare;
pub mod duplicate_review;
pub mod duplicate_undo;
pub mod editable_template;
pub mod evidence_matrix;
pub mod evidence_read;
pub mod evidence_write;
pub mod import_jobs;
pub mod knowledge_promotion;
pub mod literature_lifecycle;
pub mod metadata;
pub mod nal_annotation;
pub mod nal_annotation_prepare;
pub mod nal_bootstrap;
pub mod nal_mutation;
pub mod nal_query;
pub mod paper_confirmation;
pub mod paper_context;
pub mod paper_context_prepare;
pub mod paper_context_preview;
pub mod paper_context_snapshot;
pub mod paper_retrieval;
pub mod pdf_import;
pub mod reading_history;

pub mod reading_units;
pub mod reference_records;
pub mod retrieval_trace;
pub mod review_selection;
pub mod structured_validation;
pub mod trash_cleanup;

pub mod concept_retrieval;

pub mod semantic_index;

pub mod concept_algorithms;

pub mod research_export;

pub mod browser_capture;
