use super::*;
use research_workbench_native_sdk::paper_context_prepare::{
    PaperPreparationDecisionV1 as Result, PaperPreparationInputV1 as Stage, ReadingSessionRowV1,
};
fn evaluate(input: Stage) -> Result {
    let Decision::Prepared {
        decision_cbor_base64,
    } = invoke(Input::Prepare {
        cbor_base64: encode_payload(&input).unwrap(),
    })
    .decision
    else {
        panic!("preparation decision")
    };
    let result: Result = decode_payload(&decision_cbor_base64).unwrap();
    assert_eq!(result, crate::paper_context_prepare::evaluate(input));
    result
}
#[test]
fn original_session_summary_keeps_missing_and_malformed_list_compatibility() {
    assert_eq!(
        evaluate(Stage::Session { row: None }),
        Result::Rejected {
            message: "找不到 AI 阅读会话".into()
        }
    );
    let row = ReadingSessionRowV1 {
        id: "session".into(),
        paper_id: "paper".into(),
        context_snapshot_id: None,
        attachment_ids_json: "broken legacy JSON".into(),
        parse_run_ids_json: "[\"parse\"]".into(),
        provider_id: "old-provider".into(),
        model_id: "old-model".into(),
        reasoning_effort: Some("high".into()),
        bootstrap_kind: "fresh_paper".into(),
        source_workflow_id: None,
        source_workflow_revision: None,
        bootstrap_hash: None,
        concept_retrieval_default: true,
        title: "旧会话 Ω".into(),
        status: "active".into(),
        created_at: "old".into(),
        updated_at: "new".into(),
    };
    let Result::Session { session } = evaluate(Stage::Session {
        row: Some(Box::new(row)),
    }) else {
        panic!("session")
    };
    assert!(session.attachment_ids.is_empty());
    assert_eq!(session.parse_run_ids, ["parse"]);
    assert_eq!(session.title, "旧会话 Ω");
    assert!(session.concept_retrieval_default);
    let value = serde_json::to_value(session).unwrap();
    assert!(value.get("contextSnapshotId").is_none());
    assert_eq!(value["reasoningEffort"], "high");
}
#[test]
fn image_decisions_preserve_count_before_membership_and_duplicate_before_io() {
    assert_eq!(
        evaluate(Stage::ImageIdentity {
            context_item_id: "P1-F1".into(),
            existing_ids: vec!["P1-F1".into()]
        }),
        Result::Rejected {
            message: "图片截图包含重复结构化块 ID".into()
        }
    );
    assert_eq!(
        evaluate(Stage::ImageIdentity {
            context_item_id: "".into(),
            existing_ids: vec![]
        }),
        Result::Validated {}
    );
    assert_eq!(
        evaluate(Stage::ImageSet {
            requested_ids: vec!["P1-F1".into()],
            available_ids: vec![]
        }),
        Result::Rejected {
            message: "图片截图数量与 Docling picture 结构块不一致".into()
        }
    );
    assert_eq!(
        evaluate(Stage::ImageSet {
            requested_ids: vec!["P1-F1".into()],
            available_ids: vec!["other".into()]
        }),
        Result::Rejected {
            message: "缺少结构化图片块 P1-F1 的截图".into()
        }
    );
    assert_eq!(
        evaluate(Stage::ImageSet {
            requested_ids: vec!["P1-F1".into()],
            available_ids: vec!["P1-F1".into()]
        }),
        Result::Validated {}
    );
}
#[test]
fn snapshot_ready_retains_the_original_status_and_run_predicate() {
    let mut statuses: Vec<research_workbench_native_sdk::paper_context::PaperAiReadingAttachmentStatus> = serde_json::from_value(json!([{"attachmentId":"a","displayName":"PDF","contentSha256":"sha","parseStatus":"available","parseRunId":"run"}])).unwrap();
    assert_eq!(
        evaluate(Stage::SnapshotReady {
            attachment_statuses: statuses.clone()
        }),
        Result::Ready { available: true }
    );
    statuses[0].parse_run_id = None;
    assert_eq!(
        evaluate(Stage::SnapshotReady {
            attachment_statuses: statuses.clone()
        }),
        Result::Ready { available: false }
    );
    statuses[0].parse_run_id = Some("run".into());
    statuses[0].parse_status = "stale".into();
    assert_eq!(
        evaluate(Stage::SnapshotReady {
            attachment_statuses: statuses
        }),
        Result::Ready { available: false }
    );
}

#[test]
fn analysis_preparation_keeps_source_rejection_before_the_picture_limit() {
    assert_eq!(
        evaluate(Stage::AnalysisSources {
            statuses: vec!["missing".into()],
            picture_count: 129
        }),
        Result::Rejected {
            message: "部分 PDF 尚未完成 Docling 结构化解析".into()
        }
    );
    assert_eq!(
        evaluate(Stage::AnalysisSources {
            statuses: vec!["available".into()],
            picture_count: 128
        }),
        Result::Validated {}
    );
    assert_eq!(
        evaluate(Stage::AnalysisSources {
            statuses: vec!["available".into()],
            picture_count: 129
        }),
        Result::Rejected {
            message: "图片结构块数量为 129，超过本轮上限 128".into()
        }
    );
}
