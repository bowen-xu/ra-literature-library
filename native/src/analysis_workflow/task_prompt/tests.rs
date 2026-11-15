use super::*;
use research_agent_api::submission::ContextSourceKind;
use research_workbench_native_sdk::candidate_contracts::{
    AiOverviewProfileContext, PaperTemplateRef, PaperTemplateSnapshot, TemplateField,
};
use research_workbench_native_sdk::{
    analysis_workflow::{prompt::*, wire::*},
    catalog::{CatalogInput, CatalogOutput},
    paper_context_wire::{decode_payload, encode_payload},
};

fn prompt_input() -> TaskPromptInputV1 {
    let source = |id: &str, label: &str, anchor: Value| ContextText {
        source_id: id.into(),
        kind: ContextSourceKind::UserResource,
        resource_id: id.into(),
        revision: "frozen".into(),
        anchor: Some(anchor.to_string()),
        text: json!({"label":label}).to_string(),
    };
    TaskPromptInputV1 {
        task_template: "{{ task }}\n{{ contract }}\n{{ preferences }}".into(),
        reading_contract: "阅读结构\n{{ schema }}".into(),
        sources: vec![
            PromptSourceV1 {
                source: source(
                    "source",
                    "原文 📄",
                    json!({"resourceKind":"paper","sourceUrl":"ignored"}),
                ),
                resource: PromptResourceV1::Paper {
                    resource_id: "paper".into(),
                    attachment_id: Some("pdf".into()),
                },
            },
            PromptSourceV1 {
                source: source(
                    "target",
                    "结果 Ω [字段]",
                    json!({"resourceKind":"structuredReading","contextAccess":"readWrite","sourceUrl":"source://library/paper/structured-reading"}),
                ),
                resource: PromptResourceV1::Other,
            },
        ],
        kind: "structuredReading".into(),
        profile: None,
        preferences: "{\"偏好\":\"中文\"}".into(),
    }
}

#[test]
fn prompt_wire_preserves_original_text_mentions_utf16_and_frozen_source_identity() {
    let input = prompt_input();
    let direct = render_current(
        &input.task_template,
        &input.reading_contract,
        input
            .sources
            .iter()
            .map(|entry| (&entry.source, entry.resource.clone())),
        &input.kind,
        input.profile.as_ref(),
        &input.preferences,
    )
    .unwrap();
    let request = WorkflowInputV1::RenderPrompt {
        input_cbor_base64: encode_payload(&input).unwrap(),
    };
    let output = crate::catalog::dispatch(CatalogInput::DecideAnalysisWorkflow {
        input: Box::new(WorkflowWireInputV1 {
            cbor_base64: encode_payload(&request).unwrap(),
        }),
    })
    .unwrap();
    let CatalogOutput::AnalysisWorkflow { outcome } = output else {
        panic!("workflow response")
    };
    let decision: WorkflowDecisionV1 = decode_payload(&outcome.decision_cbor_base64).unwrap();
    assert!(request.matches_decision(&decision));
    let WorkflowDecisionV1::Prompt { result_cbor_base64 } = decision else {
        panic!("prompt decision")
    };
    let result: Result<PaperTaskPrompt, AiError> = decode_payload(&result_cbor_base64).unwrap();
    let result = result.unwrap();
    assert_eq!(result, direct);
    assert!(result.text.contains("结果 Ω \\[字段\\]"));
    assert!(result.text.contains("\"research_question\""));
    let UserInput::Text {
        text,
        text_elements,
    } = &result.user_input[0]
    else {
        panic!("original text input")
    };
    assert_eq!(text, &result.text);
    assert_eq!(text_elements.len(), 2);
    let utf16 = text.encode_utf16().collect::<Vec<_>>();
    for element in text_elements {
        let label = String::from_utf16(&utf16[element.start_utf16..element.end_utf16]).unwrap();
        let UserInput::Mention { name, target } = &result.user_input[element.item_index] else {
            panic!("bound source mention")
        };
        assert!(label.starts_with('['));
        assert!(!name.is_empty());
        let MentionTarget::File {
            revision,
            source_id,
            ..
        } = target
        else {
            panic!("frozen file target")
        };
        assert_eq!(revision, "frozen");
        assert!(matches!(source_id.as_str(), "source" | "target"));
    }
}

#[test]
fn prompt_rejections_keep_the_original_target_and_template_error_categories() {
    let mut input = prompt_input();
    input.sources.clear();
    let failure = render_current(
        &input.task_template,
        &input.reading_contract,
        input
            .sources
            .iter()
            .map(|entry| (&entry.source, entry.resource.clone())),
        &input.kind,
        None,
        "",
    )
    .unwrap_err();
    assert_eq!(
        failure.to_string(),
        "内部任务目标未授予读写权限，请在上下文管理中选择目标并允许读写"
    );
    let input = prompt_input();
    let failure = render_current(
        "{{ missing }}",
        &input.reading_contract,
        input
            .sources
            .iter()
            .map(|entry| (&entry.source, entry.resource.clone())),
        &input.kind,
        None,
        "",
    )
    .unwrap_err();
    assert!(matches!(failure, AiError::TemporaryUnavailable));
    let invalid = WorkflowInputV1::RenderPrompt {
        input_cbor_base64: "invalid CBOR".into(),
    };
    assert!(
        crate::catalog::dispatch(CatalogInput::DecideAnalysisWorkflow {
            input: Box::new(WorkflowWireInputV1 {
                cbor_base64: encode_payload(&invalid).unwrap()
            })
        })
        .is_err()
    );
}

#[test]
fn schema_preserves_the_exact_template_snapshot_and_order() {
    let profile = AiOverviewProfileContext {
        paper_id: "paper".into(),
        selection_revision: 3,
        profile_refs: vec![],
        field_kinds: vec!["design".into(), "question".into()],
        paper_template: Some(PaperTemplateSnapshot {
            reference: PaperTemplateRef::Resource {
                template_resource_id: "template".into(),
                template_resource_revision: 3,
            },
            fields: vec![
                TemplateField {
                    id: "design".into(),
                    title: "设计".into(),
                    question: "设计定义".into(),
                    claim_ids: vec!["c1".into()],
                    color: None,
                },
                TemplateField {
                    id: "question".into(),
                    title: "问题".into(),
                    question: "问题定义".into(),
                    claim_ids: vec![],
                    color: None,
                },
            ],
        }),
    };
    let schema = reading_schema(Some(&profile));
    assert_eq!(
        schema["paperTemplate"],
        json!(profile.paper_template.unwrap())
    );
    assert_eq!(schema["fields"][0]["field"], "design");
    assert_eq!(schema["fields"][1]["field"], "question");
    assert!(schema.get("profileRefs").is_none());
}
