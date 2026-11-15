//! Canonical original task rendering over Core-classified immutable sources.
use research_agent_api::{
    prompt_template::Template,
    submission::ContextText,
    user_input::{MentionTarget, TextElement, UserInput},
};
use research_workbench_native_sdk::{
    analysis_workflow::{
        AnalysisWorkflowError as AiError,
        prompt::{PaperTaskPrompt as TaskPrompt, PromptResourceV1 as Resource},
    },
    candidate_contracts::{AiOverviewProfileContext, GENERIC_OVERVIEW_FIELDS},
};
use serde_json::{Value, json};
#[derive(Default)]
struct Builder {
    text: String,
    references: Vec<UserInput>,
    elements: Vec<TextElement>,
}
impl Builder {
    fn reference(&mut self, source: &ContextText, path: &str) {
        let start_utf16 = self.text.encode_utf16().count();
        let metadata: Value = serde_json::from_str(&source.text).unwrap_or(Value::Null);
        let name = metadata["label"].as_str().unwrap_or(path);
        let label = name
            .replace('\\', "\\\\")
            .replace('[', "\\[")
            .replace(']', "\\]");
        self.text.push_str(&format!("[{label}]({path})"));
        self.elements.push(TextElement {
            start_utf16,
            end_utf16: self.text.encode_utf16().count(),
            item_index: self.references.len() + 1,
        });
        self.references.push(UserInput::Mention {
            name: name.into(),
            target: MentionTarget::File {
                source_id: source.source_id.clone(),
                resource_id: source.resource_id.clone(),
                source_url: Some(path.to_owned()),
                revision: source.revision.clone(),
            },
        });
    }
    fn finish(self) -> TaskPrompt {
        TaskPrompt {
            user_input: std::iter::once(UserInput::Text {
                text: self.text.clone(),
                text_elements: self.elements,
            })
            .chain(self.references)
            .collect(),
            text: self.text,
        }
    }
}

