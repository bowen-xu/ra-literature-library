use super::*;
use research_workbench_native_sdk::{
    catalog::{CatalogInput, CatalogOperation, CatalogOutput},
    reference_records::ReferenceRecordPrepareInputV1,
};
use serde_json::json;

fn draft() -> ReferenceRecordDraft {
    serde_json::from_value(json!({
        "citingPaperId":"paper","sourceAnchorId":"source","rawText":" raw ",
        "fields":[],"parseState":"unparsed","identityState":"unverified",
        "semanticState":"unreviewed","changeReason":" reason "
    }))
    .unwrap()
}

fn field() -> ReferenceMetadataField {
    ReferenceMetadataField {
        name: "title".into(),
        value: " value ".into(),
        source_kind: "human".into(),
        confirmed_by_user: true,
    }
}

fn ready(draft: ReferenceRecordDraft) -> Box<ReferenceRecordPlanV1> {
    match prepare(draft) {
        ReferenceRecordPreparationV1::Ready { plan } => plan,
        rejected => panic!("expected ready: {rejected:?}"),
    }
}

#[test]
fn pure_prefix_preserves_fields_then_states_then_metadata_first_error() {
    let mut value = draft();
    value.raw_text = "\u{2003}\t ".into();
    value.parse_state = "unknown".into();
    value.fields = vec![ReferenceMetadataField {
        name: "unknown".into(),
        ..field()
    }];
    assert_eq!(
        validate_draft(&value),
        Err(ReferenceRecordRejectionV1::InvalidFields)
    );
    value.raw_text = "valid".into();
    assert_eq!(
        validate_draft(&value),
        Err(ReferenceRecordRejectionV1::InvalidStates)
    );
    value.parse_state = "parsed".into();
    assert_eq!(
        validate_draft(&value),
        Err(ReferenceRecordRejectionV1::InvalidMetadataFields)
    );
}

#[test]
fn parse_identity_and_semantic_states_keep_their_original_independence() {
    for parse in ["unparsed", "parsed", "failed"] {
        for identity in [
            "unverified",
            "verified_external",
            "ambiguous",
            "not_found",
            "matched_existing",
        ] {
            let mut value = draft();
            value.parse_state = parse.into();
            value.identity_state = identity.into();
            value.matched_item_id = (identity == "matched_existing").then(String::new);
            assert_eq!(validate_draft(&value), Ok(()));
            value.matched_item_id = if value.matched_item_id.is_some() {
                None
            } else {
                Some("item".into())
            };
            assert_eq!(
                validate_draft(&value),
                Err(ReferenceRecordRejectionV1::InvalidStates)
            );
        }
    }
    for kind in [
        "mentions",
        "uses_method",
        "supports",
        "opposes",
        "extends",
        "background",
    ] {
        let mut value = draft();
        value.semantic_state = "reviewed".into();
        value.usage_kind = Some(kind.into());
        value.usage_summary = " summary ".into();
        value.usage_anchor_id = Some(String::new());
        assert_eq!(validate_draft(&value), Ok(()));
        value.usage_anchor_id = None;
        assert_eq!(
            validate_draft(&value),
            Err(ReferenceRecordRejectionV1::InvalidStates)
        );
    }
}

#[test]
fn unreviewed_requires_exact_empty_usage_and_reviewed_requires_nonblank_summary() {
    for alter in [
        |v: &mut ReferenceRecordDraft| v.usage_summary = " ".into(),
        |v: &mut ReferenceRecordDraft| v.usage_kind = Some(String::new()),
        |v: &mut ReferenceRecordDraft| v.usage_anchor_id = Some(String::new()),
    ] {
        let mut value = draft();
        alter(&mut value);
        assert_eq!(
            validate_draft(&value),
            Err(ReferenceRecordRejectionV1::InvalidStates)
        );
    }
    let mut value = draft();
    value.semantic_state = "reviewed".into();
    value.usage_kind = Some("mentions".into());
    value.usage_summary = "\u{2003}".into();
    value.usage_anchor_id = Some("anchor".into());
    assert_eq!(
        validate_draft(&value),
        Err(ReferenceRecordRejectionV1::InvalidStates)
    );
}

#[test]
fn original_metadata_names_sources_ai_confirmation_and_duplicates_are_kept() {
    for name in ["title", "authors", "year", "doi"] {
        for source in [
            "reference_text",
            "external_metadata",
            "ai_inference",
            "human",
        ] {
            let mut value = draft();
            value.fields = vec![ReferenceMetadataField {
                name: name.into(),
                source_kind: source.into(),
                confirmed_by_user: source != "ai_inference",
                ..field()
            }];
            assert_eq!(validate_draft(&value), Ok(()));
        }
    }
    for fields in [
        vec![field(), field()],
        vec![ReferenceMetadataField {
            name: " title".into(),
            ..field()
        }],
        vec![ReferenceMetadataField {
            source_kind: "Human".into(),
            ..field()
        }],
        vec![ReferenceMetadataField {
            source_kind: "ai_inference".into(),
            ..field()
        }],
    ] {
        let mut value = draft();
        value.fields = fields;
        assert_eq!(
            validate_draft(&value),
            Err(ReferenceRecordRejectionV1::InvalidMetadataFields)
        );
    }
}

