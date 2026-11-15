use super::*;
use research_workbench_native_sdk::{
    analysis_workflow::{docling::*, wire::*},
    candidate_contracts::EvidenceQuote,
    generation::provider::{ProviderInput, StoredImageAsset},
    paper_context::PaperAiReadingContextItem,
    paper_context_wire::{decode_payload, encode_payload},
};
use std::collections::BTreeMap;

fn item() -> PaperAiReadingContextItem {
    PaperAiReadingContextItem {
        id: "P1-F1".into(),
        paper_id: "paper".into(),
        attachment_id: "attachment".into(),
        content_sha256: "a".repeat(64),
        parse_run_id: "parse".into(),
        raw_ref: "#/pictures/0".into(),
        kind: "picture".into(),
        label: Some("Figure Ω".into()),
        page_index: Some(3),
        regions: Vec::new(),
        charspan: None,
        source_text_hash: None,
        text: None,
        table_json: None,
    }
}

fn prompt() -> DoclingPromptInputV1 {
    DoclingPromptInputV1 {
        items: vec![item()],
        assets: BTreeMap::from([(
            "P1-F1".into(),
            StoredImageAsset {
                context_item_id: "P1-F1".into(),
                content_sha256: "b".repeat(64),
                data_url: "data:image/png;base64,AAAA".into(),
            },
        )]),
        profile: Some(
            serde_json::from_value(serde_json::json!({
                "paperId":"paper", "selectionRevision":1,
                "profileRefs":[{"profileId":"generic_overview","profileVersion":1}],
                "fieldKinds":["research_question"]
            }))
            .unwrap(),
        ),
        evidence: vec![EvidenceQuote {
            citation_key: "P1-F1".into(),
            quote_exact: "Figure Ω".into(),
        }],
    }
}

#[test]
fn docling_row_wire_preserves_original_projection_skip_and_identity() {
    let mut input = DoclingRowInputV1 {
        run_id: "run".into(),
        item: item(),
    };
    let request = WorkflowInputV1::DoclingRow {
        input_cbor_base64: encode_payload(&input).unwrap(),
    };
    let result = wire::dispatch(request.clone()).unwrap();
    assert!(request.matches_decision(&result));
    let WorkflowDecisionV1::DoclingRow {
        decision: DoclingRowDecisionV1::Ready { mut row },
    } = result
    else {
        panic!("original row");
    };
    assert_eq!(
        row,
        docling::evidence_row("run", &input.item).unwrap().unwrap()
    );
    assert_eq!(row.page_index, 3);
    assert_eq!(row.page_label, "4");
    row.anchor_id = "docling:outside:P1-F1".into();
    assert!(!input.matches_decision(&DoclingRowDecisionV1::Ready { row }));
    assert!(!input.matches_decision(&DoclingRowDecisionV1::Skipped {}));
    input.item.page_index = None;
    let request = WorkflowInputV1::DoclingRow {
        input_cbor_base64: encode_payload(&input).unwrap(),
    };
    let result = wire::dispatch(request.clone()).unwrap();
    assert!(request.matches_decision(&result));
    assert_eq!(
        result,
        WorkflowDecisionV1::DoclingRow {
            decision: DoclingRowDecisionV1::Skipped {}
        }
    );
}

#[test]
fn docling_prompt_wire_preserves_original_input_and_core_image_binding() {
    let input = prompt();
    let request = WorkflowInputV1::DoclingPrompt {
        input_cbor_base64: encode_payload(&input).unwrap(),
    };
    let result = wire::dispatch(request.clone()).unwrap();
    assert!(request.matches_decision(&result));
    let WorkflowDecisionV1::DoclingPrompt { result_cbor_base64 } = result else {
        panic!("original prompt");
    };
    let actual: Result<ProviderInput, AnalysisWorkflowError> =
        decode_payload(&result_cbor_base64).unwrap();
    assert_eq!(actual, docling_prompt::build_overview_input(&input));
    let mut changed = actual.unwrap();
    changed.messages[0].images[0].data_url = "data:image/png;base64,BBBB".into();
    assert!(
        !request.matches_decision(&WorkflowDecisionV1::DoclingPrompt {
            result_cbor_base64: encode_payload(&Ok::<_, AnalysisWorkflowError>(changed)).unwrap()
        })
    );
    let mut missing = input.clone();
    missing.profile = None;
    let request = WorkflowInputV1::DoclingPrompt {
        input_cbor_base64: encode_payload(&missing).unwrap(),
    };
    let result = wire::dispatch(request.clone()).unwrap();
    assert!(request.matches_decision(&result));
    let WorkflowDecisionV1::DoclingPrompt { result_cbor_base64 } = result else {
        panic!("original rejection");
    };
    let actual: Result<ProviderInput, AnalysisWorkflowError> =
        decode_payload(&result_cbor_base64).unwrap();
    assert_eq!(
        actual.unwrap_err().to_string(),
        "结构化阅读 AI 提取缺少已确认阅读框架"
    );
}

#[test]
fn docling_wire_rejects_invalid_nested_inputs_and_result_payloads() {
    for request in [
        WorkflowInputV1::DoclingRow {
            input_cbor_base64: "invalid".into(),
        },
        WorkflowInputV1::DoclingPrompt {
            input_cbor_base64: "invalid".into(),
        },
    ] {
        assert!(wire::dispatch(request).is_err());
    }
    let request = WorkflowInputV1::DoclingPrompt {
        input_cbor_base64: encode_payload(&prompt()).unwrap(),
    };
    assert!(
        !request.matches_decision(&WorkflowDecisionV1::DoclingPrompt {
            result_cbor_base64: "invalid".into()
        })
    );
    assert!(!request.matches_decision(&WorkflowDecisionV1::DoclingRow {
        decision: DoclingRowDecisionV1::Skipped {}
    }));
}

#[test]
fn legacy_docling_validations_keep_original_text_limits_and_failure_order() {
    let rejected = |input: WorkflowInputV1| {
        let decision = wire::dispatch(input.clone()).unwrap();
        assert!(input.matches_decision(&decision));
        let WorkflowDecisionV1::Validated { rejection } = decision else {
            panic!("validation response");
        };
        rejection.map(|error| error.to_string())
    };
    assert_eq!(
        rejected(WorkflowInputV1::ValidateDoclingStart {
            revision: 0,
            has_template: false
        })
        .unwrap(),
        "阅读框架尚未确认，无法启动 AI 提取"
    );
    assert!(
        rejected(WorkflowInputV1::ValidateDoclingStart {
            revision: 0,
            has_template: true
        })
        .is_none()
    );
    assert_eq!(
        rejected(WorkflowInputV1::ValidateDoclingSources {
            statuses: vec!["missing".into()],
            picture_count: 129
        })
        .unwrap(),
        "部分 PDF 尚未完成 Docling 结构化解析"
    );
    assert_eq!(
        rejected(WorkflowInputV1::ValidateDoclingSources {
            statuses: vec!["available".into()],
            picture_count: 129
        })
        .unwrap(),
        "图片结构块数量为 129，超过本轮上限 128；请等待分批发送能力接入"
    );
    assert!(
        rejected(WorkflowInputV1::ValidateDoclingSources {
            statuses: vec!["available".into()],
            picture_count: 128
        })
        .is_none()
    );
    assert_eq!(
        rejected(WorkflowInputV1::ValidateDoclingImages {
            requested_ids: vec!["P1-F1".into()],
            available_ids: vec![]
        })
        .unwrap(),
        "图片截图数量与 Docling picture 结构块不一致"
    );
}
