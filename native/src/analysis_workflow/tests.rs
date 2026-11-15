use super::*;
use research_agent_core::submission::{ContextSourceKind, ContextText};
use research_workbench_native_sdk::{
    analysis_workflow::wire::*,
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    paper_context_wire::{decode_payload, encode_payload},
};
use serde_json::json;
use sha2::Digest;

fn workflow() -> PaperAnalysisWorkflow {
    serde_json::from_value(json!({
        "id":"workflow", "paperId":"paper", "contextSnapshotId":"snapshot",
        "status":"needs_review", "providerId":"provider", "modelId":"model",
        "promptSetVersion":"paper-analysis-tools-v3", "revision":1,
        "createdAt":"old", "updatedAt":"now", "turns":[]
    }))
    .unwrap()
}

#[test]
fn preparation_keeps_original_error_order_and_image_boundary() {
    assert_eq!(
        validate_start(0, false).unwrap_err().to_string(),
        "阅读框架尚未确认，无法启动论文分析"
    );
    assert!(validate_start(-1, true).is_ok());
    assert!(validate_start(1, false).is_ok());
    assert_eq!(
        validate_sources(&["missing"], 129).unwrap_err().to_string(),
        "部分 PDF 尚未完成 Docling 结构化解析"
    );
    assert!(validate_sources(&["available"], 128).is_ok());
    assert_eq!(
        validate_sources(&["available"], 129)
            .unwrap_err()
            .to_string(),
        "图片结构块数量为 129，超过本轮上限 128"
    );
    assert!(validate_sources(&[], 0).is_ok());
}

#[test]
fn reuse_preserves_empty_preparation_failure_and_historical_two_stage_cases() {
    let mut value = workflow();
    assert!(validate_reuse(false, None, Some(&value)).is_err());
    assert!(validate_reuse(true, None, Some(&value)).is_ok());
    for status in ["failed", "canceled", "preparing"] {
        value.status = status.into();
        assert!(validate_reuse(false, None, Some(&value)).is_ok());
    }
    value.status = "needs_review".into();
    assert!(validate_reuse(false, Some("new-template"), Some(&value)).is_ok());
    value.turns = serde_json::from_value(json!([{
        "id":"turn","workflowId":"workflow","ordinal":1,"kind":"paper_concept_map",
        "status":"failed","createdAt":"old","attempts":[]
    }]))
    .unwrap();
    assert!(validate_reuse(false, None, Some(&value)).is_ok());
    value.turns[0].kind = "paper_overview".into();
    value.turns[0].attempts = serde_json::from_value(json!([{
        "id":"attempt","turnId":"turn","attempt":1,"status":"succeeded",
        "normalizedMessages":[{"kind":"system_context","content":"template-json"}],
        "providerId":"provider","modelId":"model","createdAt":"old"
    }]))
    .unwrap();
    assert!(validate_reuse(false, Some("template-json"), Some(&value)).is_err());
    assert!(validate_reuse(false, Some("different"), Some(&value)).is_ok());
    value.status = "preparing".into();
    assert!(validate_reuse(false, Some("template-json"), Some(&value)).is_err());
}

#[test]
fn messages_and_all_original_terminal_branches_are_preserved() {
    let messages = overview_messages(&workflow());
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].kind, PaperAnalysisMessageKind::SystemContext);
    assert_eq!(
        messages[0].content,
        "Use immutable paper context snapshot snapshot for paper paper."
    );
    assert_eq!(messages[1].kind, PaperAnalysisMessageKind::TaskPrompt);
    assert_eq!(
        messages[1].content,
        "Extract only the structured paper overview using the confirmed reading profile and source evidence IDs. Finish after this structured-reading result."
    );
    for kind in ["paper_overview", "paper_concept_map", "historical-kind"] {
        let overview = kind == "paper_overview";
        assert_eq!(
            running_workflow_status(kind),
            if overview {
                "overview_running"
            } else {
                "concepts_running"
            }
        );
        assert_eq!(completion_status(kind, false), "needs_review");
        assert_eq!(
            completion_status(kind, true),
            if overview {
                "overview_ready"
            } else {
                "needs_review"
            }
        );
        for code in ["canceled", "interrupted", "provider_failed"] {
            let value = failure_statuses(kind, code);
            let status = if code == "canceled" {
                "canceled"
            } else if code == "interrupted" {
                "interrupted"
            } else {
                "failed"
            };
            assert_eq!(value.attempt, status);
            assert_eq!(value.turn, status);
            assert_eq!(
                value.workflow,
                if code == "canceled" {
                    "canceled"
                } else if overview {
                    "failed"
                } else {
                    "partial"
                }
            );
        }
    }
}

#[test]
fn draft_keeps_raw_identity_and_optional_reasoning_semantics() {
    let draft = PaperAnalysisWorkflowDraft {
        paper_id: " paper ".into(),
        context_snapshot_id: "snapshot".into(),
        provider_id: "provider".into(),
        model_id: "model".into(),
        reasoning_effort: Some("".into()),
        prompt_set_version: "v3".into(),
    };
    assert!(validate_draft(&draft).is_ok());
    for name in [
        "paperId",
        "contextSnapshotId",
        "providerId",
        "modelId",
        "promptSetVersion",
    ] {
        let mut raw = serde_json::to_value(&draft).unwrap();
        raw[name] = json!(" \n");
        let invalid = serde_json::from_value(raw).unwrap();
        assert_eq!(
            validate_draft(&invalid).unwrap_err().to_string(),
            "论文分析工作流参数不完整"
        );
    }
}

