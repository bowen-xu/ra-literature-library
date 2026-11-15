use super::*;
use research_workbench_native_sdk::{
    analysis_history::{HistoryResultV1, HistoryWireInputV1},
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    paper_context_wire::{decode_payload, encode_payload},
};
use serde_json::json;

fn captured() -> HistoryInputV1 {
    serde_json::from_value(json!({
        "request":{"kind":"get","workflowId":"workflow"},
        "workflow":{
            "row":{"id":"workflow","paperId":"paper","contextSnapshotId":"snapshot",
                "conversationId":"00000000-0000-0000-0000-000000000001",
                "status":"historical-state","providerId":"old-provider","modelId":"old-model",
                "promptSetVersion":"v1","revision":4,"createdAt":"old","updatedAt":"now"},
            "turns":[{"row":{"id":"turn","workflowId":"workflow","ordinal":0,
                "kind":"paper_overview","status":"succeeded","createdAt":"old"},
                "attempts":[{"id":"attempt","turnId":"turn","attempt":2,"status":"succeeded",
                    "providerId":"old-provider","modelId":"old-model","createdAt":"old",
                    "sharedConversationId":"00000000-0000-0000-0000-000000000001",
                    "sharedRequestId":"legacy-invalid",
                    "sharedTurnId":"00000000-0000-0000-0000-000000000002",
                    "sharedTurnOutcome":"failed","sharedTerminalStatus":"interrupted",
                    "normalizedMessages":[{"kind":"task_prompt","content":"Ω\ncontent"}],
                    "recoveryReason":"restored","recoveryVersion":2,"recoveredAt":"now"}]}]
        }
    }))
    .unwrap()
}

#[test]
fn original_projection_keeps_history_and_optional_uuid_semantics() {
    let input = captured();
    let result = project(input.clone());
    assert!(input.matches_result(&result));
    let workflow = result.unwrap().unwrap();
    assert_eq!(workflow.status, "historical-state");
    assert_eq!(
        workflow.conversation_id.unwrap().to_string(),
        "00000000-0000-0000-0000-000000000001"
    );
    let attempt = &workflow.turns[0].attempts[0];
    assert_eq!(attempt.shared_turn_outcome.as_deref(), Some("failed"));
    assert_eq!(
        attempt.shared_terminal_status.as_deref(),
        Some("interrupted")
    );
    assert!(attempt.shared_request_id.is_none());
    assert_eq!(attempt.normalized_messages[0].content, "Ω\ncontent");
    assert_eq!(attempt.recovery_version, Some(2));
    let json = serde_json::to_value(&workflow).unwrap();
    assert!(json.get("activeClientRequestId").is_none());
    assert!(
        json["turns"][0]["attempts"][0]
            .get("sharedRequestId")
            .is_none()
    );
    assert!(json.get("reasoningEffort").is_none());
}

#[test]
fn absent_get_retains_original_error_and_absent_latest_is_empty() {
    let mut input = captured();
    input.workflow = None;
    let result = project(input.clone());
    assert_eq!(result, Err(HistoryRejectionV1::NotFound));
    assert!(input.matches_result(&result));
    assert_eq!(result.unwrap_err().to_string(), "找不到论文分析工作流");
    input.request = HistoryRequestV1::Latest {
        paper_id: "paper".into(),
    };
    assert_eq!(project(input.clone()), Ok(None));
    assert!(input.matches_result(&Ok(None)));
    assert!(!input.matches_result(&Err(HistoryRejectionV1::NotFound)));
}

#[test]
fn finite_catalog_echo_and_result_tree_bind_to_original_capture() {
    let input = captured();
    let wire = HistoryWireInputV1 {
        cbor_base64: encode_payload(&input).unwrap(),
    };
    let request = CatalogInput::ProjectAnalysisHistory {
        input: Box::new(wire.clone()),
    };
    assert_eq!(
        request.operation(),
        CatalogOperation::ProjectAnalysisHistory
    );
    let CatalogOutput::AnalysisHistory { outcome } = crate::catalog::dispatch(request).unwrap()
    else {
        panic!("history result");
    };
    assert_eq!(outcome.input, wire);
    let result: HistoryResultV1 = decode_payload(&outcome.result_cbor_base64).unwrap();
    assert!(input.matches_result(&result));
    let mut wrong = result.clone();
    wrong.as_mut().unwrap().as_mut().unwrap().turns[0].attempts[0].id = "other".into();
    assert!(!input.matches_result(&wrong));
    let mut wrong = result;
    wrong
        .as_mut()
        .unwrap()
        .as_mut()
        .unwrap()
        .active_client_request_id = Some("forged-request".into());
    assert!(!input.matches_result(&wrong));
    assert!(!input.matches_result(&Ok(None)));
}
