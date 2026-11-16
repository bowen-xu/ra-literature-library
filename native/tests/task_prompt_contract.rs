use research_agent_api::{
    submission::{ContextSourceKind, ContextText},
    user_input::{MentionTarget, UserInput},
};
use research_literature_library_native::analysis_workflow::task_prompt::render_current;
use research_workbench_native_sdk::{
    analysis_workflow::{
        AnalysisWorkflowError,
        prompt::{PaperTaskPrompt, PromptResourceV1},
    },
    candidate_contracts::AiOverviewProfileContext,
};
use serde_json::{Value, json};

fn grant(id: &str, resource: Value, kind: Option<&str>) -> ContextText {
    ContextText {
        source_id: format!("grant:{id}"),
        kind: ContextSourceKind::Paper,
        resource_id: id.into(),
        revision: format!("frozen:{id}"),
        anchor: Some(
            json!({"content":"resourceGrant","resource":resource,
            "sourceUrl":format!("source://library/paper/{id}"),"resourceKind":kind,
            "contextAccess":"readWrite"})
            .to_string(),
        ),
        text: "Available; body not loaded".into(),
    }
}
fn grants(kind: &str) -> Vec<ContextText> {
    vec![
        grant(
            "paper",
            json!({"kind":"paper","resourceId":"paper","attachmentId":"pdf-1"}),
            None,
        ),
        grant(
            "target",
            json!({"kind":"structuredObject","resourceId":"target","access":"readWrite"}),
            Some(kind),
        ),
        grant(
            "template",
            json!({"kind":"structuredObject","resourceId":"template","access":"readOnly"}),
            Some("readingTemplate"),
        ),
    ]
}

fn render(
    context: &[ContextText],
    kind: &str,
    profile: Option<&AiOverviewProfileContext>,
    preferences: &str,
) -> Result<PaperTaskPrompt, AnalysisWorkflowError> {
    render_current(
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../.dependencies/sdk/web/core/prompts/structured-task.md"
        )),
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../.dependencies/sdk/web/core/prompts/structured-reading-contract.md"
        )),
        context.iter().map(|source| {
            let resource = match source.resource_id.as_str() {
                "paper" => PromptResourceV1::Paper {
                    resource_id: "paper".into(),
                    attachment_id: Some("pdf-1".into()),
                },
                "catalog" => PromptResourceV1::TemplateCatalog,
                _ => PromptResourceV1::Other,
            };
            (source, resource)
        }),
        kind,
        profile,
        preferences,
    )
}

#[test]
fn readable_prompt_binds_exact_authorized_files_without_context_bookkeeping() {
    let prompt = render(
        &grants("structuredReading"),
        "structuredReading",
        None,
        "含 emoji 🧪 和 {{ literal }}",
    )
    .unwrap();
    assert!(prompt.text.starts_with(
        "阅读以下文件：\n- [source://library/paper/pdf-1](source://library/paper/pdf-1)\n"
    ));
    assert!(
        prompt
            .text
            .contains("写入到 [source://library/paper/target](source://library/paper/target)")
    );
    assert!(prompt.text.contains("\"kind\": \"paper_overview_unit_v1\""));
    assert!(!prompt.text.contains("system_context"));
    assert!(!prompt.text.contains("context snapshot"));
    assert!(prompt.text.contains("含 emoji 🧪 和 {{ literal }}"));
    research_agent_api::user_input::validate(&prompt.user_input, &prompt.text).unwrap();
    let UserInput::Text { text_elements, .. } = &prompt.user_input[0] else {
        panic!()
    };
    for element in text_elements {
        let marked = String::from_utf16(
            &prompt.text.encode_utf16().collect::<Vec<_>>()[element.start_utf16..element.end_utf16],
        )
        .unwrap();
        let UserInput::Mention {
            name,
            target:
                MentionTarget::File {
                    source_id,
                    revision,
                    ..
                },
        } = &prompt.user_input[element.item_index]
        else {
            panic!()
        };
        assert_eq!(marked, format!("[{name}]({name})"));
        assert!(source_id.starts_with("grant:"));
        assert!(revision.starts_with("frozen:"));
    }
}

#[test]
fn portrait_has_its_contract_and_separate_template_proposal_target() {
    let mut sources = grants("portrait");
    sources.push(grant(
        "catalog",
        json!({"kind":"templateCatalog","resourceId":"catalog","access":"readOnly"}),
        Some("templateCatalog"),
    ));
    let prompt = render(&sources, "portrait", None, "").unwrap();
    assert!(prompt.text.contains("resourceType: readingTemplate"));
    assert!(prompt.text.contains("不要只传 resourceId 调用 find"));
    assert!(prompt.text.contains("遵循所引用画像技能"));
    assert!(prompt.text.contains(
        "本文模板建议写入到 [source://library/paper/template](source://library/paper/template)"
    ));
    assert!(prompt.text.contains("Keep／Undo"));
    assert!(!prompt.text.contains("No tools"));
    research_agent_api::user_input::validate(&prompt.user_input, &prompt.text).unwrap();
}

#[test]
fn missing_target_cannot_be_turned_into_a_guessed_write_address() {
    assert!(render(&[], "structuredReading", None, "").is_err());
}

#[test]
fn task_cannot_promote_a_readonly_target_to_a_write_request() {
    for kind in ["portrait", "structuredReading"] {
        let mut sources = grants(kind);
        let mut anchor: Value =
            serde_json::from_str(sources[1].anchor.as_deref().unwrap()).unwrap();
        anchor["contextAccess"] = json!("readOnly");
        sources[1].anchor = Some(anchor.to_string());
        let error = render(&sources, kind, None, "").err().unwrap();
        assert!(error.to_string().contains("读写权限"));
        sources.remove(1);
        assert!(render(&sources, kind, None, "").is_err());
    }
}
#[test]
fn current_task_template_override_is_rendered() {
    let task = format!(
        "{}\nCurrent runtime prompt rule.\n",
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../.dependencies/sdk/web/core/prompts/structured-task.md"
        ))
    );
    let sources = grants("portrait");
    let result = render_current(
        &task,
        "{{ schema }}",
        sources
            .iter()
            .map(|source| (source, PromptResourceV1::Other)),
        "portrait",
        None,
        "",
    )
    .unwrap();
    assert!(result.text.contains("Current runtime prompt rule."));
}

#[test]
fn workbench_0_8_0_portrait_skill_example_satisfies_domain_decoder() {
    let example = include_str!("fixtures/workbench-0.8.0-portrait/example.json");
    research_literature_library_native::analysis_workflow::candidate::decode_candidate_value(
        serde_json::from_str(example).unwrap(),
        &std::collections::HashSet::new(),
    )
    .expect("the versioned skill example satisfies the actual domain decoder");
}

#[test]
fn workbench_0_8_0_provider_outputs_satisfy_domain_decoders() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/workbench-0.8.0-provider-output");
    let manifest: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(root.join("provenance.json")).unwrap())
            .unwrap();
    for fixture in manifest["fixtures"].as_array().unwrap() {
        let value: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(root.join(fixture["file"].as_str().unwrap())).unwrap(),
        )
        .unwrap();
        let keys = fixture["evidenceItemIds"]
            .as_array()
            .unwrap()
            .iter()
            .map(|key| key.as_str().unwrap().to_owned())
            .collect();
        let decoded = research_literature_library_native::analysis_workflow::candidate::decode_candidate_value(value.clone(), &keys).unwrap();
        assert_eq!(decoded.kind(), value["kind"].as_str().unwrap());
    }
}
