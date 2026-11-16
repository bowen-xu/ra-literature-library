use research_literature_library_native::{analysis_workflow, paper_context};
use research_workbench_native_sdk::{
    analysis_workflow::{overview_task::OverviewTaskInputV1, template::TemplateInputV1},
    generation::evidence::{AnchorEvidence, AttachmentEvidence},
    paper_context::{PaperAiReadingContextItem, PaperContextBuildInputV1, PreparedPaperContextV1},
    paper_context_wire::decode_payload,
};
use serde_json::{Value, json};

#[test]
fn recorded_core_workflow_wait_responses_match_the_public_domain_policy() {
    let fixture: Value = serde_json::from_str(include_str!(
        "fixtures/core-workflow-wait-v1/responses.json"
    ))
    .unwrap();
    let task_input: OverviewTaskInputV1 =
        serde_json::from_value(fixture["taskInput"].clone()).unwrap();
    assert_eq!(
        serde_json::to_value(analysis_workflow::overview_task::task(&task_input)).unwrap(),
        fixture["task"]
    );

    let context_input: PaperContextBuildInputV1 =
        serde_json::from_value(fixture["contextInput"].clone()).unwrap();
    let context = paper_context::build(&context_input);
    let expected_context: PreparedPaperContextV1 =
        decode_payload(fixture["contextCbor"].as_str().unwrap()).unwrap();
    assert_eq!(context, expected_context);
    assert!(matches!(
        context.context_items[1].table_json,
        Some(Value::Null)
    ));
    assert_eq!(serde_json::to_value(&context).unwrap(), fixture["context"]);
    for row in fixture["doclingRows"].as_array().unwrap() {
        let item: PaperAiReadingContextItem =
            decode_payload(row["itemCbor"].as_str().unwrap()).unwrap();
        assert!(context.context_items.contains(&item));
        let actual = analysis_workflow::docling::evidence_row("__run_id__", &item)
            .unwrap()
            .unwrap();
        assert_eq!(serde_json::to_value(actual).unwrap(), row["row"]);
    }

    let selection: AnchorEvidence =
        serde_json::from_value(fixture["selectionInput"].clone()).unwrap();
    assert_eq!(
        serde_json::to_value(
            analysis_workflow::task_preview::selection::preview(Some(selection)).unwrap()
        )
        .unwrap(),
        fixture["selection"]
    );
    let attachment: AttachmentEvidence =
        serde_json::from_value(fixture["pageInput"]["attachment"].clone()).unwrap();
    let pages: Vec<(i64, String)> =
        serde_json::from_value(fixture["pageInput"]["pages"].clone()).unwrap();
    assert_eq!(task_input.attachment_ids, ["selected"]);
    let sources =
        analysis_workflow::task_preview::pages::select_pages(&attachment, "selected", &pages)
            .unwrap();
    assert_eq!(
        serde_json::to_value(analysis_workflow::task_preview::pages::prepare_rows(
            &sources
        ))
        .unwrap(),
        fixture["pageRows"]
    );
    assert_eq!(
        serde_json::to_value(analysis_workflow::task_preview::pages::preview_sources(
            &sources
        ))
        .unwrap(),
        fixture["pagePreview"]
    );

    let template = TemplateInputV1::ResourceContent {
        paper_id: "paper".into(),
        reference: task_input.template.unwrap(),
        selection_revision: 1,
        raw: json!({
            "kind":"reading_template_v1", "schemaVersion":1, "name":"Extraction template",
            "fields":[{"id":"question","title":"问题","question":"研究什么？"}]
        })
        .to_string(),
    };
    assert_eq!(
        serde_json::to_value(
            analysis_workflow::template::resolve(&template)
                .unwrap()
                .unwrap()
        )
        .unwrap(),
        fixture["profile"]
    );
}
