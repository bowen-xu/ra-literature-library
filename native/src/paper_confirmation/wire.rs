//! One finite policy family on the original catalog payload transport.
use super::{overview, rules};
use research_workbench_native_sdk::{
    candidate_contracts::CandidateValidationError as AiError,
    paper_confirmation::{PaperConfirmationRequestV1 as Request, wire::*},
};

pub fn prepare(input: PaperConfirmationInputV1) -> PaperConfirmationResultV1 {
    use PaperConfirmationDecisionV1 as Decision;
    use PaperConfirmationInputV1 as Input;
    Ok(match input {
        Input::Request { mut request } => {
            match &mut request {
                Request::ConfirmOverview { draft } => rules::validate_confirmation_draft(draft)?,
                Request::UndoOverview { draft } => {
                    rules::validate_key(&draft.idempotency_key, "撤销幂等键")?
                }
                Request::ConfirmPaper { draft } => rules::normalize_paper_draft(draft)?,
                Request::UndoPaper { draft } => {
                    rules::validate_key(&draft.idempotency_key, "撤销幂等键")?
                }
            }
            Decision::Request { request }
        }
        Input::OverviewReplay {
            requested_candidate_id,
            batch_candidate_id,
        } => {
            if requested_candidate_id != batch_candidate_id {
                return Err(AiError::InvalidInput("确认幂等键已用于其他候选".into()));
            }
            Decision::OverviewReplay {}
        }
        Input::OverviewCandidate {
            candidate, draft, ..
        } => Decision::OverviewCandidate {
            qualified: Box::new(overview::qualify(
                &candidate,
                &draft,
                crate::analysis_workflow::candidate::decode_candidate_value,
            )?),
        },
        Input::OverviewFields {
            overview,
            requested_fields,
            confirmed_fields,
        } => Decision::OverviewFields {
            fields: overview::select_fields(&overview, &requested_fields, &confirmed_fields)?,
        },
        Input::OverviewField {
            candidate,
            overview,
            field,
        } => Decision::OverviewField {
            plan: Box::new(super::field::plan(&candidate, &overview, &field)),
        },
        Input::UndoBatchKey { reset_key_exists } => {
            super::undo::whole_batch_key(reset_key_exists)?;
            Decision::UndoBatchKey {}
        }
        Input::UndoReplayKey {
            existing_batch_id,
            requested_batch_id,
            paper,
        } => {
            super::undo::replay_key(existing_batch_id.as_deref(), &requested_batch_id, paper)?;
            Decision::UndoReplayKey {}
        }
        Input::ResetField { batch, field_kind } => Decision::ResetField {
            field: Box::new(super::undo::reset_field(&batch, &field_kind)?.clone()),
        },
        Input::ResetEligibility {
            field,
            existing_reset_id,
            legacy_key_exists,
        } => Decision::ResetEligibility {
            append: super::undo::reset_eligibility(
                &field,
                existing_reset_id.as_deref(),
                legacy_key_exists,
            )?,
        },
        Input::ResetState {
            field_active,
            revision_editor_kinds,
        } => Decision::ResetState {
            state: super::undo::reset_state_flags(&field_active, &revision_editor_kinds).into(),
        },
        Input::Unit { input, .. } => Decision::Unit {
            decision: super::unit::prepare(input),
        },
        Input::PaperReplay {
            paper_id,
            request_json,
            stored_paper_id,
            stored_request_json,
        } => {
            super::paper::replay(
                &paper_id,
                &request_json,
                &stored_paper_id,
                &stored_request_json,
            )?;
            Decision::PaperReplay {}
        }
        Input::PaperExists { exists } => {
            super::paper::exists(exists)?;
            Decision::PaperExists {}
        }
        Input::PaperTarget {
            candidate,
            paper_id,
        } => {
            super::paper::target(&candidate, &paper_id)?;
            Decision::PaperTarget {}
        }
        Input::MetadataSource { source, .. } => Decision::MetadataSource {
            apply: super::paper::metadata(source)?,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use research_workbench_native_sdk::{
        catalog::{CatalogInput, CatalogOperation, CatalogOutput},
        paper_context_wire::{decode_payload, encode_payload},
    };

    #[test]
    fn original_paper_and_unit_stages_roundtrip_through_the_catalog_codec() {
        use research_workbench_native_sdk::paper_confirmation::{
            contracts::AiPaperReviewConfirmationDraft, unit::UnitInputV1,
        };
        let (candidate, overview) = super::super::field_tests::sample();
        for input in [
            PaperConfirmationInputV1::OverviewField {
                candidate: Box::new(candidate),
                field: Box::new(overview.fields[0].clone()),
                overview: Box::new(overview),
            },
            PaperConfirmationInputV1::Unit {
                scope_key: "field".into(),
                input: UnitInputV1::Validate {
                    title: "Title".into(),
                    body: "Body".into(),
                    unit_kind: "approach".into(),
                    provenance_kind: "ai_accepted_unchanged".into(),
                    epistemic_role: "source_paraphrase".into(),
                    anchor_count: 1,
                },
            },
            PaperConfirmationInputV1::Unit {
                scope_key: "field".into(),
                input: UnitInputV1::Restore {
                    snapshot: serde_json::json!({"projectId":null,"paperId":"paper","unitKind":"approach","title":"Title","body":"Body","provenanceKind":"human_original","epistemicRole":"working_note","evidenceLinks":[]}),
                },
            },
            PaperConfirmationInputV1::Request {
                request: Request::ConfirmPaper {
                    draft: AiPaperReviewConfirmationDraft {
                        paper_id: "paper".into(),
                        project_id: Some("context".into()),
                        metadata_field_names: vec!["title".into(), "abstractText".into()],
                        overview_targets: vec![],
                        idempotency_key: "key".into(),
                    },
                },
            },
            PaperConfirmationInputV1::PaperExists { exists: true },
            PaperConfirmationInputV1::PaperExists { exists: false },
            PaperConfirmationInputV1::MetadataSource {
                field_name: "title".into(),
                source: None,
            },
            PaperConfirmationInputV1::MetadataSource {
                field_name: "title".into(),
                source: Some((false, "old".into())),
            },
            PaperConfirmationInputV1::ResetState {
                field_active: vec![false],
                revision_editor_kinds: vec!["ai".into()],
            },
            PaperConfirmationInputV1::Unit {
                scope_key: "field".into(),
                input: UnitInputV1::Revision {
                    previous_snapshot: None,
                    current_revision: Some(1),
                    expected_revision: 1,
                },
            },
        ] {
            let encoded = encode_payload(&input).unwrap();
            let _: PaperConfirmationInputV1 = decode_payload(&encoded).expect("input decodes");
            let output = crate::catalog::dispatch(CatalogInput::PreparePaperConfirmation {
                input: Box::new(PaperConfirmationWireInputV1 {
                    cbor_base64: encoded,
                }),
            })
            .unwrap();
            let CatalogOutput::PaperConfirmation { outcome } = output else {
                panic!("confirmation result")
            };
            let result: PaperConfirmationResultV1 = decode_payload(&outcome.result_cbor_base64)
                .unwrap_or_else(|error| {
                    panic!("stage {:?}: {error}", std::mem::discriminant(&input))
                });
            assert!(
                input.matches_result(&result),
                "{:?}",
                std::mem::discriminant(&input)
            );
        }
    }

    #[test]
    fn catalog_exchange_keeps_exact_input_echo_and_original_rejection() {
        let input = PaperConfirmationInputV1::OverviewReplay {
            requested_candidate_id: "requested".into(),
            batch_candidate_id: "other".into(),
        };
        let encoded = encode_payload(&input).unwrap();
        let wire = PaperConfirmationWireInputV1 {
            cbor_base64: encoded,
        };
        let request = CatalogInput::PreparePaperConfirmation {
            input: Box::new(wire.clone()),
        };
        assert_eq!(
            request.operation(),
            CatalogOperation::PreparePaperConfirmation
        );
        let output = crate::catalog::dispatch(request.clone()).unwrap();
        assert_eq!(output.operation(), request.operation());
        let CatalogOutput::PaperConfirmation { outcome } = output else {
            panic!("confirmation result")
        };
        assert_eq!(outcome.input, wire);
        let result: PaperConfirmationResultV1 =
            decode_payload(&outcome.result_cbor_base64).unwrap();
        assert!(input.matches_result(&result));
        assert_eq!(result.unwrap_err().to_string(), "确认幂等键已用于其他候选");
    }
}
