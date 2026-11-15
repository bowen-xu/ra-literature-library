use super::*;
use serde_json::json;

#[test]
fn context_items_keep_docling_identity_and_normalized_regions() {
    let run = ContextParseRunV1 {
        id: "run-1".to_owned(),
        json_content: json!({
            "pages": { "1": { "page_no": 1, "size": { "width": 200.0, "height": 400.0 } } },
            "texts": [{
                "self_ref": "#/texts/0", "label": "paragraph", "text": "hello world",
                "prov": [{ "page_no": 1, "bbox": { "l": 20.0, "t": 40.0, "r": 120.0, "b": 80.0, "coord_origin": "TOPLEFT" }, "charspan": [0, 5] }]
            }],
            "tables": [{
                "self_ref": "#/tables/0", "data": { "grid": [["A"]] },
                "prov": [{ "page_no": 1, "bbox": { "l": 10.0, "t": 100.0, "r": 190.0, "b": 180.0, "coord_origin": "TOPLEFT" } }]
            }],
            "pictures": [{
                "self_ref": "#/pictures/0",
                "prov": [{ "page_no": 1, "bbox": { "l": 50.0, "t": 200.0, "r": 150.0, "b": 300.0, "coord_origin": "TOPLEFT" } }]
            }]
        }),
    };
    let items = build_context_items("paper", "att", &"a".repeat(64), &run, 1);
    assert_eq!(items.len(), 3);
    assert_eq!(items[0].id, "P1-T1");
    assert_eq!(items[1].id, "P1-TABLE1");
    assert_eq!(items[2].id, "P1-F1");
    assert_eq!(items[0].regions[0].rect.x, 0.1);
    assert_eq!(items[0].charspan, Some([0, 5]));
    assert!(items[1].table_json.is_some());
}

fn attachment(id: &str, parse: Option<ContextParseRunV1>, stale: bool) -> ContextAttachmentV1 {
    ContextAttachmentV1 {
        id: id.to_owned(),
        display_name: format!("{id}.pdf"),
        content_sha256: "a".repeat(64),
        parse,
        has_stale_parse: stale,
    }
}

fn provenance() -> Value {
    json!([{"page_no": 1, "bbox": {"l": 20, "t": 40, "r": 120, "b": 80}}])
}

fn document() -> Value {
    json!({"pages": {"1": {"size": {"width": 200, "height": 400}}}})
}

#[test]
fn explicit_attachment_duplicates_and_unavailable_statuses_keep_original_ordinals() {
    let mut doc = document();
    doc["texts"] = json!([{"text": " α\nβ\u{a0}漢字 ", "prov": provenance()}]);
    doc["pictures"] = json!([{"label": "figure", "prov": provenance()}]);
    let parsed = attachment(
        "same",
        Some(ContextParseRunV1 {
            id: "parse".into(),
            json_content: doc,
        }),
        true,
    );
    let prepared = build(&PaperContextBuildInputV1 {
        paper_id: "paper".into(),
        attachments: vec![
            parsed.clone(),
            attachment("stale", None, true),
            parsed,
            attachment("missing", None, false),
        ],
    });
    assert_eq!(
        prepared
            .attachment_statuses
            .iter()
            .map(|s| s.parse_status.as_str())
            .collect::<Vec<_>>(),
        ["available", "stale", "available", "missing"]
    );
    assert_eq!(
        prepared
            .context_items
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>(),
        ["P1-T1", "P1-F1", "P3-T1", "P3-F1"]
    );
    assert_eq!(prepared.context_items[0].text.as_deref(), Some("α β 漢字"));
    assert_eq!(
        prepared.context_items[0].source_text_hash,
        Some(hash_text("α β 漢字"))
    );
    assert_eq!(prepared.context_items[0].raw_ref, "#/texts/0");
    assert_eq!(
        (
            prepared.text_item_count,
            prepared.table_item_count,
            prepared.picture_item_count
        ),
        (2, 0, 2)
    );
    assert_eq!(
        prepared
            .image_requests
            .iter()
            .map(|image| image.context_item_id.as_str())
            .collect::<Vec<_>>(),
        ["P1-F1", "P3-F1"]
    );
    assert_eq!(
        prepared.image_requests[0].regions,
        prepared.context_items[1].regions
    );
}

#[test]
fn all_collections_preserve_order_fallback_refs_table_hash_and_skipped_ordinals() {
    let mut doc = document();
    for (collection, _, _) in ITEM_COLLECTIONS.iter().rev() {
        doc[*collection] = json!([
            {"text": "no location"},
            {"text": "value", "prov": provenance()},
            {"orig": " fallback ", "prov": provenance()}
        ]);
    }
    doc["tables"][1]["text"] = Value::Null;
    doc["tables"][1]["data"] = json!({"z": "漢", "a": 2});
    doc["tables"][2]["data"] = json!({"text": "data text"});
    let items = build_context_items(
        "paper",
        "attachment",
        "hash",
        &ContextParseRunV1 {
            id: "run".into(),
            json_content: doc,
        },
        2,
    );
    assert_eq!(items.len(), 16);
    assert_eq!(
        items
            .iter()
            .step_by(2)
            .map(|item| item.kind.as_str())
            .collect::<Vec<_>>(),
        [
            "text",
            "table",
            "picture",
            "group",
            "key_value",
            "form",
            "field",
            "field_region"
        ]
    );
    assert_eq!(items[0].id, "P2-T1");
    assert_eq!(items[0].raw_ref, "#/texts/1");
    assert_eq!(items[1].text.as_deref(), Some("fallback"));
    assert_eq!(
        items[2].source_text_hash,
        Some(hash_text("{\"a\":2,\"z\":\"漢\"}"))
    );
    assert_eq!(items[2].table_json, Some(json!({"a": 2, "z": "漢"})));
    // The original text/orig/data precedence uses orig before data.text.
    assert_eq!(items[3].text.as_deref(), Some("fallback"));
    assert_eq!(items[14].id, "P2-REGION1");
}

#[test]
fn geometry_keeps_bottom_origin_clamping_page_lookup_and_first_span_rules() {
    let doc = json!({"pages": [{"page_no": 2, "size": {"width": 200, "height": 400}}]});
    let item = json!({"prov": [
        {"page_no": 0, "charspan": [2, 7], "bbox": {"l": 0, "t": 0, "r": 1, "b": 1}},
        {"page_no": 2, "bbox": {"l": 220, "t": 300, "r": -20, "b": 200, "coord_origin": "BOTTOMLEFT"}},
        {"page_no": 2, "bbox": {"l": 20, "t": 20, "r": 20, "b": 40}}
    ]});
    assert_eq!(
        item_regions(&doc, &item),
        vec![PaperAiReadingRegion {
            page_index: 1,
            rect: PaperAiReadingRect {
                x: 0.0,
                y: 0.25,
                width: 1.0,
                height: 0.25
            },
        }]
    );
    assert_eq!(charspan(&item), Some([2, 7]));
    assert_eq!(
        charspan(&json!({"prov": [{"charspan": [0, 4_294_967_296_u64]}]})),
        None
    );
    assert_eq!(
        normalize_bbox(&json!({"l": 1, "t": 1, "r": 3, "b": 3}), (0.0, 100.0)),
        None
    );
    assert_eq!(
        text_content(&json!({"text": "  ", "orig": "not selected"})),
        None
    );
    assert_eq!(
        text_content(
            &json!({"text": null, "orig": "ignored", "data": {"text": " fallback\nvalue "}})
        ),
        Some("fallback value".into())
    );
}
