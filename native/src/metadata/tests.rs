use super::*;
use research_workbench_native_sdk::catalog::CatalogCreator;
use research_workbench_native_sdk::catalog_save::{CatalogSaveOutcome, CatalogSaveRejection};

mod fixture;
use fixture::*;

#[test]
fn patch_rejections_are_deferred_and_normalization_preserves_role_tag_order_and_duplicates() {
    for (patch, error) in [
        (
            LiteratureMetadataPatch::Title(" \u{a0}\t".into()),
            MetadataRejectionV1::EmptyTitle {},
        ),
        (
            LiteratureMetadataPatch::ItemType(" document".into()),
            MetadataRejectionV1::UnsupportedType {
                item_type: " document".into(),
            },
        ),
    ] {
        assert_eq!(
            prepare_patch(&patch, None).unwrap(),
            DeferredMetadataPatchV1::Rejected { error }
        );
    }
    let creator = CatalogCreator {
        family_name: " A ".into(),
        given_name: " B ".into(),
        literal_name: " C ".into(),
        role: " raw role ".into(),
    };
    let DeferredMetadataPatchV1::Ready {
        patch: LiteratureMetadataPatch::Creators(creators),
        doi: None,
    } = prepare_patch(&LiteratureMetadataPatch::Creators(vec![creator]), None).unwrap()
    else {
        unreachable!()
    };
    assert_eq!(
        (
            creators[0].family_name.as_str(),
            creators[0].given_name.as_str(),
            creators[0].literal_name.as_str(),
            creators[0].role.as_str()
        ),
        ("A", "B", "C", " raw role ")
    );
    assert_eq!(
        prepare_patch(
            &LiteratureMetadataPatch::Tags(vec![" A ".into(), "".into(), "A".into(), "\t".into()]),
            None
        )
        .unwrap(),
        DeferredMetadataPatchV1::Ready {
            patch: LiteratureMetadataPatch::Tags(vec!["A".into(), "A".into()]),
            doi: None
        }
    );
    assert_eq!(
        prepare_patch(&LiteratureMetadataPatch::Doi("raw".into()), None),
        Err(MetadataPreparationError::MissingPreparedDoi)
    );
}

#[test]
fn confirmation_keeps_raw_names_and_original_sorted_dedup_and_error_messages() {
    assert_eq!(
        confirm_fields(&["title".into(), "doi".into(), "title".into()]).unwrap(),
        vec!["doi", "title"]
    );
    assert_eq!(
        confirm_fields(&[]),
        Err(MetadataRejectionV1::InvalidFields {
            reason: "至少选择一个字段".into()
        })
    );
    assert_eq!(
        confirm_fields(&["zzz".into(), " title".into(), "aaa".into()]),
        Err(MetadataRejectionV1::InvalidFields {
            reason: " title".into()
        })
    );
    let MetadataPreparationV1::Confirm {
        outcome: MetadataConfirmOutcomeV1::Ready { fields, .. },
    } = prepare(MetadataInputV1::Confirm {
        input: Box::new(MetadataConfirmInputV1 {
            item_id: "raw".into(),
            field_names: vec!["title".into()],
        }),
    })
    .unwrap()
    else {
        unreachable!()
    };
    assert_eq!(
        fields[0].missing_provenance,
        MetadataRejectionV1::InvalidFields {
            reason: "字段 title 没有可确认的来源".into()
        }
    );
}

#[test]
fn update_source_branches_and_actual_derivation_rule_are_declared_not_predicted() {
    let input = MetadataUpdateInputV1 {
        item_id: " raw ".into(),
        patch: LiteratureMetadataPatch::Title("  İSTANBUL  ".into()),
        doi: None,
    };
    let MetadataPreparationV1::Update { plan } = prepare(MetadataInputV1::Update {
        input: Box::new(input.clone()),
    })
    .unwrap() else {
        unreachable!()
    };
    assert_eq!(*plan.input, input);
    assert_eq!(
        plan.sources.unconfirmed,
        MetadataProvenanceV1 {
            source_kind: "user_edit".into(),
            source_reference: None,
            confirmed_by_user: false
        }
    );
    assert_eq!(
        plan.sources.otherwise,
        MetadataProvenanceV1 {
            source_kind: "user".into(),
            source_reference: None,
            confirmed_by_user: true
        }
    );
    assert_eq!(
        plan.derivation.title_rule,
        MetadataTitleRuleV1::UnicodeLowercase
    );
    assert_eq!(
        (
            plan.derivation.doi_reason.as_str(),
            plan.derivation.doi_confidence,
            plan.derivation.title_reason.as_str(),
            plan.derivation.title_confidence
        ),
        ("doi", 1.0, "normalized_title_year", 0.72)
    );
    assert!(
        serde_json::to_value(&plan.derivation)
            .unwrap()
            .get("normalizedTitle")
            .is_none()
    );
}

