//! Original index control decisions shared by static and independent consumers.
pub const RETRY_RECORD_SQL: &str =
    include_str!("../data/semantic-index-repository-queue-retry-1.v1.sql");

use research_workbench_native_sdk::semantic_index::{
    EmbeddingJobSummary, SemanticIndexSpaceStatus,
};
use research_workbench_native_sdk::{
    paper_context_wire::{PaperContextCodecError, decode_payload, encode_payload},
    semantic_index::rules::{
        IndexDecisionV1 as Decision, IndexInputV1 as Input, IndexWireInputV1, IndexWireOutcomeV1,
        ReconcileActionV1 as Action,
    },
};

pub fn decide(input: Input) -> Decision {
    match input {
        Input::Status { spaces } => Decision::Flag {
            value: reconciliation_required(&spaces),
        },
        Input::Retry {
            record_status,
            latest,
        } => match latest.and_then(|summary| {
            retained_job(&record_status, &summary).map(|should_start| (summary, should_start))
        }) {
            Some((summary, should_start)) => Decision::ReuseJob {
                summary,
                should_start,
            },
            None => Decision::QueueJob,
        },
        Input::Running { changed } => validate(running(changed)),
        Input::Ready { changed } => validate(ready(changed)),
        Input::Activate { status, pending } => Decision::Flag {
            value: activate(&status, pending),
        },
        Input::Space { exists } => validate(space(exists)),
        Input::RepairState { status } => Decision::Flag {
            value: mark_stale(&status),
        },
        Input::ReconcileRecord { record, stored } => {
            let action = match stored {
                Some(stored) if stored.input_sha256 == record.input_sha256 => {
                    if record.status == "ready" {
                        Action::Keep
                    } else {
                        Action::Complete {
                            dataset_version: stored.dataset_version,
                            vector_norm_bits: stored.vector_norm_bits,
                        }
                    }
                }
                Some(_) => Action::Replace,
                None => Action::Missing {
                    count_repaired: mark_stale(&record.status),
                },
            };
            Decision::Reconcile { action }
        }
    }
}

pub fn retained_job(record_status: &str, summary: &EmbeddingJobSummary) -> Option<bool> {
    (matches!(summary.status.as_str(), "queued" | "running")
        || summary.status == "succeeded" && record_status == "ready")
        .then_some(summary.status == "queued")
}
pub fn reconciliation_required(spaces: &[SemanticIndexSpaceStatus]) -> bool {
    spaces
        .iter()
        .any(|space| space.failed_count > 0 || space.stale_count > 0)
}
pub fn activate(status: &str, pending: i64) -> bool {
    status == "building" && pending == 0
}
pub fn mark_stale(status: &str) -> bool {
    status != "queued"
}
pub fn running(changed: usize) -> Result<(), &'static str> {
    if changed == 1 {
        Ok(())
    } else {
        Err("embedding job 不可运行")
    }
}
pub fn ready(changed: usize) -> Result<(), &'static str> {
    if changed == 1 {
        Ok(())
    } else {
        Err("embedding record 不可标记为 ready")
    }
}
pub fn space(exists: bool) -> Result<(), &'static str> {
    if exists {
        Ok(())
    } else {
        Err("找不到 embedding space")
    }
}
fn validate(result: Result<(), &str>) -> Decision {
    match result {
        Ok(()) => Decision::Validated,
        Err(message) => Decision::Rejected {
            message: message.into(),
        },
    }
}

pub fn prepare(input: IndexWireInputV1) -> Result<IndexWireOutcomeV1, PaperContextCodecError> {
    let decision = decide(decode_payload(&input.cbor_base64)?);
    Ok(IndexWireOutcomeV1 {
        input: Box::new(input),
        decision_cbor_base64: encode_payload(&decision)?,
    })
}

#[cfg(test)]
mod tests;
