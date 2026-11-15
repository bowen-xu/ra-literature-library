use super::*;
use research_workbench_native_sdk::catalog_save::CatalogSaveInput;

pub fn prepare(input: MetadataInputV1) -> Result<MetadataPreparationV1, MetadataPreparationError> {
    Ok(match input {
        MetadataInputV1::Update { input } => MetadataPreparationV1::Update {
            plan: Box::new(MetadataUpdatePlanV1 {
                field_name: field_name(&input.patch).into(),
                patch: prepare_patch(&input.patch, input.doi.as_ref())?,
                sources: update_sources(),
                derivation: derivation_policy(),
                input,
            }),
        },
        MetadataInputV1::Confirm { input } => MetadataPreparationV1::Confirm {
            outcome: prepare_confirm(input),
        },
        MetadataInputV1::FullApply { input } => MetadataPreparationV1::FullApply {
            plan: Box::new(prepare_full(input)),
        },
        MetadataInputV1::FieldsApply { input } => MetadataPreparationV1::FieldsApply {
            outcome: Box::new(prepare_fields(input)?),
        },
        MetadataInputV1::Reject { input } => MetadataPreparationV1::Reject {
            plan: MetadataRejectPlanV1 {
                input,
                zero_affected: MetadataRejectionV1::NotFound {},
            },
        },
    })
}

pub fn update_sources() -> MetadataUpdateSourcesV1 {
    MetadataUpdateSourcesV1 {
        unconfirmed: provenance("user_edit", None, false),
        otherwise: provenance("user", None, true),
    }
}

pub fn confirm_fields(fields: &[String]) -> Result<Vec<String>, MetadataRejectionV1> {
    if fields.is_empty() {
        return Err(MetadataRejectionV1::InvalidFields {
            reason: "至少选择一个字段".into(),
        });
    }
    let mut unique = fields.to_vec();
    unique.sort();
    unique.dedup();
    if let Some(field) = unique
        .iter()
        .find(|field| !FIELD_NAMES.contains(&field.as_str()))
    {
        return Err(MetadataRejectionV1::InvalidFields {
            reason: field.clone(),
        });
    }
    Ok(unique)
}

fn prepare_confirm(input: Box<MetadataConfirmInputV1>) -> MetadataConfirmOutcomeV1 {
    match confirm_fields(&input.field_names) {
        Ok(fields) => MetadataConfirmOutcomeV1::Ready {
            input,
            fields: fields
                .into_iter()
                .map(|field_name| MetadataConfirmFieldV1 {
                    missing_provenance: MetadataRejectionV1::InvalidFields {
                        reason: format!("字段 {field_name} 没有可确认的来源"),
                    },
                    field_name,
                })
                .collect(),
        },
        Err(error) => MetadataConfirmOutcomeV1::Rejected { input, error },
    }
}

fn prepare_full(input: Box<MetadataFullApplyInputV1>) -> MetadataFullApplyPlanV1 {
    let mut draft = input.draft.clone();
    draft.id = input.header.item_id.clone();
    draft.source_kind = Some(input.header.source_kind.clone());
    let save = crate::catalog_save::prepare(CatalogSaveInput {
        draft,
        doi: input.doi.clone(),
    });
    let candidate_values = draft_values(&input.candidate, &input.candidate_normalized_doi);
    let field_sources = draft_values(&input.draft, &input.doi.normalized)
        .into_iter()
        .map(|(field_name, value)| {
            let candidate_value = candidate_values
                .iter()
                .find(|(name, _)| *name == field_name)
                .map(|(_, value)| value.as_str())
                .unwrap_or_default();
            let source = if value == candidate_value {
                input.header.source_kind.as_str()
            } else {
                "user"
            };
            MetadataFieldSourceV1 {
                field_name: field_name.into(),
                provenance: provenance(source, input.header.source_reference.clone(), true),
            }
        })
        .collect();
    MetadataFullApplyPlanV1 {
        input,
        save,
        field_sources,
    }
}

fn prepare_fields(
    input: Box<MetadataFieldsApplyInputV1>,
) -> Result<MetadataFieldsApplyOutcomeV1, MetadataPreparationError> {
    let mut expected_fields = diffs(
        Some(&input.current),
        &input.candidate,
        &input.current_normalized_doi,
        &input.candidate_doi.normalized,
    )
    .into_iter()
    .map(|diff| diff.field_name)
    .collect::<Vec<_>>();
    expected_fields.sort();
    let mut reviewed = input
        .decisions
        .iter()
        .map(|decision| decision.field_name.clone())
        .collect::<Vec<_>>();
    reviewed.sort();
    let original_count = reviewed.len();
    reviewed.dedup();
    if reviewed.len() != original_count || reviewed != expected_fields {
        return Ok(MetadataFieldsApplyOutcomeV1::Rejected {
            input,
            error: MetadataRejectionV1::InvalidFields {
                reason: "必须审阅候选中的全部差异字段".into(),
            },
        });
    }
    let mut decisions = Vec::with_capacity(input.decisions.len());
    for decision in &input.decisions {
        if decision.choice == MetadataCandidateChoice::Candidate {
            let patch = match patch_from_draft(&decision.field_name, &input.candidate) {
                Ok(patch) => prepare_patch(&patch, Some(&input.candidate_doi))?,
                Err(error) => DeferredMetadataPatchV1::Rejected { error },
            };
            decisions.push(MetadataPreparedDecisionV1::Candidate {
                field_name: decision.field_name.clone(),
                patch,
                provenance: provenance(
                    &input.header.source_kind,
                    input.header.source_reference.clone(),
                    input.candidate_trust == MetadataCandidateTrust::Trusted,
                ),
            });
        } else {
            decisions.push(MetadataPreparedDecisionV1::Current {
                field_name: decision.field_name.clone(),
                on_missing: provenance("user", None, true),
            });
        }
    }
    Ok(MetadataFieldsApplyOutcomeV1::Ready {
        input,
        decisions,
        derivation: derivation_policy(),
    })
}

fn provenance(
    source_kind: &str,
    source_reference: Option<String>,
    confirmed_by_user: bool,
) -> MetadataProvenanceV1 {
    MetadataProvenanceV1 {
        source_kind: source_kind.into(),
        source_reference,
        confirmed_by_user,
    }
}
