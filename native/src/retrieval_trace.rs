//! Original trace validation without a database, clock or shared context owner.
use research_workbench_native_sdk::retrieval_trace::{
    MARK_SENT_EXPECTED_ROWS, MARK_SENT_REJECTION, RetrievalTraceRow, TraceRejection,
};
use sha2::{Digest, Sha256};

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum RetrievalTraceError {
    #[error("找不到概念网络检索预览")]
    NotFound,
    #[error("概念网络检索预览与当前问题不匹配")]
    QueryMismatch,
    #[error("概念网络检索预览已经被使用")]
    AlreadyConsumed,
    #[error("概念网络检索预览已过期，请重新预览")]
    Expired,
    #[error("概念网络检索上下文校验失败")]
    ContextHashMismatch,
}

/// Preserve the original rejection order. The caller must still perform its
/// original expiry UPDATE before reporting Expired, so SQL failure can win.
/// `scope_id` uses exact paper bytes or None for global; only query hashing trims.
/// Returned context bytes are unchanged and do not constitute a Core receipt.
pub fn validate_context(
    scope_id: Option<&str>,
    query: &str,
    stored: Option<RetrievalTraceRow>,
) -> Result<RetrievalTraceRow, RetrievalTraceError> {
    let stored = stored.ok_or(RetrievalTraceError::NotFound)?;
    if stored.paper_id.as_deref() != scope_id || stored.query_sha256 != hash(query.trim()) {
        return Err(RetrievalTraceError::QueryMismatch);
    }
    if stored.status != "previewed" {
        return Err(RetrievalTraceError::AlreadyConsumed);
    }
    if stored.expired {
        return Err(RetrievalTraceError::Expired);
    }
    if hash(&stored.context_text) != stored.context_sha256 {
        return Err(RetrievalTraceError::ContextHashMismatch);
    }
    Ok(stored)
}

/// Only the original SQL result of exactly one changed row is successful.
/// An already-sent trace remains a rejection, not an idempotent acknowledgement.
pub fn validate_mark_sent(changed: usize) -> Result<(), RetrievalTraceError> {
    if changed as u64 == MARK_SENT_EXPECTED_ROWS {
        Ok(())
    } else {
        Err(MARK_SENT_REJECTION.into())
    }
}

impl From<RetrievalTraceError> for TraceRejection {
    fn from(error: RetrievalTraceError) -> Self {
        match error {
            RetrievalTraceError::NotFound => Self::NotFound,
            RetrievalTraceError::QueryMismatch => Self::QueryMismatch,
            RetrievalTraceError::AlreadyConsumed => Self::AlreadyConsumed,
            RetrievalTraceError::Expired => Self::Expired,
            RetrievalTraceError::ContextHashMismatch => Self::ContextHashMismatch,
        }
    }
}

impl From<TraceRejection> for RetrievalTraceError {
    fn from(error: TraceRejection) -> Self {
        match error {
            TraceRejection::NotFound => Self::NotFound,
            TraceRejection::QueryMismatch => Self::QueryMismatch,
            TraceRejection::AlreadyConsumed => Self::AlreadyConsumed,
            TraceRejection::Expired => Self::Expired,
            TraceRejection::ContextHashMismatch => Self::ContextHashMismatch,
        }
    }
}

/// Original lower-case SHA-256 of exact UTF-8 bytes; no trimming or normalization.
pub fn hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

#[cfg(test)]
mod tests;