#[test]
fn budgets_count_original_unicode_scalars_before_trim_and_allow_nul_values() {
    let mut value = draft();
    value.raw_text = "文".repeat(8_000);
    value.change_reason = "因".repeat(120);
    value.fields = vec![ReferenceMetadataField {
        value: "字".repeat(2_000),
        ..field()
    }];
    assert_eq!(validate_draft(&value), Ok(()));
    value.raw_text.push(' ');
    assert_eq!(
        validate_draft(&value),
        Err(ReferenceRecordRejectionV1::InvalidFields)
    );
    value.raw_text = "raw".into();
    value.change_reason.push(' ');
    assert_eq!(
        validate_draft(&value),
        Err(ReferenceRecordRejectionV1::InvalidFields)
    );
    value.change_reason = "reason".into();
    value.fields[0].value.push(' ');
    assert_eq!(
        validate_draft(&value),
        Err(ReferenceRecordRejectionV1::InvalidMetadataFields)
    );
    value.fields[0].value = "\0".into();
    value.raw_text = "\0".into();
    value.semantic_state = "reviewed".into();
    value.usage_kind = Some("mentions".into());
    value.usage_anchor_id = Some("anchor".into());
    value.usage_summary = "述".repeat(4_000);
    assert_eq!(validate_draft(&value), Ok(()));
    value.usage_summary.push(' ');
    assert_eq!(
        validate_draft(&value),
        Err(ReferenceRecordRejectionV1::InvalidFields)
    );
}

#[test]
fn prepared_main_values_trim_but_snapshot_preserves_original_draft_and_field_order() {
    let mut value = draft();
    value.raw_text = "\u{2003} raw \t".into();
    value.change_reason = " reason ".into();
    value.semantic_state = "reviewed".into();
    value.usage_kind = Some("supports".into());
    value.usage_anchor_id = Some(" usage ".into());
    value.usage_summary = " summary ".into();
    value.fields = vec![
        ReferenceMetadataField {
            name: "doi".into(),
            value: " DOI ".into(),
            ..field()
        },
        field(),
    ];
    let plan = ready(value.clone());
    assert_eq!(plan.draft, value);
    assert_eq!(plan.raw_text, "raw");
    assert_eq!(plan.usage_summary, "summary");
    assert_eq!(plan.change_reason, "reason");
    assert_eq!(
        plan.fields_json,
        serde_json::to_string(&value.fields).unwrap()
    );
    assert_eq!(plan.snapshot_json, serde_json::to_string(&value).unwrap());
    let snapshot: ReferenceRecordDraft = serde_json::from_str(&plan.snapshot_json).unwrap();
    assert_eq!(snapshot, value);
    assert_eq!(snapshot.fields[0].name, "doi");
    assert_eq!(snapshot.fields[1].name, "title");
}

#[test]
fn preparation_never_eagerly_rejects_new_revision_or_resolves_database_identities() {
    let mut value = draft();
    value.expected_revision = Some(i64::MIN);
    value.citing_paper_id = String::new();
    value.source_anchor_id = "\0".into();
    assert_eq!(ready(value.clone()).draft, value);
    value.id = Some(String::new());
    value.expected_revision = Some(i64::MAX);
    value.identity_state = "matched_existing".into();
    value.matched_item_id = Some("missing".into());
    assert_eq!(ready(value.clone()).draft, value);
}

#[test]
fn catalog_dispatch_uses_the_single_canonical_prepare_and_keeps_safe_rejections() {
    let input = CatalogInput::PrepareReferenceRecord {
        input: Box::new(ReferenceRecordPrepareInputV1 { draft: draft() }),
    };
    let output = crate::catalog::dispatch(input).unwrap();
    assert_eq!(output.operation(), CatalogOperation::PrepareReferenceRecord);
    assert_eq!(
        output,
        CatalogOutput::ReferenceRecordPreparation {
            outcome: Box::new(prepare(draft())),
        }
    );
    let mut invalid = draft();
    invalid.raw_text = " ".into();
    assert_eq!(
        prepare(invalid),
        ReferenceRecordPreparationV1::Rejected {
            reason: ReferenceRecordRejectionV1::InvalidFields,
        }
    );
}
