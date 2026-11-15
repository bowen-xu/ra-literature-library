//! Pure stages of the original DOI preview; all IO and assigned IDs stay Core-owned.
use super::{
    DOI_ACCEPT, DOI_RESPONSE_LIMIT, DoiMetadataError, HTML_RESPONSE_LIMIT, PublisherOutcome,
    prepare, resolver_error,
};
use crate::catalog::{
    CatalogDecodeError, CatalogProjectionInput, CatalogProjectionOutcome, CatalogRequest, project,
};
use research_workbench_native_sdk::{
    doi_metadata::{DoiPreviewInputV1, DoiPreviewOutcomeV1, DoiTranslationV1, MetadataPreviewV1},
    import_jobs::ImportFinishStatesV1,
};

pub fn preview(input: DoiPreviewInputV1) -> Result<DoiPreviewOutcomeV1, CatalogDecodeError> {
    Ok(match input {
        DoiPreviewInputV1::Start {
            raw_input,
            normalized_doi,
        } => {
            if raw_input.trim().is_empty() {
                rejected("invalid_input", "DOI 不能为空")
            } else if let Some(normalized_doi) = normalized_doi {
                DoiPreviewOutcomeV1::Started {
                    normalized_doi,
                    source_kind: "doi".into(),
                    finish_states: ImportFinishStatesV1 {
                        no_failed: crate::import_jobs::finish_state(0, 0).into(),
                        no_imported: crate::import_jobs::finish_state(0, 1).into(),
                        mixed: crate::import_jobs::finish_state(1, 1).into(),
                    },
                    resolver_accept: DOI_ACCEPT.into(),
                    publisher_accept: "text/html,application/xhtml+xml".into(),
                    resolver_limit: DOI_RESPONSE_LIMIT,
                    publisher_limit: HTML_RESPONSE_LIMIT,
                }
            } else {
                rejected("invalid_input", "未识别到有效 DOI，请检查输入内容")
            }
        }
        DoiPreviewInputV1::Translate {
            normalized_doi,
            resolver,
            publisher,
        } => match resolver
            .map_err(resolver_error)
            .and_then(|response| prepare(&normalized_doi, &response.content_type, &response.body))
        {
            Err(error) => connector(error),
            Ok(prepared) => {
                use research_workbench_native_sdk::doi_metadata::DoiHttpErrorV1;
                if matches!(
                    &publisher,
                    Some(Err(
                        DoiHttpErrorV1::InvalidResolver { .. } | DoiHttpErrorV1::Client { .. }
                    ))
                ) {
                    return Err(CatalogDecodeError::InvalidDoiPreviewPublisher);
                }
                if prepared.needs_publisher() && publisher.is_none() {
                    return Ok(DoiPreviewOutcomeV1::NeedsPublisher {});
                }
                let publisher = publisher.map(|response| match response {
                    Ok(response) => PublisherOutcome::Html {
                        body: response.body,
                        final_https: response.final_https,
                    },
                    Err(error) => PublisherOutcome::Failed(error),
                });
                match prepared.finish(publisher) {
                    Ok(result) => DoiPreviewOutcomeV1::Translated {
                        translation: result.into(),
                    },
                    Err(error) => connector(error),
                }
            }
        },
        DoiPreviewInputV1::Candidate {
            id,
            import_job_id,
            item_id,
            normalized_doi,
            translation,
            current,
            current_normalized_doi,
        } => {
            let current = match (&item_id, current) {
                (None, None) => None,
                (Some(item_id), Some(rows)) => {
                    let outcome = project(&CatalogProjectionInput {
                        request: CatalogRequest::Get {
                            id: item_id.clone(),
                        },
                        items: vec![rows],
                    })?;
                    match outcome {
                        CatalogProjectionOutcome::NotFound => {
                            return Ok(rejected("not_found", "找不到文献或附件"));
                        }
                        CatalogProjectionOutcome::Success { mut items } => items.pop(),
                    }
                }
                _ => return Err(CatalogDecodeError::InvalidDoiPreviewCapture),
            };
            let DoiTranslationV1 {
                mut draft,
                raw_payload,
                source_kind,
                warnings,
            } = *translation;
            draft.id.clone_from(&item_id);
            DoiPreviewOutcomeV1::Candidate {
                preview: MetadataPreviewV1 {
                    id,
                    import_job_id,
                    item_id,
                    source_kind,
                    source_reference: normalized_doi.clone(),
                    diffs: crate::metadata::diffs(
                        current.as_ref(),
                        &draft,
                        &current_normalized_doi,
                        &normalized_doi,
                    ),
                    draft,
                    warnings,
                },
                raw_payload,
            }
        }
    })
}

fn rejected(code: &str, message: &str) -> DoiPreviewOutcomeV1 {
    DoiPreviewOutcomeV1::Rejected {
        code: code.into(),
        message: message.into(),
    }
}

fn connector(error: DoiMetadataError) -> DoiPreviewOutcomeV1 {
    rejected("connector_error", &format!("DOI 元数据请求失败：{error}"))
}

#[cfg(test)]
mod tests;
