use super::*;
use std::collections::BTreeMap;

fn item() -> PaperAiReadingContextItem {
    PaperAiReadingContextItem {
        id: "P1-T1".into(),
        paper_id: "论文".into(),
        attachment_id: "a".into(),
        content_sha256: "sha".into(),
        parse_run_id: "run".into(),
        raw_ref: "#/texts/0".into(),
        kind: "text".into(),
        label: None,
        page_index: Some(0),
        regions: vec![PaperAiReadingRegion {
            page_index: 0,
            rect: PaperAiReadingRect {
                x: 0.014283342571969617,
                y: 0.2,
                width: 0.8,
                height: 0.1,
            },
        }],
        charspan: Some([0, 3]),
        source_text_hash: None,
        text: Some("汉字 α".into()),
        table_json: Some(serde_json::json!({"z": "汉", "a": 1})),
    }
}

fn input() -> SnapshotProjectionInputV1 {
    SnapshotProjectionInputV1 {
        paper_id: "论文".into(),
        attachment_statuses: vec![PaperAiReadingAttachmentStatus {
            attachment_id: "a".into(),
            display_name: "PDF display name".into(),
            content_sha256: "sha".into(),
            parse_run_id: Some("run".into()),
            parse_status: "available".into(),
        }],
        context_items: vec![item()],
        image_hashes: BTreeMap::from([("P1-T1".into(), "image".into())]),
    }
}

fn digest_input(projection: &SnapshotProjectionV1) -> SnapshotDigestInputV1 {
    SnapshotDigestInputV1 {
        context_schema_version: projection.context_schema_version,
        paper_id: "论文".into(),
        attachments: projection.attachments.clone(),
        items: projection.items.clone(),
    }
}

#[test]
fn canonical_serialization_keeps_original_fields_unicode_nulls_and_twelve_decimal_digest() {
    let projection = project(&input()).unwrap();
    let digest_input = digest_input(&projection);
    let expected = r##"{"contextSchemaVersion":1,"paperId":"论文","attachments":[{"attachmentId":"a","contentSha256":"sha","parseRunId":"run","ordinal":0}],"items":[{"id":"P1-T1","attachmentId":"a","contentSha256":"sha","parseRunId":"run","rawRef":"#/texts/0","kind":"text","label":null,"pageIndex":0,"regions":[{"pageIndex":0,"rect":{"x":0.014283342572,"y":0.2,"width":0.8,"height":0.1}}],"charspan":[0,3],"sourceTextHash":null,"text":"汉字 α","tableJson":{"a":1,"z":"汉"},"imageContentSha256":"image"}]}"##;
    assert_eq!(canonical_json(&digest_input).unwrap(), expected);
    assert_eq!(
        projection.context_hash,
        "1384364ef3d51ddfc43d6eb10ab9a0c13923a648a4ed632badb74525c5b6bd92"
    );
    assert_eq!(
        projection.snapshot_id,
        format!("paper-context-{}", projection.context_hash)
    );
    assert_eq!(projection.items[0].regions[0].rect.x, 0.014283342571969617);
    let restored: SnapshotDigestInputV1 =
        serde_json::from_str(&serde_json::to_string(&digest_input).unwrap()).unwrap();
    assert_eq!(digest(&digest_input).unwrap(), digest(&restored).unwrap());
}

#[test]
fn projection_preserves_duplicate_attachment_order_lexical_items_and_exact_image_binding() {
    let mut input = input();
    input
        .attachment_statuses
        .push(input.attachment_statuses[0].clone());
    input.context_items[0].id = "P2-T1".into();
    let mut second = item();
    second.id = "P10-T1".into();
    input.context_items.push(second);
    let projection = project(&input).unwrap();
    assert_eq!(
        projection
            .attachments
            .iter()
            .map(|a| (&a.attachment_id, a.ordinal))
            .collect::<Vec<_>>(),
        [(&"a".to_owned(), 0), (&"a".to_owned(), 1)]
    );
    assert_eq!(
        projection
            .items
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>(),
        ["P10-T1", "P2-T1"]
    );
    assert!(
        projection
            .items
            .iter()
            .all(|item| item.image_content_sha256.is_none())
    );
    input.image_hashes.insert("P2-T1".into(), "matching".into());
    let changed = project(&input).unwrap();
    assert_ne!(projection.context_hash, changed.context_hash);
    assert_eq!(
        changed.items[1].image_content_sha256.as_deref(),
        Some("matching")
    );
    input.attachment_statuses[0].display_name = "renamed presentation only".into();
    assert_eq!(changed, project(&input).unwrap());
}

#[test]
fn unavailable_or_missing_parse_identity_keeps_original_rejection_and_empty_is_not_newly_rejected()
{
    let mut input = input();
    for (status, run) in [
        ("missing", Some("run".into())),
        ("available", None),
        ("stale", None),
    ] {
        input.attachment_statuses[0].parse_status = status.into();
        input.attachment_statuses[0].parse_run_id = run;
        assert_eq!(
            project(&input),
            Err(PaperContextProjectionError::InvalidInput(
                "只有完成 Docling 解析的附件才能冻结论文上下文".into(),
            ))
        );
    }
    input.attachment_statuses.clear();
    input.context_items.clear();
    assert!(project(&input).is_ok());
}

#[test]
fn digest_keeps_the_supplied_version_and_row_order_and_all_source_identity() {
    let projection = project(&input()).unwrap();
    let original = digest_input(&projection);
    let initial_hash = digest(&original).unwrap();
    let mut changed = original.clone();
    changed.context_schema_version = 2;
    assert_ne!(digest(&changed).unwrap(), initial_hash);
    changed = original.clone();
    changed.paper_id.push('2');
    assert_ne!(digest(&changed).unwrap(), initial_hash);
    changed = original.clone();
    changed.items[0].raw_ref.push('2');
    assert_ne!(digest(&changed).unwrap(), initial_hash);
    changed = original.clone();
    changed.items.push(changed.items[0].clone());
    changed.items[1].id = "earlier".into();
    let ordered = digest(&changed).unwrap();
    changed.items.reverse();
    assert_ne!(digest(&changed).unwrap(), ordered);
    changed = original;
    changed.attachments.push(changed.attachments[0].clone());
    changed.attachments[1].ordinal = 1;
    let ordered = digest(&changed).unwrap();
    changed.attachments.reverse();
    assert_ne!(digest(&changed).unwrap(), ordered);
}
