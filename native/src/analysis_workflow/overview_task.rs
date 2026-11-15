//! The original overview task specification, over caller-owned source identities.
use research_workbench_native_sdk::{
    analysis_workflow::overview_task::OverviewTaskInputV1,
    generation::{AiScopeItemDraft, AiTaskSpecDraft},
};

const PROMPT_VERSION: &str = "paper-overview-docling-context-v3";

pub fn task(input: &OverviewTaskInputV1) -> AiTaskSpecDraft {
    AiTaskSpecDraft {
        task_kind: "paper_overview".to_owned(),
        provider_id: String::new(),
        model_selection: input.model_selection.clone(),
        user_goal: "按用户确认的阅读框架，从 Docling 结构化上下文中逐字段提取候选，并为每条原子陈述引用结构化块 ID。".to_owned(),
        pipeline_version: "paper-overview-docling-runtime-v1".to_owned(),
        prompt_version: PROMPT_VERSION.to_owned(),
        output_schema_version: 1,
        max_input_tokens: 64_000,
        max_output_tokens: 4_000,
        timeout_ms: 120_000,
        scope_items: input.attachment_ids.iter().map(|id| AiScopeItemDraft {
            item_kind: "attachment".to_owned(),
            object_id: id.clone(),
            parent_object_id: Some(input.paper_id.clone()),
            content_sha256: None,
            object_revision: None,
        }).collect(),
        overview_fields: Vec::new(),
        overview_profile_selection_revision: if input.template.is_some() { None } else { Some(input.selection_revision) },
        paper_template_ref: input.template.clone(),
        suggestion_candidate_kind: None,
        matrix_synthesis_context: None,
        base_candidate_id: None,
        base_candidate_revision: None,
        confirmed_scope_hash: None,
        cloud_consent_version: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use research_workbench_native_sdk::{
        candidate_contracts::PaperTemplateRef, generation::LlmModelSelectionDraft,
    };
    use serde_json::json;

    #[test]
    fn original_task_fields_and_json_order_survive_the_canonical_contract_move() {
        let input = OverviewTaskInputV1 {
            paper_id: "paper".into(),
            attachment_ids: vec!["second".into(), "first".into()],
            selection_revision: 7,
            template: None,
            model_selection: Some(LlmModelSelectionDraft {
                provider_id: "provider".into(),
                model_id: "model".into(),
                reasoning_effort: Some("high".into()),
            }),
        };
        let draft = task(&input);
        let value = serde_json::to_value(&draft).unwrap();
        assert_eq!(
            value,
            json!({
                "taskKind":"paper_overview", "providerId":"", "modelSelection":{"providerId":"provider", "modelId":"model", "reasoningEffort":"high"},
                "userGoal":"按用户确认的阅读框架，从 Docling 结构化上下文中逐字段提取候选，并为每条原子陈述引用结构化块 ID。",
                "pipelineVersion":"paper-overview-docling-runtime-v1", "promptVersion":"paper-overview-docling-context-v3", "outputSchemaVersion":1,
                "maxInputTokens":64000, "maxOutputTokens":4000, "timeoutMs":120000,
                "scopeItems":[{"itemKind":"attachment", "objectId":"second", "parentObjectId":"paper", "contentSha256":null, "objectRevision":null}, {"itemKind":"attachment", "objectId":"first", "parentObjectId":"paper", "contentSha256":null, "objectRevision":null}],
                "overviewFields":[], "overviewProfileSelectionRevision":7, "paperTemplateRef":null, "suggestionCandidateKind":null, "matrixSynthesisContext":null,
                "baseCandidateId":null, "baseCandidateRevision":null, "confirmedScopeHash":null, "cloudConsentVersion":null
            })
        );
        let encoded = serde_json::to_string(&draft).unwrap();
        assert!(encoded.starts_with(
            "{\"taskKind\":\"paper_overview\",\"providerId\":\"\",\"modelSelection\":"
        ));
        assert!(encoded.ends_with("\"baseCandidateId\":null,\"baseCandidateRevision\":null,\"confirmedScopeHash\":null,\"cloudConsentVersion\":null}"));
        for reference in [
            PaperTemplateRef::Legacy {
                portrait_candidate_id: "old".into(),
                portrait_revision: 3,
            },
            PaperTemplateRef::Resource {
                template_resource_id: "template".into(),
                template_resource_revision: 4,
            },
        ] {
            let mut with_template = input.clone();
            with_template.template = Some(reference.clone());
            let draft = task(&with_template);
            assert!(draft.overview_profile_selection_revision.is_none());
            assert_eq!(draft.paper_template_ref, Some(reference));
        }
        let mut legacy = value;
        legacy.as_object_mut().unwrap().remove("overviewFields");
        assert!(
            serde_json::from_value::<AiTaskSpecDraft>(legacy)
                .unwrap()
                .overview_fields
                .is_empty()
        );
    }
}
