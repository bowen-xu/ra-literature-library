use research_literature_library_native::analysis_workflow::docling_prompt::build_overview_input;
use research_workbench_native_sdk::generation::provider::StoredImageAsset;
use research_workbench_native_sdk::{
    analysis_workflow::docling::DoclingPromptInputV1,
    candidate_contracts::{AiOverviewProfileContext, AiReadingProfileRef, EvidenceQuote},
    paper_context::{PaperAiReadingContextItem, PaperAiReadingRect, PaperAiReadingRegion},
};
use serde_json::json;
use std::collections::BTreeMap;

#[test]
fn overview_input_uses_docling_context_ids_as_evidence_ids() {
    let profile = Some(AiOverviewProfileContext {
        paper_template: None,
        paper_id: "paper".into(),
        selection_revision: 1,
        profile_refs: vec![AiReadingProfileRef {
            profile_id: "generic_overview".into(),
            profile_version: 1,
        }],
        field_kinds: vec!["research_question".into(), "approach".into()],
    });
    let region = PaperAiReadingRegion {
        page_index: 0,
        rect: PaperAiReadingRect {
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.4,
        },
    };
    let items = vec![
        PaperAiReadingContextItem {
            id: "P1-T1".to_owned(),
            paper_id: "paper".to_owned(),
            attachment_id: "att".to_owned(),
            content_sha256: "a".repeat(64),
            parse_run_id: "parse".to_owned(),
            raw_ref: "#/texts/0".to_owned(),
            kind: "text".to_owned(),
            label: Some("paragraph".to_owned()),
            page_index: Some(0),
            regions: vec![region.clone()],
            charspan: Some([0, 10]),
            source_text_hash: Some("b".repeat(64)),
            text: Some("The paper asks a question.".to_owned()),
            table_json: None,
        },
        PaperAiReadingContextItem {
            id: "P1-T2".to_owned(),
            paper_id: "paper".to_owned(),
            attachment_id: "att".to_owned(),
            content_sha256: "a".repeat(64),
            parse_run_id: "parse".to_owned(),
            raw_ref: "#/texts/1".to_owned(),
            kind: "text".to_owned(),
            label: Some("paragraph".to_owned()),
            page_index: Some(0),
            regions: vec![region.clone()],
            charspan: Some([11, 20]),
            source_text_hash: Some("e".repeat(64)),
            text: Some("This unbundled context must not be sent.".to_owned()),
            table_json: None,
        },
        PaperAiReadingContextItem {
            id: "P1-F1".to_owned(),
            paper_id: "paper".to_owned(),
            attachment_id: "att".to_owned(),
            content_sha256: "a".repeat(64),
            parse_run_id: "parse".to_owned(),
            raw_ref: "#/pictures/0".to_owned(),
            kind: "picture".to_owned(),
            label: None,
            page_index: Some(0),
            regions: vec![region],
            charspan: None,
            source_text_hash: None,
            text: None,
            table_json: None,
        },
        PaperAiReadingContextItem {
            id: "P1-TABLE1".to_owned(),
            paper_id: "paper".to_owned(),
            attachment_id: "att".to_owned(),
            content_sha256: "a".repeat(64),
            parse_run_id: "parse".to_owned(),
            raw_ref: "#/tables/0".to_owned(),
            kind: "table".to_owned(),
            label: None,
            page_index: Some(0),
            regions: Vec::new(),
            charspan: None,
            source_text_hash: Some("c".repeat(64)),
            text: None,
            table_json: Some(json!({"grid":[["A"]]})),
        },
    ];
    let evidence = ["P1-T1", "P1-F1", "P1-TABLE1"]
        .into_iter()
        .map(|key| EvidenceQuote {
            citation_key: key.into(),
            quote_exact: "quote".into(),
        })
        .collect();
    let mut assets = BTreeMap::new();
    assets.insert(
        "P1-F1".to_owned(),
        StoredImageAsset {
            context_item_id: "P1-F1".to_owned(),
            content_sha256: "d".repeat(64),
            data_url: "data:image/png;base64,AAAA".to_owned(),
        },
    );

    let input = build_overview_input(&DoclingPromptInputV1 {
        items,
        assets,
        profile,
        evidence,
    })
    .expect("input");

    assert!(
        input
            .audit_text
            .contains("\"allowedEvidenceItemIds\":[\"P1-T1\",\"P1-F1\",\"P1-TABLE1\"]")
    );
    assert!(input.audit_text.contains("\"outputJsonSkeleton\""));
    assert!(!input.audit_text.contains("filled | partial | not_found"));
    assert!(
        input
            .audit_text
            .contains("\"kind\":\"paper_overview_unit_v1\"")
    );
    assert!(
        input
            .audit_text
            .contains("The top-level kind must be exactly paper_overview_unit_v1")
    );
    assert!(input.audit_text.contains("evidenceItemIds"));
    assert!(input.audit_text.contains("[P1-TABLE1] kind=table"));
    assert!(!input.audit_text.contains("[P1-T2]"));
    assert_eq!(input.messages.len(), 1);
    assert_eq!(input.messages[0].images.len(), 1);
    assert_eq!(input.messages[0].images[0].context_item_id, "P1-F1");
    assert_eq!(
        input.messages[0].images[0].data_url,
        "data:image/png;base64,AAAA"
    );
}
