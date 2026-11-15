use super::*;
use research_workbench_native_sdk::catalog::{CatalogInput, CatalogOutput};
use serde_json::json;

fn candidate(path: &str) -> PdfImportCandidate {
    PdfImportCandidate {
        path: path.to_owned(),
        draft: serde_json::from_value(json!({
            "id":"original-id","itemType":"document","title":"  Original title  ",
            "abstractText":"摘要","issuedYear":-1,"doi":" raw DOI ",
            "rawBibtex":"raw\u{0}bibtex","creators":[{"familyName":"A","givenName":"B",
                "literalName":"Literal","role":" custom "}],
            "tags":[" x "," x "],"sourceKind":"original"
        }))
        .unwrap(),
    }
}

#[test]
fn empty_candidates_are_rejected_without_inventing_path_or_draft_validation() {
    assert_eq!(
        validate_candidates(&[]),
        Err(PdfImportRejectionV1::NoFilesSelected)
    );
    assert_eq!(
        prepare_header(vec![]).unwrap(),
        PdfImportHeaderPreparationV1::Rejected {
            candidates: vec![],
            reason: PdfImportRejectionV1::NoFilesSelected,
        }
    );
    let mut input = candidate("");
    input.draft.title.clear();
    input.draft.item_type = "unsupported".to_owned();
    assert!(validate_candidates(&[input.clone()]).is_ok());
    assert!(matches!(
        prepare_header(vec![input]).unwrap(),
        PdfImportHeaderPreparationV1::Ready { .. }
    ));
}

#[test]
fn header_retains_order_duplicates_original_identity_and_exact_audit_serializer() {
    let inputs = vec![
        candidate("relative/论文.pdf"),
        candidate("odd\u{0} name.pdf"),
        candidate("relative/论文.pdf"),
    ];
    let PdfImportHeaderPreparationV1::Ready { entries } = prepare_header(inputs.clone()).unwrap()
    else {
        panic!("ready");
    };
    assert_eq!(entries.len(), 3);
    for (entry, original) in entries.iter().zip(&inputs) {
        assert_eq!(&entry.candidate, original);
        assert_eq!(entry.candidate.draft.id.as_deref(), Some("original-id"));
        assert_eq!(entry.input_label, original.path);
        assert_eq!(entry.raw_input, serde_json::to_string(original).unwrap());
        assert_eq!(
            serde_json::from_str::<PdfImportCandidate>(&entry.raw_input).unwrap(),
            *original
        );
    }
    assert_eq!(entries[0], entries[2]);
}

#[test]
fn valid_decode_keeps_raw_input_and_all_original_fields_except_item_identity() {
    let input = candidate("relative/论文.pdf");
    let mut value = serde_json::to_value(&input).unwrap();
    value["unknown"] = json!(true);
    value["draft"]["unknown"] = json!("future");
    let raw = format!("  {}\n", serde_json::to_string_pretty(&value).unwrap());
    let actual = decode_candidate(raw.clone());
    let mut expected = input;
    expected.draft.id = None;
    assert_eq!(actual.raw_input, raw);
    assert_eq!(actual.candidate, expected);
}

#[test]
fn malformed_or_legacy_input_uses_original_path_and_filename_fallback() {
    for (raw, title) in [
        ("/tmp/Paper.final.pdf", "Paper.final"),
        ("null", "null"),
        ("{bad.json", "{bad"),
        ("/", "Untitled PDF"),
        ("", "Untitled PDF"),
        ("日本語.pdf", "日本語"),
    ] {
        let output = decode_candidate(raw.to_owned());
        assert_eq!(output.raw_input, raw);
        assert_eq!(output.candidate.path, raw);
        assert_eq!(output.candidate.draft.title, title);
        assert_eq!(output.candidate.draft.id, None);
        assert_eq!(
            output.candidate.draft.source_kind.as_deref(),
            Some("pdf_filename")
        );
    }
    let raw = r#"{"path":"valid.pdf","draft":{"title":"Missing required type"}}"#;
    let output = decode_candidate(raw.to_owned());
    assert_eq!(output.candidate.path, raw);
    assert_eq!(
        output.candidate.draft.source_kind.as_deref(),
        Some("pdf_filename")
    );
}

#[test]
fn filename_default_matches_the_original_complete_draft_json() {
    assert_eq!(
        serde_json::to_string(&default_pdf_draft(Path::new("/tmp/论文.pdf"))).unwrap(),
        concat!(
            "{\"id\":null,\"itemType\":\"document\",\"title\":\"论文\",\"abstractText\":\"\",",
            "\"issuedYear\":null,\"containerTitle\":\"\",\"conferenceName\":\"\",\"proceedingsTitle\":\"\",",
            "\"place\":\"\",\"volume\":\"\",\"issue\":\"\",\"pages\":\"\",\"doi\":\"\",\"url\":\"\",",
            "\"language\":\"\",\"bibtexKey\":\"\",\"rawBibtex\":null,\"creators\":[],\"tags\":[],",
            "\"sourceKind\":\"pdf_filename\"}"
        )
    );
}

#[cfg(unix)]
#[test]
fn non_utf8_path_uses_original_untitled_fallback_without_file_io() {
    use std::{ffi::OsString, os::unix::ffi::OsStringExt};
    let path = PathBuf::from(OsString::from_vec(b"/tmp/\xff.pdf".to_vec()));
    assert_eq!(default_pdf_draft(&path).title, "Untitled PDF");
}

#[test]
fn catalog_header_then_decode_preserves_audit_and_only_decode_clears_identity() {
    let input = candidate("source.pdf");
    let header = crate::catalog::dispatch(CatalogInput::PreparePdfImportHeader {
        candidates: vec![input.clone()],
    })
    .unwrap();
    let CatalogOutput::PdfImportHeaderPreparation { outcome } = header else {
        panic!("header output");
    };
    let PdfImportHeaderPreparationV1::Ready { entries } = *outcome else {
        panic!("ready");
    };
    assert_eq!(entries[0].candidate, input);
    let decoded = crate::catalog::dispatch(CatalogInput::DecodePdfImportCandidate {
        raw_input: entries[0].raw_input.clone(),
    })
    .unwrap();
    let CatalogOutput::PdfImportCandidateDecoded { outcome } = decoded else {
        panic!("decode output");
    };
    assert_eq!(outcome.raw_input, entries[0].raw_input);
    assert_eq!(outcome.candidate.draft.id, None);
    assert_eq!(outcome.candidate.draft.title, input.draft.title);
    assert_eq!(outcome.candidate.path, input.path);
}