#[test]
fn frozen_sources_pack_without_truncation_or_source_identity_loss() {
    let sources = (0..485)
        .map(|index| ContextText {
            source_id: format!("evidence-{index}"),
            kind: ContextSourceKind::Paper,
            resource_id: "paper".into(),
            revision: "snapshot".into(),
            anchor: Some(format!("anchor-{index}")),
            text: format!("原文 Ω {index}\n"),
        })
        .collect::<Vec<_>>();
    let packed = pack(sources.clone()).unwrap();
    assert_eq!(packed.len(), 1);
    let body: serde_json::Value = serde_json::from_str(&packed[0].text).unwrap();
    assert_eq!(body["sources"], serde_json::to_value(&sources).unwrap());
    assert_eq!(
        packed[0].source_id,
        format!(
            "paper-bundle:{:x}",
            sha2::Sha256::digest(packed[0].text.as_bytes())
        )
    );
    let mut mixed = sources;
    mixed[484].revision = "another".into();
    assert_eq!(
        pack(mixed).unwrap_err().to_string(),
        "论文来源包不能混合不同文献或版本"
    );
    assert!(pack(vec![]).unwrap().is_empty());
}

#[test]
fn every_finite_wire_family_echoes_exact_input_and_uses_the_same_rule() {
    let draft=serde_json::from_value(json!({"paperId":"p","contextSnapshotId":"s","providerId":"x","modelId":"m","reasoningEffort":null,"promptSetVersion":"v3"})).unwrap();
    let inputs = vec![
        WorkflowInputV1::ValidateGeneration {
            portrait_active: true,
            analysis_active: false,
        },
        WorkflowInputV1::SelectConversation { unarchived: None },
        WorkflowInputV1::SelectConversation {
            unarchived: Some("legacy-invalid".into()),
        },
        WorkflowInputV1::SelectConversation {
            unarchived: Some("00000000-0000-0000-0000-000000000001".into()),
        },
        WorkflowInputV1::ValidateTurn {
            turn_kind: "unknown".into(),
        },
        WorkflowInputV1::ValidateStart {
            revision: 0,
            has_template: false,
        },
        WorkflowInputV1::ValidateSources {
            statuses: vec!["available".into()],
            picture_count: 128,
        },
        WorkflowInputV1::ValidateReuse {
            regenerate: false,
            template_json: None,
            existing: Some(Box::new(workflow())),
        },
        WorkflowInputV1::ValidateDraft { draft },
        WorkflowInputV1::OverviewMessages {
            workflow: Box::new(workflow()),
        },
        WorkflowInputV1::RunningStatus {
            turn_kind: "paper_overview".into(),
        },
        WorkflowInputV1::CompletionStatus {
            turn_kind: "paper_overview".into(),
            has_concept_turn: true,
        },
        WorkflowInputV1::FailureStatuses {
            turn_kind: "paper_concept_map".into(),
            error_code: "interrupted".into(),
        },
        WorkflowInputV1::PackSources { sources: vec![] },
    ];
    for input in inputs {
        let encoded = WorkflowWireInputV1 {
            cbor_base64: encode_payload(&input).unwrap(),
        };
        let request = CatalogInput::DecideAnalysisWorkflow {
            input: Box::new(encoded.clone()),
        };
        assert_eq!(
            request.operation(),
            CatalogOperation::DecideAnalysisWorkflow
        );
        let output = crate::catalog::dispatch(request).unwrap();
        assert_eq!(output.operation(), CatalogOperation::DecideAnalysisWorkflow);
        let CatalogOutput::AnalysisWorkflow { outcome } = output else {
            panic!("workflow decision")
        };
        assert_eq!(outcome.input, encoded);
        let decision = decode_payload::<WorkflowDecisionV1>(&outcome.decision_cbor_base64)
            .unwrap_or_else(|error| panic!("{input:?}: {error:?}"));
        assert!(input.matches_decision(&decision));
        assert_eq!(decision, wire::dispatch(input).unwrap());
    }
    assert!(
        !WorkflowInputV1::ValidateStart {
            revision: 1,
            has_template: true
        }
        .matches_decision(&WorkflowDecisionV1::Status {
            status: "overview_running".into()
        })
    );
}

#[test]
fn generation_conversation_decisions_preserve_active_and_uuid_parse_rules() {
    for (portrait, analysis) in [(true, false), (false, true), (true, true)] {
        assert_eq!(
            validate_generation_availability(portrait, analysis)
                .unwrap_err()
                .to_string(),
            "本文生成任务仍在运行，请先等待结束或取消。"
        );
    }
    assert!(validate_generation_availability(false, false).is_ok());
    assert_eq!(existing_conversation(None).unwrap(), None);
    assert!(matches!(
        existing_conversation(Some("legacy-invalid")),
        Err(AnalysisWorkflowError::TemporaryUnavailable)
    ));
    let parsed = existing_conversation(Some("00000000000000000000000000000001"))
        .unwrap()
        .unwrap();
    assert_eq!(parsed.to_string(), "00000000-0000-0000-0000-000000000001");
}