#[test]
fn full_apply_overrides_only_save_identity_and_compares_raw_values_not_trimmed_item() {
    let candidate = draft("Same");
    let mut raw = draft("  Same  ");
    raw.id = Some("forged".into());
    raw.source_kind = Some("forged".into());
    raw.tags = vec![" tag ".into()];
    let mut candidate = candidate;
    candidate.tags = vec!["tag".into()];
    let mut header = header();
    header.item_id = None;
    let input = MetadataFullApplyInputV1 {
        candidate_id: "raw candidate".into(),
        header,
        candidate,
        candidate_normalized_doi: "".into(),
        draft: raw,
        doi: doi(),
    };
    let MetadataPreparationV1::FullApply { plan } = prepare(MetadataInputV1::FullApply {
        input: Box::new(input.clone()),
    })
    .unwrap() else {
        unreachable!()
    };
    assert_eq!(*plan.input, input);
    let CatalogSaveOutcome::Planned { plan: save } = &plan.save else {
        unreachable!()
    };
    assert_eq!(save.item.id, None);
    assert_eq!(save.item.title, "Same");
    assert_eq!(save.tags, vec!["tag"]);
    assert_eq!(save.provenance.source_kind, "crossref");
    assert_eq!(plan.field_sources.len(), 17);
    for name in ["title", "tags"] {
        let source = &plan
            .field_sources
            .iter()
            .find(|v| v.field_name == name)
            .unwrap()
            .provenance;
        assert_eq!(source.source_kind, "user");
        assert_eq!(source.source_reference, Some("raw-reference".into()));
        assert!(source.confirmed_by_user);
    }
    assert_eq!(
        plan.field_sources
            .iter()
            .find(|v| v.field_name == "abstractText")
            .unwrap()
            .provenance
            .source_kind,
        "crossref"
    );
}

#[test]
fn full_save_rejection_stays_in_the_plan_for_the_original_begin_position() {
    let mut raw = draft(" ");
    raw.item_type = "bad-type".into();
    let input = MetadataFullApplyInputV1 {
        candidate_id: "".into(),
        header: header(),
        candidate: draft("old"),
        candidate_normalized_doi: "".into(),
        draft: raw,
        doi: doi(),
    };
    let MetadataPreparationV1::FullApply { plan } = prepare(MetadataInputV1::FullApply {
        input: Box::new(input),
    })
    .unwrap() else {
        unreachable!()
    };
    assert_eq!(
        plan.save,
        CatalogSaveOutcome::Rejected {
            reason: CatalogSaveRejection::UnsupportedType {
                item_type: "bad-type".into()
            }
        }
    );
}

