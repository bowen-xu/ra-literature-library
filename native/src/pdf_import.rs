//! Canonical filename fallback, original input audit and PDF draft identity rules.
use std::path::{Path, PathBuf};

use research_workbench_native_sdk::{
    catalog_save::CatalogDraft,
    pdf_import::{
        DecodedPdfImportCandidateV1, PdfImportCandidate, PdfImportHeaderPreparationV1,
        PdfImportRejectionV1, PreparedPdfImportEntryV1,
    },
};

pub fn validate_candidates(candidates: &[PdfImportCandidate]) -> Result<(), PdfImportRejectionV1> {
    if candidates.is_empty() {
        return Err(PdfImportRejectionV1::NoFilesSelected);
    }
    Ok(())
}

/// Static callers retain this serialization at each original header-TX position.
pub fn prepare_entry(
    candidate: &PdfImportCandidate,
) -> Result<PreparedPdfImportEntryV1, serde_json::Error> {
    let path = PathBuf::from(&candidate.path);
    let raw_input = serde_json::to_string(candidate)?;
    Ok(PreparedPdfImportEntryV1 {
        candidate: candidate.clone(),
        input_label: path.display().to_string(),
        raw_input,
    })
}

pub fn prepare_header(
    candidates: Vec<PdfImportCandidate>,
) -> Result<PdfImportHeaderPreparationV1, serde_json::Error> {
    if let Err(reason) = validate_candidates(&candidates) {
        return Ok(PdfImportHeaderPreparationV1::Rejected { candidates, reason });
    }
    Ok(PdfImportHeaderPreparationV1::Ready {
        entries: candidates
            .iter()
            .map(prepare_entry)
            .collect::<Result<_, _>>()?,
    })
}

pub fn prepare_import_draft(mut draft: CatalogDraft) -> CatalogDraft {
    draft.id = None;
    draft
}

pub fn decode_candidate(raw_input: String) -> DecodedPdfImportCandidateV1 {
    let mut candidate =
        serde_json::from_str::<PdfImportCandidate>(&raw_input).unwrap_or_else(|_| {
            let path = PathBuf::from(&raw_input);
            PdfImportCandidate {
                draft: default_pdf_draft(&path),
                path: raw_input.clone(),
            }
        });
    candidate.draft = prepare_import_draft(candidate.draft);
    DecodedPdfImportCandidateV1 {
        raw_input,
        candidate,
    }
}

pub fn default_pdf_draft(path: &Path) -> CatalogDraft {
    CatalogDraft {
        id: None,
        item_type: "document".to_owned(),
        title: path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled PDF")
            .to_owned(),
        abstract_text: String::new(),
        issued_year: None,
        container_title: String::new(),
        conference_name: String::new(),
        proceedings_title: String::new(),
        place: String::new(),
        volume: String::new(),
        issue: String::new(),
        pages: String::new(),
        doi: String::new(),
        url: String::new(),
        language: String::new(),
        bibtex_key: String::new(),
        raw_bibtex: None,
        creators: Vec::new(),
        tags: Vec::new(),
        source_kind: Some("pdf_filename".to_owned()),
    }
}

#[cfg(test)]
mod tests;
