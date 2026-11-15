use super::field;
use research_workbench_native_sdk::{
    candidate_contracts::PaperOverviewPayload, candidate_review::contracts::AiCandidate,
    paper_confirmation::field::FieldAnchorV1,
};
use serde_json::json;

pub(super) fn sample() -> (AiCandidate, PaperOverviewPayload) {
    let overview: PaperOverviewPayload = serde_json::from_value(json!({
        "kind":"paper_overview_unit_v1","schemaVersion":1,"profileId":"generic_overview_v1",
        "fields":[{"field":"approach","status":"filled","statements":[{
            "id":"s1","text":"  Original method Ω  ","epistemicRole":"source_paraphrase",
            "evidenceItemIds":["ev"],"evidenceQuotes":[{"evidenceItemId":"ev","quote":"唯一"}]
        }]}]
    }))
    .unwrap();
    let candidate = serde_json::from_value(json!({
        "id":"candidate","runId":"run","providerId":"provider","modelId":"model",
        "candidateKind":"paper_overview_unit_v1","schemaVersion":1,"currentRevision":1,
        "reviewState":"unreviewed","validationStatus":"valid","originalPayloadHash":"hash",
        "createdAt":"old","updatedAt":"old",
        "evidenceBundle":{"id":"bundle","runId":"run","scopeHash":"hash",
            "retrievalConfigVersion":"v1","validationStatus":"valid","createdAt":"old","items":[{
                "id":"item","citationKey":"ev","ordinal":0,"anchorId":"anchor","paperId":"paper",
                "paperTitle":"Title","attachmentId":"attachment","contentSha256":"hash","pageIndex":0,
                "pageLabel":"1","quoteExact":"前文唯一后文","quotePrefix":"前".repeat(180),
                "quoteSuffix":"后".repeat(180),"contextText":"Context","relationKind":"direct_quote",
                "validationStatus":"valid","currentAnchorStatus":"resolved","createdAt":"old"
            }]},
        "revisions":[{"id":"revision","revision":1,"payload":overview,"payloadHash":"hash",
            "editorKind":"ai","changeReason":"","createdAt":"old"}],
        "decisions":[],"attentionFeedback":[],"suggestionItemDecisions":[],"citationAssessments":[],
        "inspectedEvidenceItemIds":[],"overviewFieldConfirmations":[],"summaryVersions":[]
    })).unwrap();
    (candidate, overview)
}

#[test]
fn field_plan_keeps_literal_unicode_context_and_defers_later_anchor_errors() {
    let (candidate, mut overview) = sample();
    let mut second = overview.fields[0].statements[0].clone();
    second.id = "s2".into();
    second.evidence_item_ids = vec!["unknown".into()];
    overview.fields[0].statements.push(second);
    let plan = field::plan(&candidate, &overview, &overview.fields[0]);
    assert_eq!(plan.anchors.len(), 2);
    let FieldAnchorV1::Quoted {
        quote,
        prefix,
        suffix,
        ..
    } = plan.anchors[0].as_ref().unwrap()
    else {
        panic!("literal quote")
    };
    assert_eq!(quote, "唯一");
    assert_eq!(prefix.chars().count(), 160);
    assert_eq!(suffix.chars().count(), 160);
    assert!(prefix.ends_with("前文"));
    assert!(suffix.starts_with("后文"));
    assert_eq!(
        plan.anchors[1].as_ref().unwrap_err().to_string(),
        "字段引用了未知证据"
    );
    let unit = plan.unit.unwrap();
    assert_eq!(unit.body, "Original method Ω\n\nOriginal method Ω");
    assert_eq!(unit.title, "结构化阅读 · 研究方法");
    assert_eq!(unit.decision_kind, "ai_unchanged");
    assert!(plan.hash.is_ok());
}

#[test]
fn repeated_quote_context_and_full_source_dedup_keep_original_identity() {
    let (mut candidate, mut overview) = sample();
    candidate.evidence_bundle.items[0].quote_exact = "唯一与唯一".into();
    let field = &mut overview.fields[0];
    field.statements[0].evidence_item_ids.push("ev".into());
    let anchors = field::anchors(&candidate, field);
    assert_eq!(anchors.len(), 1);
    let FieldAnchorV1::Quoted { prefix, suffix, .. } = anchors[0].as_ref().unwrap() else {
        panic!("quote")
    };
    assert!(prefix.is_empty());
    assert!(suffix.is_empty());
    field.statements[0].evidence_quotes = None;
    assert_eq!(
        field::anchors(&candidate, field),
        vec![Ok(FieldAnchorV1::Existing {
            id: "anchor".into()
        })]
    );
    field.statements[0].evidence_quotes = Some(vec![
        serde_json::from_value(json!({"evidenceItemId":"ev","quote":"absent"})).unwrap(),
    ]);
    assert_eq!(
        field::anchors(&candidate, field)[0]
            .as_ref()
            .unwrap_err()
            .to_string(),
        "字段摘录不是原文的连续片段"
    );
}

#[test]
fn field_editor_tracks_actual_changes_and_preserves_late_revision_errors() {
    let (mut candidate, mut overview) = sample();
    let mut human = candidate.revisions[0].clone();
    human.revision = 2;
    human.editor_kind = "human".into();
    candidate.revisions.push(human);
    let plan = field::plan(&candidate, &overview, &overview.fields[0]);
    assert_eq!(plan.unit.unwrap().decision_kind, "ai_unchanged");
    overview.fields[0].statements[0].text = "Human method".into();
    candidate.revisions[1].payload = serde_json::to_value(&overview).unwrap();
    let plan = field::plan(&candidate, &overview, &overview.fields[0]);
    let unit = plan.unit.unwrap();
    assert_eq!(unit.decision_kind, "human_edited");
    assert_eq!(unit.provenance_kind, "ai_accepted_after_edit");
    candidate.revisions[1].payload["fields"] = json!([]);
    let plan = field::plan(&candidate, &overview, &overview.fields[0]);
    assert!(plan.anchors[0].is_ok());
    assert_eq!(plan.unit.unwrap_err().to_string(), "候选修订缺少结构化字段");
    assert!(plan.hash.is_ok());
}