#[test]
fn diff_uses_raw_creator_tag_and_title_values_but_the_shared_normalized_doi() {
    let mut current = item();
    current.tags = vec!["x".into()];
    current.doi = "10.1000/Example".into();
    current.creators = vec![CatalogCreator {
        family_name: "Author".into(),
        given_name: "Name".into(),
        literal_name: "".into(),
        role: "author".into(),
    }];
    let mut candidate = draft_from_item(&current);
    candidate.title = " Current ".into();
    candidate.tags = vec![" x ".into()];
    candidate.creators[0].family_name = " Author ".into();
    candidate.doi = " https://doi.org/10.1000/example ".into();
    let changes = diffs(
        Some(&current),
        &candidate,
        "10.1000/example",
        "10.1000/example",
    );
    assert_eq!(
        changes
            .iter()
            .map(|diff| diff.field_name.as_str())
            .collect::<Vec<_>>(),
        vec!["title", "creators", "tags"]
    );
    assert_eq!(changes[0].candidate_value, " Current ");
    assert!(changes[0].user_confirmed);
    assert_eq!(changes[2].candidate_value, r#"[" x "]"#);
    assert_eq!(
        draft_values(&candidate, "10.1000/example")
            .iter()
            .map(|(field, _)| *field)
            .collect::<Vec<_>>(),
        FIELD_NAMES
    );
}

#[test]
fn fields_prepare_only_selected_patches_in_input_order_and_keep_later_rejections_deferred() {
    let mut input = fields_input();
    input.candidate.title = " ".into();
    input.candidate.item_type = "bad".into();
    input.candidate.tags = vec![" X ".into(), "X".into()];
    input.decisions = vec![
        MetadataCandidateFieldDecision {
            field_name: "tags".into(),
            choice: MetadataCandidateChoice::Candidate,
        },
        MetadataCandidateFieldDecision {
            field_name: "title".into(),
            choice: MetadataCandidateChoice::Candidate,
        },
        MetadataCandidateFieldDecision {
            field_name: "itemType".into(),
            choice: MetadataCandidateChoice::Current,
        },
    ];
    let MetadataPreparationV1::FieldsApply { outcome } = prepare(MetadataInputV1::FieldsApply {
        input: Box::new(input.clone()),
    })
    .unwrap() else {
        unreachable!()
    };
    let MetadataFieldsApplyOutcomeV1::Ready {
        input: echo,
        decisions,
        ..
    } = *outcome
    else {
        unreachable!()
    };
    assert_eq!(*echo, input);
    assert!(
        matches!(&decisions[0],MetadataPreparedDecisionV1::Candidate { field_name,patch:DeferredMetadataPatchV1::Ready { patch:LiteratureMetadataPatch::Tags(tags),.. },provenance } if field_name=="tags"&&tags==&["X","X"]&&!provenance.confirmed_by_user)
    );
    assert!(
        matches!(&decisions[1],MetadataPreparedDecisionV1::Candidate { field_name,patch:DeferredMetadataPatchV1::Rejected { error:MetadataRejectionV1::EmptyTitle {} },.. } if field_name=="title")
    );
    assert!(
        matches!(&decisions[2],MetadataPreparedDecisionV1::Current { field_name,on_missing } if field_name=="itemType"&&on_missing.source_kind=="user"&&on_missing.source_reference.is_none()&&on_missing.confirmed_by_user)
    );
}

#[test]
fn exact_diff_coverage_rejects_duplicates_but_zero_diffs_and_current_invalid_candidate_are_valid() {
    let input = fields_input();
    let MetadataPreparationV1::FieldsApply { outcome } = prepare(MetadataInputV1::FieldsApply {
        input: Box::new(input.clone()),
    })
    .unwrap() else {
        unreachable!()
    };
    assert!(
        matches!(*outcome,MetadataFieldsApplyOutcomeV1::Ready { decisions,.. } if decisions.is_empty())
    );
    let mut invalid = input.clone();
    invalid.decisions = vec![
        MetadataCandidateFieldDecision {
            field_name: "title".into(),
            choice: MetadataCandidateChoice::Current
        };
        2
    ];
    let MetadataPreparationV1::FieldsApply { outcome } = prepare(MetadataInputV1::FieldsApply {
        input: Box::new(invalid),
    })
    .unwrap() else {
        unreachable!()
    };
    assert!(
        matches!(*outcome,MetadataFieldsApplyOutcomeV1::Rejected { error:MetadataRejectionV1::InvalidFields { reason },.. } if reason=="必须审阅候选中的全部差异字段")
    );
    let mut selected = input;
    selected.current.item_type = "old-unknown".into();
    selected.candidate.item_type = "old-unknown".into();
    selected.candidate.title = " ".into();
    selected.decisions = vec![MetadataCandidateFieldDecision {
        field_name: "title".into(),
        choice: MetadataCandidateChoice::Current,
    }];
    let MetadataPreparationV1::FieldsApply { outcome } = prepare(MetadataInputV1::FieldsApply {
        input: Box::new(selected),
    })
    .unwrap() else {
        unreachable!()
    };
    assert!(
        matches!(*outcome,MetadataFieldsApplyOutcomeV1::Ready { decisions,.. } if matches!(&decisions[0],MetadataPreparedDecisionV1::Current { .. }))
    );
}

#[test]
fn reject_keeps_null_and_some_empty_result_identity_without_decoding_a_candidate_draft() {
    for result in [None, Some("".into()), Some(" raw\0result ".into())] {
        let input = MetadataRejectInputV1 {
            candidate_id: " raw candidate ".into(),
            import_result_id: result,
        };
        let MetadataPreparationV1::Reject { plan } = prepare(MetadataInputV1::Reject {
            input: Box::new(input.clone()),
        })
        .unwrap() else {
            unreachable!()
        };
        assert_eq!(*plan.input, input);
        assert_eq!(plan.zero_affected, MetadataRejectionV1::NotFound {});
    }
}
