use research_literature_library_native::analysis_workflow::submission::project_completion;
use research_workbench_native_sdk::analysis_workflow::submission::{
    CompletionProjectionV1, CompletionTemplateV1,
};
use serde_json::{Value, json};

#[test]
fn portrait_completion_rejects_mismatched_template_then_accepts_current_fields() {
    let fields =
        json!([{"id":"question","title":"问题","question":"回应什么问题？","claimIds":[]}]);
    let portrait = json!({"kind":"paper_portrait_v1","schemaVersion":1,"coverage":"仅提供的摘录。","claims":[
        {"id":"genre","dimension":"genre","label":"不确定","description":"证据不足。","certainty":"uncertain","evidence":[]},
        {"id":"mode","dimension":"mode","label":"不确定","description":"证据不足。","certainty":"uncertain","evidence":[]},
        {"id":"paradigm","dimension":"paradigm","label":"不确定","description":"证据不足。","certainty":"uncertain","evidence":[]}
    ],"template":fields});

    let request = |template| CompletionProjectionV1 {
        kind: "portrait".into(),
        content: portrait.clone(),
        template: CompletionTemplateV1::Required {
            content: Some(template),
        },
    };
    let wrong = json!({"kind":"reading_template_v1","schemaVersion":1,"name":"本文模板","fields":[{"id":"result","title":"结果","question":"得出了什么结果？"}]});
    assert!(project_completion(request(wrong)).is_err());
    let correct = json!({"kind":"reading_template_v1","schemaVersion":1,"name":"本文模板","fields":[{"id":"question","title":"问题","question":"回应什么问题？"}]});
    let accepted = project_completion(request(correct)).unwrap();
    assert_eq!(serde_json::from_str::<Value>(&accepted).unwrap(), portrait);
}
