use super::*;
use research_workbench_native_sdk::reading_history::ReadingDebugRowV1;
use serde_json::json;

fn workflow() -> PaperAnalysisWorkflow {
    serde_json::from_value(json!({"id":"workflow","paperId":"paper","contextSnapshotId":"snapshot",
        "status":"succeeded","providerId":"provider","modelId":"model","promptSetVersion":"original",
        "revision":4,"createdAt":"created","updatedAt":"updated","turns":[
            {"id":"overview","workflowId":"workflow","ordinal":0,"kind":"paper_overview","status":"succeeded","createdAt":"created","attempts":[]},
            {"id":"concepts","workflowId":"workflow","ordinal":1,"kind":"paper_concept_map","status":"failed","createdAt":"created","attempts":[]}
        ]})).unwrap()
}
fn status() -> PaperAiReadingAttachmentStatus {
    serde_json::from_value(json!({"attachmentId":"attachment","displayName":"Paper.pdf","contentSha256":"hash","parseStatus":"available","parseRunId":"parse"})).unwrap()
}

#[test]
fn original_id_rules_trim_only_archive_and_debug() {
    assert_eq!(
        project(Input::Archive {
            session_id: " \t session\n".into()
        }),
        Decision::Archive {
            session_id: "session".into()
        }
    );
    assert_eq!(
        project(Input::DebugIdentity {
            turn_id: " turn ".into()
        }),
        Decision::DebugIdentity {
            turn_id: "turn".into()
        }
    );
    assert!(
        matches!(project(Input::Archive { session_id:" \n".into() }),Decision::Rejected { message } if message=="AI 阅读会话 ID 不能为空")
    );
    assert!(
        matches!(project(Input::DebugIdentity { turn_id:"".into() }),Decision::Rejected { message } if message=="AI 阅读 turn ID 不能为空")
    );
    assert!(
        matches!(project(Input::Session { summary:None,turns:vec![] }),Decision::Rejected { message } if message=="找不到 AI 阅读会话")
    );
    assert!(
        matches!(project(Input::List { rows:vec![] }),Decision::List { sessions } if sessions.is_empty())
    );
}

#[test]
fn debug_json_preserves_original_request_first_error_and_json_values() {
    assert!(
        matches!(project(Input::DebugRecord { row:None }),Decision::Rejected { message } if message=="找不到 AI 阅读 turn")
    );
    let mut row = ReadingDebugRowV1 {
        turn_id: "turn".into(),
        raw_request_json: Some("{".into()),
        raw_response_json: Some("{".into()),
    };
    assert!(
        matches!(project(Input::DebugRecord { row:Some(row.clone()) }),Decision::Rejected { message } if message=="AI 阅读原始请求记录损坏")
    );
    row.raw_request_json = Some("null".into());
    assert!(
        matches!(project(Input::DebugRecord { row:Some(row.clone()) }),Decision::Rejected { message } if message=="AI 阅读原始返回记录损坏")
    );
    row.raw_response_json = Some(format!(
        "{{\"integer\":{},\"negativeZero\":-0.0,\"text\":\"Ω\"}}",
        u64::MAX
    ));
    let Decision::DebugRecord { data } = project(Input::DebugRecord { row: Some(row) }) else {
        panic!("debug record");
    };
    assert_eq!(data.raw_request, Some(serde_json::Value::Null));
    let response = data.raw_response.unwrap();
    assert_eq!(response["integer"], u64::MAX);
    assert!(response.to_string().contains("\"negativeZero\":-0.0"));
}

#[test]
fn bootstrap_keeps_original_short_circuits_and_exact_attachment_sequence() {
    let status = status();
    let mut unavailable = status.clone();
    unavailable.parse_status = "missing".into();
    assert!(
        matches!(project(Input::BootstrapSources { statuses:vec![unavailable] }),Decision::Bootstrap { options } if options.unavailable_reason.as_deref()==Some("当前 PDF 尚未完成结构化解析"))
    );
    assert_eq!(
        project(Input::BootstrapSources {
            statuses: vec![status.clone()]
        }),
        Decision::HistoryRequired {}
    );
    assert!(
        matches!(project(Input::BootstrapHistory { workflow:None }),Decision::Bootstrap { options } if options.default_kind=="fresh_paper")
    );
    let workflow = workflow();
    assert_eq!(
        project(Input::BootstrapHistory {
            workflow: Some(Box::new(workflow.clone()))
        }),
        Decision::SnapshotRequired {
            context_snapshot_id: "snapshot".into()
        }
    );
    let changed = bootstrap_options(workflow.clone(), std::slice::from_ref(&status), &[]);
    assert_eq!(
        changed.unavailable_reason.as_deref(),
        Some("当前 PDF 或 Docling 解析版本已变化，请重新运行结构化阅读")
    );
    let options = bootstrap_options(
        workflow,
        &[status],
        &[("attachment".into(), "hash".into(), "parse".into())],
    );
    assert_eq!(options.default_kind, "structured_history");
    let history = options.structured_history.unwrap();
    assert_eq!(history.workflow_revision, 4);
    assert_eq!(history.completed_turns, vec!["paper_overview"]);
    assert_eq!(history.attachment_count, 1);
}
