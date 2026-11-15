use std::{
    collections::{HashMap, HashSet},
    fmt::Write,
};

use serde::Serialize;
use serde_json::Value;

use research_workbench_native_sdk::research_export::{
    MAX_EXPORT_RECORDS, PreparedResearchExportV1, ResearchExportDatasetV1 as ResearchExportDataset,
    ResearchExportRejectionV1, ResearchExportSnapshotV1,
};
mod datasets;
pub use datasets::static_sql;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResearchExportBundle {
    schema_version: u32,
    application_version: String,
    exported_at: String,
    scope: &'static str,
    contains_ai_candidate_history: bool,
    object_count: usize,
    source_count: usize,
    record_count: usize,
    datasets: Vec<ResearchExportDataset>,
}

impl ResearchExportBundle {
    pub(crate) fn to_markdown(&self) -> String {
        let mut output = String::new();
        let _ = writeln!(output, "# Research Assistant 研究知识导出\n");
        let _ = writeln!(output, "- 导出时间：{}", self.exported_at);
        let _ = writeln!(output, "- 长期研究对象：{}", self.object_count);
        let _ = writeln!(output, "- 原文锚点：{}", self.source_count);
        let _ = writeln!(output, "- 全部结构化记录：{}", self.record_count);
        let _ = writeln!(
            output,
            "- 完整版本、证据关系和 AI 审查来历见 `manifest.json`。\n"
        );
        append_dataset_section(&mut output, self.dataset("claims"), "观点", &["statement"]);
        append_dataset_section(
            &mut output,
            self.dataset("notePages"),
            "笔记页面",
            &["title"],
        );
        self.append_reading_notes(&mut output);
        append_dataset_section(
            &mut output,
            self.dataset("structuredReadingUnits"),
            "结构化阅读单元",
            &["title", "body"],
        );
        append_dataset_section(
            &mut output,
            self.dataset("concepts"),
            "概念",
            &["label", "explanation", "disambiguation"],
        );
        append_dataset_section(
            &mut output,
            self.dataset("definitionClaims"),
            "定义主张",
            &["statement", "scopeNote"],
        );
        append_relation_section(&mut output, self.dataset("relationAssertions"));
        append_dataset_section(
            &mut output,
            self.dataset("referenceRecords"),
            "参考条目",
            &["rawText", "identityState", "semanticState"],
        );
        append_dataset_section(
            &mut output,
            self.dataset("evidenceMatrices"),
            "Evidence Matrix",
            &["title"],
        );
        append_dataset_section(
            &mut output,
            self.dataset("derivedResearchViews"),
            "派生研究视图",
            &["viewKind", "title", "scopeNote"],
        );
        output
    }

    fn dataset(&self, name: &str) -> &[Value] {
        self.datasets
            .iter()
            .find(|dataset| dataset.name == name)
            .map(|dataset| dataset.records.as_slice())
            .unwrap_or_default()
    }

    fn append_reading_notes(&self, output: &mut String) {
        let source_page_ids = self
            .dataset("readingNoteSources")
            .iter()
            .map(|source| text_field(source, "pageId"))
            .collect::<HashSet<_>>();
        let mut blocks_by_page: HashMap<&str, Vec<&Value>> = HashMap::new();
        for block in self.dataset("notePageBlocks") {
            blocks_by_page
                .entry(text_field(block, "pageId"))
                .or_default()
                .push(block);
        }
        let pages = self
            .dataset("notePages")
            .iter()
            .filter(|page| source_page_ids.contains(text_field(page, "id")))
            .collect::<Vec<_>>();
        let _ = writeln!(output, "## 阅读笔记（{}）\n", pages.len());
        for page in pages {
            let page_id = text_field(page, "id");
            let _ = writeln!(output, "### {} `{page_id}`\n", text_field(page, "title"));
            for block in blocks_by_page.get(page_id).into_iter().flatten() {
                if let Some(text) = non_empty_text(block, "plainText") {
                    let _ = writeln!(output, "{text}\n");
                }
            }
        }
    }
}

pub fn prepare(
    snapshot: ResearchExportSnapshotV1,
) -> Result<PreparedResearchExportV1, ResearchExportRejectionV1> {
    if snapshot.datasets.len() != datasets::NAMES.len()
        || !snapshot
            .datasets
            .iter()
            .zip(datasets::NAMES)
            .all(|(dataset, name)| dataset.name == *name)
    {
        return Err(ResearchExportRejectionV1::InvalidSnapshot);
    }
    let mut object_count = 0usize;
    let mut source_count = 0usize;
    let mut record_count = 0usize;
    for dataset in &snapshot.datasets {
        record_count = record_count.saturating_add(dataset.records.len());
        if record_count > MAX_EXPORT_RECORDS {
            return Err(ResearchExportRejectionV1::TooLarge);
        }
        if datasets::counts_as_object(&dataset.name) {
            object_count = object_count.saturating_add(dataset.records.len());
        }
        if dataset.name == "sourceAnchors" {
            source_count = dataset.records.len();
        }
    }
    let bundle = ResearchExportBundle {
        schema_version: 1,
        application_version: snapshot.application_version,
        exported_at: snapshot.exported_at,
        scope: "all_research_knowledge",
        contains_ai_candidate_history: true,
        object_count,
        source_count,
        record_count,
        datasets: snapshot.datasets,
    };
    let manifest_json = serde_json::to_string_pretty(&bundle).map_err(|error| {
        ResearchExportRejectionV1::Serialization {
            message: error.to_string(),
        }
    })?;
    let markdown = bundle.to_markdown();
    Ok(PreparedResearchExportV1 {
        exported_at: bundle.exported_at,
        manifest_json,
        markdown,
        object_count,
        source_count,
    })
}

fn append_dataset_section(output: &mut String, records: &[Value], title: &str, fields: &[&str]) {
    let _ = writeln!(output, "## {title}（{}）\n", records.len());
    for record in records {
        let id = text_field(record, "id");
        let parts = fields
            .iter()
            .filter_map(|field| non_empty_text(record, field))
            .collect::<Vec<_>>();
        let _ = writeln!(output, "- {} `{}`", parts.join(" — "), id);
    }
    output.push('\n');
}

fn append_relation_section(output: &mut String, records: &[Value]) {
    let _ = writeln!(output, "## 关系断言（{}）\n", records.len());
    for record in records {
        let _ = writeln!(
            output,
            "- {} — {} → {} `{}`",
            text_field(record, "subjectLabelSnapshot"),
            text_field(record, "predicateKind"),
            text_field(record, "objectLabelSnapshot"),
            text_field(record, "id"),
        );
    }
    output.push('\n');
}

fn non_empty_text<'a>(record: &'a Value, field: &str) -> Option<&'a str> {
    let value = record.get(field)?.as_str()?.trim();
    (!value.is_empty()).then_some(value)
}

fn text_field<'a>(record: &'a Value, field: &str) -> &'a str {
    record.get(field).and_then(Value::as_str).unwrap_or("")
}

#[cfg(test)]
mod tests;
