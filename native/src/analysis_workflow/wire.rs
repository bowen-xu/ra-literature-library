//! The static and independent package call the same original pure functions.
use super::*;
use research_workbench_native_sdk::{
    analysis_workflow::wire::*,
    paper_context_wire::{decode_payload, encode_payload},
};

pub(super) fn dispatch(
    input: WorkflowInputV1,
) -> Result<WorkflowDecisionV1, crate::catalog::CatalogDecodeError> {
    use WorkflowDecisionV1 as Decision;
    Ok(match input {
        WorkflowInputV1::ResearchExport { snapshot } => Decision::ResearchExport {
            result: crate::research_export::prepare(*snapshot).map(Box::new),
        },
        WorkflowInputV1::KnowledgeValidation { input, .. } => Decision::KnowledgeValidation {
            decision: crate::knowledge_promotion::decide(&input),
        },
        WorkflowInputV1::PaperConceptReview { input } => WorkflowDecisionV1::PaperConceptReview {
            decision: crate::candidate_review::paper::decide(*input),
        },
        WorkflowInputV1::SuggestionReview { input } => Decision::SuggestionReview {
            decision: crate::candidate_review::items::decide(*input),
        },
        WorkflowInputV1::MatrixContext { input } => Decision::MatrixContext {
            decision: super::matrix::context(*input),
        },
        WorkflowInputV1::MatrixEvidence { input } => Decision::MatrixEvidence {
            decision: super::matrix_evidence::decide(*input),
        },
        WorkflowInputV1::CandidateReview { input } => Decision::CandidateReview {
            decision: crate::candidate_review::decide(*input),
        },
        WorkflowInputV1::ResearchEvidence { input } => Decision::Validated {
            rejection: super::research::validate_bundle(&input).err(),
        },
        WorkflowInputV1::ResearchPrompt { input } => Decision::ResearchPrompt {
            result: super::research::messages(&input),
        },
        WorkflowInputV1::SelectionEvidence { source } => Decision::SelectionEvidence {
            result: super::task_preview::selection::preview(source),
        },
        WorkflowInputV1::SuggestionPrompt {
            candidate_kind,
            user_goal,
            evidence,
        } => Decision::SuggestionPrompt {
            result: super::suggestion::messages(&evidence, &user_goal, &candidate_kind),
        },
        WorkflowInputV1::PortraitSources {
            statuses,
            context_items,
        } => Decision::Validated {
            rejection: super::portrait::validate_sources(&statuses, context_items).err(),
        },
        WorkflowInputV1::PortraitEvidence { status, items } => Decision::Validated {
            rejection: super::portrait::validate_evidence(&status, items).err(),
        },
        WorkflowInputV1::PortraitPaper { paper_id } => Decision::Validated {
            rejection: super::portrait::validate_paper(&paper_id).err(),
        },
        WorkflowInputV1::CandidateRecovery { input } => Decision::CandidateRecovery {
            policy: super::recovery::candidate_policy(&input),
        },
        WorkflowInputV1::RenderAttemptMessages { messages } => Decision::Prompt {
            result_cbor_base64: encode_payload(&Ok::<_, AnalysisWorkflowError>(
                super::attempt_input::legacy_prompt(&messages),
            ))
            .map_err(|_| crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput)?,
        },
        WorkflowInputV1::ValidateAttemptInput {
            turn_kind,
            contents,
        } => Decision::Validated {
            rejection: crate::analysis_attempt::validate_turn_kind(&turn_kind)
                .and_then(|()| {
                    crate::analysis_attempt::validate_message_contents(
                        &contents.iter().map(String::as_str).collect::<Vec<_>>(),
                    )
                })
                .err()
                .map(attempt_error),
        },
        WorkflowInputV1::PlanAttempt {
            turn_kind,
            workflow,
        } => Decision::AttemptPlan {
            result: crate::analysis_attempt::plan_start_attempt(&turn_kind, &workflow)
                .map_err(attempt_error),
        },
        WorkflowInputV1::ValidateDoclingImages {
            requested_ids,
            available_ids,
        } => Decision::Validated {
            rejection: crate::paper_context_prepare::image_set(&requested_ids, &available_ids)
                .err()
                .map(AnalysisWorkflowError::InvalidInput),
        },
        WorkflowInputV1::ValidateDoclingStart {
            revision,
            has_template,
        } => Decision::Validated {
            rejection: super::docling::validate_start(revision, has_template).err(),
        },
        WorkflowInputV1::ValidateDoclingSources {
            statuses,
            picture_count,
        } => Decision::Validated {
            rejection: super::docling::validate_sources(&statuses, picture_count).err(),
        },
        WorkflowInputV1::DoclingRow { input_cbor_base64 } => {
            use research_workbench_native_sdk::analysis_workflow::docling::*;
            let input: DoclingRowInputV1 = decode_payload(&input_cbor_base64)
                .map_err(|_| crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput)?;
            Decision::DoclingRow {
                decision: match super::docling::evidence_row(&input.run_id, &input.item) {
                    Ok(Some(row)) => DoclingRowDecisionV1::Ready { row },
                    Ok(None) => DoclingRowDecisionV1::Skipped {},
                    Err(_) => DoclingRowDecisionV1::Unavailable {},
                },
            }
        }
        WorkflowInputV1::DoclingPrompt { input_cbor_base64 } => {
            let input = decode_payload(&input_cbor_base64)
                .map_err(|_| crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput)?;
            Decision::DoclingPrompt {
                result_cbor_base64: encode_payload(&super::docling_prompt::build_overview_input(
                    &input,
                ))
                .map_err(|_| crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput)?,
            }
        }
        WorkflowInputV1::Candidate { input } => Decision::Candidate {
            decision: super::candidate::decide(*input)?,
        },
        WorkflowInputV1::OverviewTask { input } => Decision::OverviewTask {
            draft_cbor_base64: encode_payload(&super::overview_task::task(&input))
                .map_err(|_| crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput)?,
        },
        WorkflowInputV1::TaskShape { draft_cbor_base64 } => {
            let draft = decode_payload(&draft_cbor_base64)
                .map_err(|_| crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput)?;
            Decision::Validated {
                rejection: super::task_preview::validate_shape(&draft).err(),
            }
        }
        WorkflowInputV1::TaskScope {
            task_kind,
            item_kinds,
        } => Decision::Validated {
            rejection: super::task_preview::validate_scope(&task_kind, &item_kinds).err(),
        },
        WorkflowInputV1::PageAttachment { attachment } => Decision::Validated {
            rejection: super::task_preview::pages::validate_attachment(attachment.as_ref()).err(),
        },
        WorkflowInputV1::PagePreview {
            attachment_id,
            attachment,
            pages,
        } => Decision::PagePreview {
            result: super::task_preview::pages::select_pages(&attachment, &attachment_id, &pages)
                .map(|sources| super::task_preview::pages::preview_sources(&sources)),
        },
        WorkflowInputV1::PageSources {
            attachment_id,
            attachment,
            pages,
        } => Decision::PageSources {
            result: super::task_preview::pages::select_pages(&attachment, &attachment_id, &pages)
                .map(|sources| super::task_preview::pages::prepare_rows(&sources)),
        },
        WorkflowInputV1::Template { input } => Decision::Template {
            decision: super::template::decide(&input),
        },
        WorkflowInputV1::SubmissionScope {
            task_kind,
            paper_ids,
            attachment_ids,
        } => Decision::SubmissionScope {
            result: super::submission::submission_scope(&task_kind, &paper_ids, attachment_ids),
        },
        WorkflowInputV1::CompletionProjection { input_cbor_base64 } => {
            let input = decode_payload(&input_cbor_base64)
                .map_err(|_| crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput)?;
            Decision::CompletionProjection {
                result: super::submission::project_completion(input),
            }
        }
        WorkflowInputV1::RenderPrompt { input_cbor_base64 } => {
            use research_workbench_native_sdk::analysis_workflow::prompt::*;
            let input: TaskPromptInputV1 = decode_payload(&input_cbor_base64)
                .map_err(|_| crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput)?;
            let result = super::task_prompt::render_current(
                &input.task_template,
                &input.reading_contract,
                input
                    .sources
                    .iter()
                    .map(|entry| (&entry.source, entry.resource.clone())),
                &input.kind,
                input.profile.as_ref(),
                &input.preferences,
            );
            Decision::Prompt {
                result_cbor_base64: encode_payload(&result).map_err(|_| {
                    crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput
                })?,
            }
        }
        WorkflowInputV1::ValidateGeneration {
            portrait_active,
            analysis_active,
        } => Decision::Validated {
            rejection: validate_generation_availability(portrait_active, analysis_active).err(),
        },
        WorkflowInputV1::SelectConversation { unarchived } => Decision::Conversation {
            decision: match existing_conversation(unarchived.as_deref()) {
                Ok(Some(conversation_id)) => ConversationDecisionV1::Reuse { conversation_id },
                Ok(None) => ConversationDecisionV1::Create {},
                Err(error) => ConversationDecisionV1::Rejected { error },
            },
        },
        WorkflowInputV1::ValidateTurn { turn_kind } => Decision::Validated {
            rejection: crate::analysis_attempt::validate_turn_kind(&turn_kind)
                .err()
                .map(|error| AnalysisWorkflowError::InvalidInput(error.to_string())),
        },
        WorkflowInputV1::ValidateStart {
            revision,
            has_template,
        } => Decision::Validated {
            rejection: validate_start(revision, has_template).err(),
        },
        WorkflowInputV1::ValidateSources {
            statuses,
            picture_count,
        } => Decision::Validated {
            rejection: validate_sources(
                &statuses.iter().map(String::as_str).collect::<Vec<_>>(),
                picture_count,
            )
            .err(),
        },
        WorkflowInputV1::ValidateReuse {
            regenerate,
            template_json,
            existing,
        } => Decision::Validated {
            rejection: validate_reuse(regenerate, template_json.as_deref(), existing.as_deref())
                .err(),
        },
        WorkflowInputV1::ValidateDraft { draft } => Decision::Validated {
            rejection: validate_draft(&draft).err(),
        },
        WorkflowInputV1::OverviewMessages { workflow } => Decision::Messages {
            messages: overview_messages(&workflow),
        },
        WorkflowInputV1::RunningStatus { turn_kind } => Decision::Status {
            status: running_workflow_status(&turn_kind).into(),
        },
        WorkflowInputV1::CompletionStatus {
            turn_kind,
            has_concept_turn,
        } => Decision::Status {
            status: completion_status(&turn_kind, has_concept_turn).into(),
        },
        WorkflowInputV1::FailureStatuses {
            turn_kind,
            error_code,
        } => Decision::Failure {
            statuses: failure_statuses(&turn_kind, &error_code),
        },
        WorkflowInputV1::PackSources { sources } => Decision::Sources {
            result: pack(sources),
        },
    })
}

pub(crate) fn project(
    input: WorkflowWireInputV1,
) -> Result<WorkflowWireOutcomeV1, crate::catalog::CatalogDecodeError> {
    let value = decode_payload::<WorkflowInputV1>(&input.cbor_base64)
        .map_err(|_| crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput)?;
    let decision_cbor_base64 = encode_payload(&dispatch(value)?)
        .map_err(|_| crate::catalog::CatalogDecodeError::InvalidAnalysisWorkflowInput)?;
    Ok(WorkflowWireOutcomeV1 {
        input,
        decision_cbor_base64,
    })
}

fn attempt_error(error: crate::analysis_attempt::AnalysisAttemptError) -> AnalysisWorkflowError {
    match error {
        crate::analysis_attempt::AnalysisAttemptError::MissingTurn => {
            AnalysisWorkflowError::TemporaryUnavailable
        }
        error => AnalysisWorkflowError::InvalidInput(error.to_string()),
    }
}
