use super::*;
use research_workbench_native_sdk::{
    analysis_workflow::wire::*,
    paper_context_wire::{decode_payload, encode_payload},
};
use serde_json::json;

fn decision(input: WorkflowInputV1) -> WorkflowDecisionV1 {
    let wire = WorkflowWireInputV1 {
        cbor_base64: encode_payload(&input).unwrap(),
    };
    let result = crate::analysis_workflow::wire::project(wire.clone()).unwrap();
    assert_eq!(result.input, wire);
    let decision = decode_payload(&result.decision_cbor_base64).unwrap();
    assert!(input.matches_decision(&decision));
    decision
}

#[test]
fn submission_scope_preserves_original_paper_selection_and_attachment_order() {
    for (task_kind, kind) in [
        ("paper_overview", "structuredReading"),
        ("paper_profile_classification", "portrait"),
    ] {
        let actual = decision(WorkflowInputV1::SubmissionScope {
            task_kind: task_kind.into(),
            paper_ids: vec!["paper".into(), "paper".into()],
            attachment_ids: vec!["second".into(), "first".into(), "second".into()],
        });
        let WorkflowDecisionV1::SubmissionScope { result: Ok(scope) } = actual else {
            panic!("expected a scope");
        };
        assert_eq!(scope.paper_id, "paper");
        assert_eq!(scope.kind, kind);
        assert_eq!(scope.attachment_ids, ["second", "first", "second"]);
        assert!(
            scope
                .system_text
                .ends_with("Final chat text is not a write receipt.")
        );
    }
    for (papers, message) in [
        (vec![], "生成任务没有文献原文依据"),
        (
            vec!["one".into(), "two".into()],
            "生成任务不能混用不同文献的依据",
        ),
    ] {
        assert_eq!(
            submission_scope("paper_overview", &papers, vec![]),
            Err(AnalysisWorkflowError::InvalidInput(message.into()))
        );
    }
}

#[test]
fn submission_scope_wire_cannot_rebind_the_observed_paper_or_attachment_identity() {
    let input = WorkflowInputV1::SubmissionScope {
        task_kind: "paper_overview".into(),
        paper_ids: vec!["paper".into()],
        attachment_ids: vec!["selected".into()],
    };
    let scope =
        submission_scope("paper_overview", &["paper".into()], vec!["selected".into()]).unwrap();
    for mode in 0..3 {
        let mut altered = scope.clone();
        match mode {
            0 => altered.paper_id = "another".into(),
            1 => altered.attachment_ids = vec!["another".into()],
            _ => altered.kind = "arbitrary".into(),
        }
        assert!(
            !input.matches_decision(&WorkflowDecisionV1::SubmissionScope {
                result: Ok(altered)
            })
        );
    }
}

fn projection(input: CompletionProjectionV1) -> Result<String, AnalysisWorkflowError> {
    let input_cbor_base64 = encode_payload(&input).unwrap();
    let decoded: CompletionProjectionV1 = decode_payload(&input_cbor_base64).unwrap();
    assert_eq!(input, decoded);
    let result = decision(WorkflowInputV1::CompletionProjection { input_cbor_base64 });
    let WorkflowDecisionV1::CompletionProjection { result } = result else {
        panic!("expected a projection");
    };
    result
}

#[test]
fn historical_reading_projection_preserves_active_fields_and_original_json() {
    let content =
        json!({"fields":[{"id":"问题 Ω"}], "retainedFields":[{"id":"archived"}], "other":null});
    let mut expected = content.clone();
    expected.as_object_mut().unwrap().remove("retainedFields");
    assert_eq!(
        projection(CompletionProjectionV1 {
            kind: "structuredReading".into(),
            content: content.clone(),
            template: CompletionTemplateV1::NotRequired
        })
        .unwrap(),
        expected.to_string()
    );
    assert_eq!(
        projection(CompletionProjectionV1 {
            kind: "portrait".into(),
            content: content.clone(),
            template: CompletionTemplateV1::NotRequired
        })
        .unwrap(),
        content.to_string()
    );
}

#[test]
fn portrait_projection_keeps_original_field_identity_and_missing_template_rules() {
    let fields = json!([{"id":"q", "title":"Question", "question":"Why?", "color":"#abcdef", "claimIds":["old"]}]);
    let content = json!({"template":fields});
    let template =
        json!({"fields":[{"id":"q", "title":"Question", "question":"Why?", "color":"#abcdef"}]});
    assert_eq!(
        projection(CompletionProjectionV1 {
            kind: "portrait".into(),
            content: content.clone(),
            template: CompletionTemplateV1::Required {
                content: Some(template)
            }
        })
        .unwrap(),
        content.to_string()
    );
    for template in [
        None,
        Some(json!({"fields":[]})),
        Some(json!({"fields":[{"id":"different"}]})),
    ] {
        assert_eq!(
            projection(CompletionProjectionV1 {
                kind: "portrait".into(),
                content: content.clone(),
                template: CompletionTemplateV1::Required { content: template }
            }),
            Err(AnalysisWorkflowError::InvalidInput(
                "画像已保存，但本文阅读模板尚未成功保存；请在内部对话继续完成待审修改".into()
            ))
        );
    }
    let empty = json!({"template":[]});
    assert_eq!(
        projection(CompletionProjectionV1 {
            kind: "portrait".into(),
            content: empty.clone(),
            template: CompletionTemplateV1::Required { content: None }
        })
        .unwrap(),
        empty.to_string()
    );
}
