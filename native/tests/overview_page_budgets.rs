use research_literature_library_native::analysis_workflow::task_preview::pages;
use research_workbench_native_sdk::generation::evidence::{AiEvidencePreview, AttachmentEvidence};

const ATTACHMENT_HASH: &str = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

fn preview_overview_evidence() -> Vec<AiEvidencePreview> {
    // Same frozen observations as the original Core database fixture.
    let attachment = AttachmentEvidence {
        paper_id: "paper-long".into(),
        paper_title: "Synthetic long paper".into(),
        content_sha256: ATTACHMENT_HASH.into(),
        index_state: "completed".into(),
    };
    let page_texts = (0..30)
        .map(|page_index| {
            (
                page_index,
                format!(
                    "Page {page_index}. Methods. Results. Conclusion. {}",
                    "bounded synthetic evidence ".repeat(250),
                ),
            )
        })
        .collect::<Vec<_>>();
    pages::validate_attachment(Some(&attachment)).unwrap();
    let selected = pages::select_pages(&attachment, "attachment-long", &page_texts).unwrap();
    pages::preview_sources(&selected)
}

#[test]
fn long_pdf_preview_is_bounded_and_identity_stable() {
    let first = preview_overview_evidence();
    let second = preview_overview_evidence();

    assert_eq!(first.len(), 10, "a long PDF must freeze at most ten pages");
    assert_eq!(
        first.iter().map(|item| item.page_index).collect::<Vec<_>>(),
        (0..10).collect::<Vec<_>>(),
        "equal-scoring pages must remain deterministic after the first-page preference",
    );
    assert!(first.iter().all(|item| {
        item.quote_exact.chars().count() <= 1_200
            && item.context_text.chars().count() <= 1_520
            && item.content_sha256 == ATTACHMENT_HASH
    }));
    assert_eq!(
        first
            .iter()
            .map(|item| (&item.citation_key, &item.anchor_id))
            .collect::<Vec<_>>(),
        second
            .iter()
            .map(|item| (&item.citation_key, &item.anchor_id))
            .collect::<Vec<_>>(),
        "repeating preview must preserve citation and source-anchor identities",
    );
}
