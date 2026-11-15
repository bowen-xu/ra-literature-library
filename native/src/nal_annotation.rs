//! The original singular NAL annotation decision; Core still owns note writes.
use research_workbench_native_sdk::nal_annotation::{
    NalAnnotationPlan, NalAnnotationRequest, NalAnnotationSnapshot,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum NalAnnotationError {
    #[error("笔记目标或标题无效")]
    InvalidRequest,
    #[error("笔记目标已不存在")]
    TargetMissing,
}

/// Validate before the caller starts its original transaction or legacy import.
/// The target limit is bytes, the title limit is Unicode scalar values. Trimming
/// checks emptiness only; neither identity nor title bytes are normalized here.
pub fn validate_request(request: &NalAnnotationRequest) -> Result<(), NalAnnotationError> {
    if !matches!(request.target_kind.as_str(), "concept" | "statement")
        || request.target_id.trim().is_empty()
        || request.target_id.len() > 200
        || request.title.trim().is_empty()
        || request.title.chars().count() > 300
    {
        return Err(NalAnnotationError::InvalidRequest);
    }
    Ok(())
}

/// Reuse the first matching original identity even if its target no longer
/// exists. A create decision retains raw title bytes for the original Core note
/// writer's separate title rules. This function performs no reads or writes.
pub fn plan(
    request: NalAnnotationRequest,
    snapshot: NalAnnotationSnapshot,
) -> Result<NalAnnotationPlan, NalAnnotationError> {
    validate_request(&request)?;
    if let Some(annotation) = snapshot.annotations.into_iter().find(|annotation| {
        annotation.target_kind == request.target_kind && annotation.target_id == request.target_id
    }) {
        return Ok(NalAnnotationPlan::Existing { annotation });
    }
    if !snapshot.target_exists {
        return Err(NalAnnotationError::TargetMissing);
    }
    Ok(NalAnnotationPlan::Create {
        target_kind: request.target_kind,
        target_id: request.target_id,
        title: request.title,
    })
}

#[cfg(test)]
mod tests;
