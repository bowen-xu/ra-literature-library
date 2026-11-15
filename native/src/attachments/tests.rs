use super::*;
use research_workbench_native_sdk::{
    attachments::{RenameAttachmentInputV1, SaveReadingStateInputV1},
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
};
use serde_json::json;

fn view() -> serde_json::Value {
    json!({"schemaVersion":2,"pageIndex":0,"scale":{"kind":"page-fit"},
        "scrollMode":"vertical","spreadMode":"none"})
}

fn request(zoom: f64, raw: Option<String>) -> SaveReadingStateInputV1 {
    SaveReadingStateInputV1 {
        item_id: " raw item\0 ".into(),
        attachment_id: " raw attachment ".into(),
        page_index: i32::MIN,
        zoom: F64BitsV1::from_f64(zoom),
        view_state_json: raw,
    }
}

#[test]
fn name_uses_trimmed_unicode_scalars_without_rejecting_trimmed_edge_controls() {
    let name = format!("\n\u{2003}{}\t ", "文".repeat(255));
    assert_eq!(validate_name(&name).unwrap(), "文".repeat(255));
    assert!(validate_name(&"文".repeat(256)).is_err());
    assert!(validate_name(&"e\u{0301}".repeat(128)).is_err());
    assert_eq!(validate_name(" \u{200b}.pdf ").unwrap(), "\u{200b}.pdf");
    for bad in [
        "",
        "\u{2003}\n\t",
        "inside\ncontrol.pdf",
        "inside\0control.pdf",
    ] {
        assert_eq!(
            validate_name(bad),
            Err(AttachmentRejectionV1::InvalidAttachmentName)
        );
    }
}

#[test]
fn rename_preserves_request_and_leaves_ids_and_files_outside_pure_validation() {
    let original = AttachmentPrepareInputV1::Rename {
        request: RenameAttachmentInputV1 {
            item_id: String::new(),
            attachment_id: "\0".into(),
            display_name: "  Mixed Case.pdf \n".into(),
        },
    };
    let AttachmentPreparationV1::Ready { plan } = prepare(original.clone()) else {
        panic!("expected ready")
    };
    let AttachmentPlanV1::Rename {
        request,
        display_name,
    } = *plan
    else {
        panic!("expected rename")
    };
    assert_eq!(AttachmentPrepareInputV1::Rename { request }, original);
    assert_eq!(display_name, "Mixed Case.pdf");
    let bad = AttachmentPrepareInputV1::Rename {
        request: RenameAttachmentInputV1 {
            item_id: "item".into(),
            attachment_id: "attachment".into(),
            display_name: "\0".into(),
        },
    };
    assert_eq!(
        prepare(bad.clone()),
        AttachmentPreparationV1::Rejected {
            input: Box::new(bad),
            reason: AttachmentRejectionV1::InvalidAttachmentName,
        }
    );
}

#[test]
fn reader_json_keeps_original_modes_unknown_fields_and_integer_requirements() {
    for scale in [
        json!({"kind":"numeric","value":0.5}),
        json!({"kind":"numeric","value":3.0}),
        json!({"kind":"page-fit","value":null}),
        json!({"kind":"page-width"}),
        json!({"kind":"page-height"}),
        json!({"kind":"auto"}),
    ] {
        let mut value = view();
        value["scale"] = scale;
        value["extra"] = json!({"unrestricted":"x".repeat(8001)});
        value["pageIndex"] = json!(i64::MAX);
        assert!(valid_reader_view_state(&value));
    }
    for scroll in ["vertical", "horizontal", "wrapped", "page"] {
        for spread in ["none", "odd", "even"] {
            let mut value = view();
            value["scrollMode"] = json!(scroll);
            value["spreadMode"] = json!(spread);
            assert!(valid_reader_view_state(&value));
        }
    }
    for mutate in [
        |v: &mut serde_json::Value| v["schemaVersion"] = json!(2.0),
        |v: &mut serde_json::Value| v["pageIndex"] = json!(-1),
        |v: &mut serde_json::Value| v["pageIndex"] = json!(1.0),
        |v: &mut serde_json::Value| v["scale"] = json!({"kind":"numeric","value":3.0001}),
        |v: &mut serde_json::Value| v["scale"] = json!({"kind":"numeric","value":"1"}),
        |v: &mut serde_json::Value| v["scrollMode"] = json!("Vertical"),
        |v: &mut serde_json::Value| v["spreadMode"] = json!("unknown"),
    ] {
        let mut value = view();
        mutate(&mut value);
        assert!(!valid_reader_view_state(&value));
    }
}

