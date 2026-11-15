use super::*;
use research_workbench_native_sdk::{
    analysis_workflow::{overview_task::OverviewTaskInputV1, wire::*},
    generation::evidence::AttachmentEvidence,
    paper_context_wire::{decode_payload, encode_payload},
};

fn attachment() -> AttachmentEvidence {
    AttachmentEvidence {
        paper_id: "paper".into(),
        paper_title: "论文 Ω".into(),
        content_sha256: "a".repeat(64),
        index_state: "completed".into(),
    }
}

#[test]
fn page_publication_rows_keep_original_keys_context_and_wire_source_binding() {
    let attachment = attachment();
    let pages = vec![(0, "Methods. evidence Ω".into())];
    let sources = pages::select_pages(&attachment, "selected", &pages).unwrap();
    let rows = pages::prepare_rows(&sources);
    assert_eq!(rows[0].source, sources[0]);
    assert_eq!(rows[0].citation_key, "ev-page-1");
    assert_eq!(
        rows[0].context,
        format!(
            "{}{}{}",
            sources[0].quote_prefix, sources[0].quote_exact, sources[0].quote_suffix
        )
    );
    let input = WorkflowInputV1::PageSources {
        attachment_id: "selected".into(),
        attachment,
        pages,
    };
    let decision = WorkflowDecisionV1::PageSources {
        result: Ok(rows.clone()),
    };
    assert!(input.matches_decision(&decision));
    let mut changed = rows.clone();
    changed[0].source.paper_id = "another-paper".into();
    assert!(!input.matches_decision(&WorkflowDecisionV1::PageSources {
        result: Ok(changed)
    }));
    let mut changed = rows.clone();
    changed[0].source.content_sha256 = "b".repeat(64);
    assert!(!input.matches_decision(&WorkflowDecisionV1::PageSources {
        result: Ok(changed)
    }));
    assert!(!input.matches_decision(&WorkflowDecisionV1::PageSources {
        result: Ok(vec![rows[0].clone(); 11])
    }));
}

#[test]
fn original_page_limits_order_quotes_and_preview_json_are_preserved() {
    let attachment = attachment();
    let input = (0..30)
        .map(|index| {
            (
                index,
                format!(
                    "Page {index}. Methods. Results. Conclusion. {}",
                    "研究 evidence ".repeat(250)
                ),
            )
        })
        .collect::<Vec<_>>();
    let sources = pages::select_pages(&attachment, "attachment", &input).unwrap();
    assert_eq!(sources.len(), 10);
    assert_eq!(
        sources
            .iter()
            .map(|item| item.page_index)
            .collect::<Vec<_>>(),
        (0..10).collect::<Vec<_>>()
    );
    let previews = pages::preview_sources(&sources);
    for (index, item) in previews.iter().enumerate() {
        assert_eq!(item.citation_key, format!("ev-page-{}", index + 1));
        assert!(item.quote_exact.chars().count() <= 1200);
        assert!(item.context_text.chars().count() <= 1520);
        assert_eq!(item.page_label, Some((index + 1).to_string()));
    }
    assert!(
        serde_json::to_string(&previews[0])
            .unwrap()
            .starts_with("{\"citationKey\":\"ev-page-1\",\"anchorId\":\"ai-overview-")
    );
    let wire = encode_payload(&previews).unwrap();
    assert_eq!(decode_payload::<Vec<research_workbench_native_sdk::generation::evidence::AiEvidencePreview>>(&wire).unwrap(),previews);
}

#[test]
fn attachment_and_page_rejections_keep_the_original_categories() {
    assert_eq!(
        pages::validate_attachment(None).unwrap_err().to_string(),
        "找不到论文概要对应的 PDF 附件"
    );
    let mut attachment = attachment();
    attachment.index_state = "pending".into();
    assert_eq!(
        pages::validate_attachment(Some(&attachment))
            .unwrap_err()
            .to_string(),
        "请先打开 PDF，等待页文本索引完成后再起草概要"
    );
    attachment.index_state = "completed".into();
    assert!(pages::validate_attachment(Some(&attachment)).is_ok());
    assert_eq!(
        pages::select_pages(&attachment, "attachment", &[])
            .unwrap_err()
            .to_string(),
        "PDF 页文本索引为空，无法建立可核验概要"
    );
}

#[test]
fn task_and_page_wire_reject_wrong_scope_and_output_family() {
    let input = OverviewTaskInputV1 {
        paper_id: "paper".into(),
        attachment_ids: vec!["attachment".into()],
        selection_revision: 1,
        template: None,
        model_selection: None,
    };
    let task = crate::analysis_workflow::overview_task::task(&input);
    let request = WorkflowInputV1::OverviewTask { input };
    assert!(request.matches_decision(&WorkflowDecisionV1::OverviewTask {
        draft_cbor_base64: encode_payload(&task).unwrap()
    }));
    let mut altered = task.clone();
    altered.scope_items[0].parent_object_id = Some("other".into());
    assert!(
        !request.matches_decision(&WorkflowDecisionV1::OverviewTask {
            draft_cbor_base64: encode_payload(&altered).unwrap()
        })
    );
    let mut altered = task;
    altered.base_candidate_id = Some("other".into());
    assert!(
        !request.matches_decision(&WorkflowDecisionV1::OverviewTask {
            draft_cbor_base64: encode_payload(&altered).unwrap()
        })
    );
    let attachment = attachment();
    let sources = pages::select_pages(&attachment, "attachment", &[(0, "摘要 Ω".into())]).unwrap();
    let previews = pages::preview_sources(&sources);
    let request = WorkflowInputV1::PagePreview {
        attachment_id: "attachment".into(),
        attachment,
        pages: vec![(0, "摘要 Ω".into())],
    };
    assert!(request.matches_decision(&WorkflowDecisionV1::PagePreview {
        result: Ok(previews.clone())
    }));
    let mut altered = previews;
    altered[0].attachment_id = "other".into();
    assert!(!request.matches_decision(&WorkflowDecisionV1::PagePreview {
        result: Ok(altered)
    }));
    assert!(!request.matches_decision(&WorkflowDecisionV1::Validated { rejection: None }));
}
