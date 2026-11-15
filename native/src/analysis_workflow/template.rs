//! Original template policy over Core-owned observations, with the same lazy stages.
use research_workbench_native_sdk::{
    analysis_workflow::{AnalysisWorkflowError as Error, template::*},
    candidate_contracts::{
        AiOverviewProfileContext, PaperPortraitPayload, PaperTemplateSnapshot,
        valid_template_snapshot,
    },
};
#[cfg(test)]
mod tests;

pub fn decide(input: &TemplateInputV1) -> TemplateDecisionV1 {
    match resolve(input) {
        Ok(Some(profile)) => TemplateDecisionV1::Resolved { profile },
        Ok(None) => TemplateDecisionV1::Verified {},
        Err(error) => TemplateDecisionV1::Rejected { error },
    }
}

pub fn resolve(input: &TemplateInputV1) -> Result<Option<AiOverviewProfileContext>, Error> {
    match input {
        TemplateInputV1::LegacyAvailability { managed_resources } => {
            if *managed_resources {
                return Err(Error::InvalidInput(
                    "旧画像模板标识仅用于历史读取；请先确认或采用已发布的资源模板，再开始新提取"
                        .into(),
                ));
            }
            Ok(None)
        }
        TemplateInputV1::LegacyIdentity { reference, latest } => {
            if latest.as_ref() != Some(&(reference.id().to_owned(), reference.revision())) {
                return Err(Error::InvalidInput(
                    "本文画像模板不可用或已有新版本，请重新载入".into(),
                ));
            }
            Ok(None)
        }
        TemplateInputV1::LegacyContent {
            paper_id,
            reference,
            current_revision,
            evidence,
            revisions,
        } => {
            if *current_revision != reference.revision()
                || evidence.is_empty()
                || evidence.iter().any(|source| {
                    source.paper_id != *paper_id
                        || matches!(source.current_anchor_status.as_str(), "stale" | "missing")
                })
            {
                return Err(Error::InvalidInput(
                    "画像来源已失效或不属于当前文献，请重新核对".into(),
                ));
            }
            let payload = revisions
                .iter()
                .find(|revision| revision.revision == reference.revision())
                .ok_or(Error::TemporaryUnavailable)?;
            let portrait: PaperPortraitPayload = serde_json::from_value(payload.payload.clone())
                .map_err(|_| Error::TemporaryUnavailable)?;
            context(
                paper_id,
                reference.revision(),
                PaperTemplateSnapshot {
                    reference: reference.clone(),
                    fields: portrait.template,
                },
                "本文模板定义无效",
            )
            .map(Some)
        }
        TemplateInputV1::ResourceBinding {
            reference, binding, ..
        } => {
            let (id, revision) = binding
                .as_ref()
                .ok_or_else(|| Error::InvalidInput("请先采用阅读模板".into()))?;
            if id != reference.id() || *revision != reference.revision() {
                return Err(Error::InvalidInput(
                    "本文采用的模板版本已变化，请重新载入".into(),
                ));
            }
            Ok(None)
        }
        TemplateInputV1::ResourceContent {
            paper_id,
            reference,
            selection_revision,
            raw,
        } => {
            let value: serde_json::Value =
                serde_json::from_str(raw).map_err(|_| Error::TemporaryUnavailable)?;
            let mut fields = value["fields"].clone();
            if let Some(fields) = fields.as_array_mut() {
                for field in fields {
                    field["claimIds"] = serde_json::json!([]);
                }
            }
            let snapshot = PaperTemplateSnapshot {
                reference: reference.clone(),
                fields: serde_json::from_value(fields)
                    .map_err(|_| Error::InvalidInput("阅读模板字段无效".into()))?,
            };
            context(paper_id, *selection_revision, snapshot, "阅读模板快照无效").map(Some)
        }
    }
}

fn context(
    paper_id: &str,
    selection_revision: i64,
    template: PaperTemplateSnapshot,
    invalid: &str,
) -> Result<AiOverviewProfileContext, Error> {
    if !valid_template_snapshot(&template) {
        return Err(Error::InvalidInput(invalid.into()));
    }
    Ok(AiOverviewProfileContext {
        paper_id: paper_id.into(),
        selection_revision,
        profile_refs: vec![],
        field_kinds: template
            .fields
            .iter()
            .map(|field| field.id.clone())
            .collect(),
        paper_template: Some(template),
    })
}
