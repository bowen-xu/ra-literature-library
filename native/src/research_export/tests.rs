use super::*;
use serde_json::json;

fn snapshot() -> ResearchExportSnapshotV1 {
    ResearchExportSnapshotV1 {
        application_version: "0.7.6".into(),
        exported_at: "2026-11-13T00:00:00.000Z".into(),
        datasets: datasets::NAMES
            .iter()
            .map(|name| ResearchExportDataset {
                name: (*name).into(),
                records: Vec::new(),
            })
            .collect(),
    }
}
fn rows<'a>(snapshot: &'a mut ResearchExportSnapshotV1, name: &str) -> &'a mut Vec<Value> {
    &mut snapshot
        .datasets
        .iter_mut()
        .find(|dataset| dataset.name == name)
        .unwrap()
        .records
}

#[test]
fn original_manifest_scope_counts_and_reading_markdown_are_preserved() {
    let mut source = snapshot();
    rows(&mut source, "claims").push(json!({"id":"claim", "statement":" Claim Ω "}));
    rows(&mut source, "notePages").push(json!({"id":"page", "title":"Reading document"}));
    rows(&mut source, "notePageBlocks")
        .push(json!({"pageId":"page", "plainText":"Reading note Ω"}));
    rows(&mut source, "readingNoteSources").push(json!({"pageId":"page"}));
    rows(&mut source, "sourceAnchors").push(json!({"id":"anchor", "quoteExact":"Quote Ω"}));
    let result = prepare(source.clone()).unwrap();
    let manifest: Value = serde_json::from_str(&result.manifest_json).unwrap();
    assert_eq!(manifest["schemaVersion"], 1);
    assert_eq!(manifest["applicationVersion"], "0.7.6");
    assert_eq!(manifest["exportedAt"], source.exported_at);
    assert_eq!(manifest["scope"], "all_research_knowledge");
    assert_eq!(manifest["containsAiCandidateHistory"], true);
    assert_eq!(manifest["objectCount"], 2);
    assert_eq!(manifest["sourceCount"], 1);
    assert_eq!(manifest["recordCount"], 5);
    assert_eq!(
        manifest["datasets"],
        serde_json::to_value(source.datasets).unwrap()
    );
    assert_eq!(result.object_count, 2);
    assert_eq!(result.source_count, 1);
    assert!(result.markdown.contains("- Claim Ω "));
    assert!(result.markdown.contains("## 阅读笔记（1）"));
    assert_eq!(result.markdown.matches("Reading note Ω").count(), 1);
}

#[test]
fn fixed_dataset_scope_and_original_record_budget_are_enforced() {
    let mut source = snapshot();
    source.datasets[0].name = "providerSettings".into();
    assert_eq!(
        prepare(source),
        Err(ResearchExportRejectionV1::InvalidSnapshot)
    );
    let mut source = snapshot();
    rows(&mut source, "claims").resize(MAX_EXPORT_RECORDS + 1, Value::Null);
    assert_eq!(prepare(source), Err(ResearchExportRejectionV1::TooLarge));
}
