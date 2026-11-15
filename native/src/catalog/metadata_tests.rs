use super::*;
use research_workbench_native_sdk::catalog::CatalogOperation;
use research_workbench_native_sdk::catalog_save::CatalogDraft;
use research_workbench_native_sdk::metadata::*;
use serde_json::{Value, json};

fn inputs() -> Vec<MetadataInputV1> {
    let draft: CatalogDraft =
        serde_json::from_value(json!({"itemType":"document","title":" Current "})).unwrap();
    let mut item = serde_json::to_value(&draft).unwrap();
    item.as_object_mut().unwrap().remove("sourceKind");
    for (name, value) in [
        ("id", json!("paper")),
        ("readingStatus", json!("unread")),
        ("attachments", json!([])),
        ("projectIds", json!([])),
        ("metadataSources", json!([])),
        ("createdAt", json!("raw-created")),
        ("updatedAt", json!("raw-updated")),
    ] {
        item[name] = value;
    }
    let header = json!({"itemId":null,"sourceKind":"crossref","sourceReference":" raw ","importResultId":""});
    let doi = json!({"display":"","normalized":""});
    [
        json!({"kind":"update","input":{"itemId":" raw\u{0000}ID ","patch":{"fieldName":"title","value":" raw "},"doi":null}}),
        json!({"kind":"confirm","input":{"itemId":"paper","fieldNames":["title","doi","title"]}}),
        json!({"kind":"fullApply","input":{"candidateId":"candidate","header":header,"candidate":draft,"candidateNormalizedDoi":"","draft":draft,"doi":doi}}),
        json!({"kind":"fieldsApply","input":{"candidateId":"candidate","header":header,"candidate":draft,"current":item,"candidateDoi":doi,"currentNormalizedDoi":"","decisions":[],"candidateTrust":"reviewable"}}),
        json!({"kind":"reject","input":{"candidateId":"candidate","importResultId":""}}),
    ]
    .into_iter()
    .map(|value| serde_json::from_value(value).unwrap())
    .collect()
}

#[test]
fn metadata_dispatch_uses_canonical_preparation_and_echoes_each_complete_input() {
    for input in inputs() {
        let original = serde_json::to_value(&input).unwrap();
        let expected = crate::metadata::prepare(input.clone()).unwrap();
        let wire = CatalogInput::PrepareMetadata {
            input: Box::new(input),
        };
        assert_eq!(wire.operation(), CatalogOperation::PrepareMetadata);
        let wire = serde_json::from_slice(&serde_json::to_vec(&wire).unwrap()).unwrap();
        let output = dispatch(wire).unwrap();
        assert_eq!(output.operation(), CatalogOperation::PrepareMetadata);
        assert_eq!(
            serde_json::from_slice::<CatalogOutput>(&serde_json::to_vec(&output).unwrap()).unwrap(),
            output
        );
        let CatalogOutput::MetadataPreparation { outcome } = output else {
            unreachable!()
        };
        assert_eq!(outcome, expected);
        let echoed: Value = match outcome {
            MetadataPreparationV1::Update { plan } => serde_json::to_value(plan.input).unwrap(),
            MetadataPreparationV1::Confirm { outcome } => match outcome {
                MetadataConfirmOutcomeV1::Ready { input, .. }
                | MetadataConfirmOutcomeV1::Rejected { input, .. } => {
                    serde_json::to_value(input).unwrap()
                }
            },
            MetadataPreparationV1::FullApply { plan } => serde_json::to_value(plan.input).unwrap(),
            MetadataPreparationV1::FieldsApply { outcome } => match *outcome {
                MetadataFieldsApplyOutcomeV1::Ready { input, .. }
                | MetadataFieldsApplyOutcomeV1::Rejected { input, .. } => {
                    serde_json::to_value(input).unwrap()
                }
            },
            MetadataPreparationV1::Reject { plan } => serde_json::to_value(plan.input).unwrap(),
        };
        assert_eq!(echoed, original["input"]);
    }
}

#[test]
fn missing_prepared_doi_is_a_safe_protocol_error_but_domain_rejection_stays_an_outcome() {
    let input = MetadataInputV1::Update {
        input: Box::new(MetadataUpdateInputV1 {
            item_id: "private-item".into(),
            patch: LiteratureMetadataPatch::Doi("private-input-body".into()),
            doi: None,
        }),
    };
    let error = dispatch(CatalogInput::PrepareMetadata {
        input: Box::new(input),
    })
    .unwrap_err();
    assert_eq!(error, CatalogDecodeError::InvalidMetadataPreparation);
    assert_eq!(error.code(), "literature_catalog_input_invalid");
    assert_eq!(
        error.to_string(),
        "literature_catalog_input_invalid: metadata preparation requires its prepared Core DOI"
    );
    let output = dispatch(CatalogInput::PrepareMetadata {
        input: Box::new(MetadataInputV1::Update {
            input: Box::new(MetadataUpdateInputV1 {
                item_id: " raw ".into(),
                patch: LiteratureMetadataPatch::Title(" \n ".into()),
                doi: None,
            }),
        }),
    })
    .unwrap();
    let CatalogOutput::MetadataPreparation {
        outcome: MetadataPreparationV1::Update { plan },
    } = output
    else {
        unreachable!()
    };
    assert_eq!(plan.input.item_id, " raw ");
    assert_eq!(
        plan.patch,
        DeferredMetadataPatchV1::Rejected {
            error: MetadataRejectionV1::EmptyTitle {}
        }
    );
}

#[test]
fn doi_dispatch_omits_empty_normalized_binding_but_preserves_the_complete_raw_echo() {
    use research_workbench_native_sdk::catalog_save::PreparedDoi;
    for normalized in ["", "10.1000/normalized"] {
        let doi = PreparedDoi {
            display: " Core display ".into(),
            normalized: normalized.into(),
        };
        let input = MetadataUpdateInputV1 {
            item_id: " raw\0item ".into(),
            patch: LiteratureMetadataPatch::Doi(" raw DOI input ".into()),
            doi: Some(doi.clone()),
        };
        let wire = CatalogInput::PrepareMetadata {
            input: Box::new(MetadataInputV1::Update {
                input: Box::new(input.clone()),
            }),
        };
        let wire = serde_json::from_slice(&serde_json::to_vec(&wire).unwrap()).unwrap();
        let output = dispatch(wire).unwrap();
        let output = serde_json::from_slice(&serde_json::to_vec(&output).unwrap()).unwrap();
        let CatalogOutput::MetadataPreparation {
            outcome: MetadataPreparationV1::Update { plan },
        } = output
        else {
            unreachable!()
        };
        assert_eq!(*plan.input, input);
        assert_eq!(
            plan.patch,
            DeferredMetadataPatchV1::Ready {
                patch: LiteratureMetadataPatch::Doi(doi.display.clone()),
                doi: (!normalized.is_empty()).then_some(doi)
            }
        );
    }
    assert_eq!(
        crate::metadata::prepare_patch(&LiteratureMetadataPatch::Doi("raw".into()), None),
        Err(crate::metadata::MetadataPreparationError::MissingPreparedDoi)
    );
}