pub fn render_current<'a>(
    task: &str,
    contract: &str,
    context: impl IntoIterator<Item = (&'a ContextText, Resource)>,
    kind: &str,
    profile: Option<&AiOverviewProfileContext>,
    preferences: &str,
) -> Result<TaskPrompt, AiError> {
    let task =
        Template::parse(task.trim_end()).map_err(|e| AiError::InvalidInput(e.to_string()))?;
    let contract =
        Template::parse(contract.trim_end()).map_err(|e| AiError::InvalidInput(e.to_string()))?;
    render_templates(context, kind, profile, preferences, &task, &contract)
}
pub fn render_templates<'a>(
    context: impl IntoIterator<Item = (&'a ContextText, Resource)>,
    kind: &str,
    profile: Option<&AiOverviewProfileContext>,
    preferences: &str,
    task_template: &Template,
    reading_contract: &Template,
) -> Result<TaskPrompt, AiError> {
    let entries = context
        .into_iter()
        .filter_map(|(source, resource)| {
            let anchor: Value = serde_json::from_str(source.anchor.as_deref()?).ok()?;
            let path = if let Resource::Paper {
                resource_id,
                attachment_id: Some(id),
                ..
            } = &resource
            {
                research_agent_api::text_patch::address::object(
                    research_agent_api::text_patch::address::SourceRoot::Library,
                    &[resource_id.clone(), id.clone()],
                )
            } else {
                anchor["sourceUrl"].as_str()?.to_owned()
            };
            Some((source, resource, anchor, path))
        })
        .collect::<Vec<_>>();
    let target = entries
        .iter()
        .find(|(_, _, anchor, _)| {
            anchor["resourceKind"] == kind && anchor["contextAccess"] == "readWrite"
        })
        .ok_or_else(|| {
            AiError::InvalidInput(
                "内部任务目标未授予读写权限，请在上下文管理中选择目标并允许读写".into(),
            )
        })?;
    let mut builder = Builder::default();
    builder.text.push_str("阅读以下文件：\n");
    for (source, resource, anchor, path) in &entries {
        if matches!(resource, Resource::Paper { .. } | Resource::TemplateCatalog)
            || anchor["resourceKind"] == "readingTemplate"
        {
            builder
                .text
                .push_str(if matches!(resource, Resource::TemplateCatalog) {
                    "- 参考模板目录（research_find_sources 必须带 resourceType: readingTemplate，并用 resourceId 限定此目录；无筛选浏览请用 research_list_sources，不要只传 resourceId 调用 find）："
                } else {
                    "- "
                });
            builder.reference(source, path);
            builder.text.push('\n');
        }
    }
    let (task, contract) = if kind == "portrait" {
        (
            "根据原文生成文献画像，并提出适合本文的可复用阅读模板。将画像以 paper_portrait_v1 JSON 对象（kind、schemaVersion:1、coverage 字符串、claims 数组、template 数组）写入目标文件；完整字段约束和示例遵循所引用画像技能。",
            String::new(),
        )
    } else {
        let schema = serde_json::to_string_pretty(&reading_schema(profile))
            .map_err(|_| AiError::TemporaryUnavailable)?;
        (
            "按照上面阅读模板的字段定义提取结构化阅读记录；仅完成本次阅读提取。",
            reading_contract
                .render([("schema", schema.as_str())])
                .map_err(|_| AiError::TemporaryUnavailable)?,
        )
    };
    let preferences = if preferences.trim().is_empty() {
        String::new()
    } else {
        let data = serde_json::from_str::<Value>(preferences)
            .map(|value| serde_json::to_string_pretty(&value))
            .unwrap_or_else(|_| Ok(preferences.into()))
            .map_err(|_| AiError::TemporaryUnavailable)?;
        format!("用户配置（分类标签、通用定义及偏好；不是原文证据）：\n{data}")
    };
    builder.text.push('\n');
    builder.text.push_str(
        &task_template
            .render([
                ("task", task),
                ("contract", contract.as_str()),
                ("preferences", preferences.as_str()),
            ])
            .map_err(|_| AiError::TemporaryUnavailable)?,
    );
    builder.text.push_str("\n\n写入到 ");
    builder.reference(target.0, &target.3);
    builder.text.push_str("。先用 research_read_file 读取目标，再用 research_apply_patch 的 Update File 更新同一地址；宿主已预建空白对象，禁止 Add File，也不要另建文件。若 JSON、引用或版本校验失败，读取 candidate 视图，按工具错误修复同一草稿并重试。只有本轮目标取得 applied 回执后才算完成，最后简短说明结果，不在聊天中返回整份 JSON。\n");
    if kind == "portrait" {
        for (source, _, anchor, path) in &entries {
            if anchor["resourceKind"] == "readingTemplate" && anchor["contextAccess"] == "readWrite"
            {
                builder.text.push_str("\n本文模板建议写入到 ");
                builder.reference(source, path);
                builder.text.push_str("。先读取；字段有变化时保存 reading_template_v1 对象（kind、schemaVersion:1、name、fields），fields 使用画像的模板建议并保留未变字段的稳定 ID。校验通过后保存并保留待审 Diff，用户通过 Keep／Undo 审阅。全局模板仅供参考，不直接发布或覆盖模板。\n");
            }
        }
    }
    Ok(builder.finish())
}

fn reading_schema(profile: Option<&AiOverviewProfileContext>) -> Value {
    let fields = profile
        .map(|value| value.field_kinds.clone())
        .unwrap_or_else(|| GENERIC_OVERVIEW_FIELDS.map(str::to_owned).to_vec());
    let mut schema = json!({"kind":"paper_overview_unit_v1","schemaVersion":1,
        "profileId":"generic_overview_v1", "fields": fields.iter().enumerate().map(|(index, field)| {
            if index == 0 { json!({"field":field,"status":"filled","statements":[{
                "id":format!("{field}-1"),"text":"基于原文的陈述","epistemicRole":"source_paraphrase",
                "evidenceItemIds":["实际读取的来源 ID"],"evidenceQuotes":[{"evidenceItemId":"同一来源 ID","quote":"从该来源逐字复制的连续原文"}]
            }]}) } else { json!({"field":field,"status":"not_found","statements":[]}) }
        }).collect::<Vec<_>>()});
    if let Some(profile) = profile {
        if let Some(template) = &profile.paper_template {
            schema["profileId"] = json!("paper_template_v1");
            schema["paperTemplate"] = json!(template);
        } else {
            schema["profileId"] = json!("reviewed_profile_composition_v1");
            schema["profileRefs"] = json!(profile.profile_refs);
        }
    }
    schema
}

#[cfg(test)]
mod tests;