#[test]
fn optional_json_none_is_distinct_from_null_and_original_bad_json_is_rejected() {
    assert_eq!(
        prepare_reading_state(1.0, None).unwrap().to_bits(),
        1_f64.to_bits()
    );
    for raw in ["null", "[]", "{}", "invalid", "{\"schemaVersion\":2}"] {
        assert_eq!(
            prepare_reading_state(1.0, Some(raw)),
            Err(AttachmentRejectionV1::InvalidReaderViewState)
        );
    }
}

#[test]
fn zoom_clamp_preserves_all_in_range_bits_and_the_original_boundaries() {
    for (bits, expected) in [
        (0x0000_0000_0000_0001, 0x3fe0_0000_0000_0000),
        (0x8000_0000_0000_0000, 0x3fe0_0000_0000_0000),
        (0x3fe0_0000_0000_0000, 0x3fe0_0000_0000_0000),
        (0x3fef_ffff_ffff_ffff, 0x3fef_ffff_ffff_ffff),
        (0x3ff0_0000_0000_0001, 0x3ff0_0000_0000_0001),
        (0x4007_ffff_ffff_ffff, 0x4007_ffff_ffff_ffff),
        (0x4008_0000_0000_0000, 0x4008_0000_0000_0000),
        (0x4008_0000_0000_0001, 0x4008_0000_0000_0000),
        (0x7fef_ffff_ffff_ffff, 0x4008_0000_0000_0000),
        (0xffef_ffff_ffff_ffff, 0x3fe0_0000_0000_0000),
    ] {
        let input = AttachmentPrepareInputV1::SaveReadingState {
            request: request(f64::from_bits(bits), None),
        };
        let AttachmentPreparationV1::Ready { plan } = prepare(input) else {
            panic!("expected ready")
        };
        let AttachmentPlanV1::SaveReadingState { bounded_zoom, .. } = *plan else {
            panic!("expected state")
        };
        assert_eq!(bounded_zoom.to_f64().to_bits(), expected);
    }
}

#[test]
fn nonfinite_zoom_is_rejected_without_changing_the_raw_bits_or_request() {
    for bits in [
        0x7ff0_0000_0000_0000,
        0xfff0_0000_0000_0000,
        0x7ff8_0000_0000_0042,
    ] {
        let input = AttachmentPrepareInputV1::SaveReadingState {
            request: request(f64::from_bits(bits), Some(view().to_string())),
        };
        assert_eq!(
            prepare(input.clone()),
            AttachmentPreparationV1::Rejected {
                input: Box::new(input),
                reason: AttachmentRejectionV1::InvalidReaderViewState,
            }
        );
    }
}

#[test]
fn state_preparation_preserves_raw_json_nulls_and_negative_sql_page_operand() {
    let raw = " \n{ \"schemaVersion\":2,\"pageIndex\":7,\"scale\":{\"kind\":\"auto\"},\"scrollMode\":\"page\",\"spreadMode\":\"odd\",\"extra\":null } \n";
    let original = request(f64::from_bits(0x3ff0_0000_0000_0001), Some(raw.into()));
    let input = AttachmentPrepareInputV1::SaveReadingState {
        request: original.clone(),
    };
    let AttachmentPreparationV1::Ready { plan } = prepare(input) else {
        panic!("expected ready")
    };
    let AttachmentPlanV1::SaveReadingState {
        request,
        bounded_zoom,
    } = *plan
    else {
        panic!("expected state")
    };
    assert_eq!(request, original);
    assert_eq!(request.page_index, i32::MIN);
    assert_eq!(request.view_state_json.as_deref(), Some(raw));
    assert_eq!(bounded_zoom, request.zoom);
}

#[test]
fn catalog_dispatch_uses_only_the_two_canonical_preparations() {
    for input in [
        AttachmentPrepareInputV1::Rename {
            request: RenameAttachmentInputV1 {
                item_id: "item".into(),
                attachment_id: "a".into(),
                display_name: " n ".into(),
            },
        },
        AttachmentPrepareInputV1::SaveReadingState {
            request: request(1.25, None),
        },
    ] {
        let expected = prepare(input.clone());
        let output = crate::catalog::dispatch(CatalogInput::PrepareLiteratureAttachment {
            input: Box::new(input),
        })
        .unwrap();
        assert_eq!(
            output.operation(),
            CatalogOperation::PrepareLiteratureAttachment
        );
        assert_eq!(
            output,
            CatalogOutput::LiteratureAttachmentPreparation {
                outcome: Box::new(expected)
            }
        );
    }
}
