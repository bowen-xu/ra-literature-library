//! Finite pure preparation of the original startup and annotation/link decisions.
use crate::nal_annotation::{NalAnnotationError, plan, validate_request};
use research_workbench_native_sdk::{
    nal_annotation::{
        NalAnnotation, NalAnnotationPlan, NalAnnotationRequest, NalAnnotationSnapshot,
    },
    nal_annotation_prepare::{
        NalAnnotationAfterLoadRejection as After, NalAnnotationBeforeLoadRejection as Before,
        NalAnnotationDecision, NalAnnotationLinkPreparation, NalAnnotationLinkTarget,
        NalAnnotationPreparation, NalAnnotationPrepareInput, NalAnnotationValidation,
    },
    nal_bootstrap::StateProjectionV1,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum NalAnnotationLinkError {
    #[error("笔记关联身份无效")]
    InvalidAnnotationId,
    #[error("笔记关联身份冲突")]
    IdentityConflict,
    #[error("每个概念或语句只能关联一份笔记")]
    TargetConflict,
    #[error("笔记不存在或不在活跃状态")]
    InactiveNote,
    #[error("笔记目标类型无效")]
    InvalidTargetKind,
}

impl From<Before> for NalAnnotationLinkError {
    fn from(reason: Before) -> Self {
        match reason {
            Before::InvalidAnnotationId => Self::InvalidAnnotationId,
        }
    }
}

impl From<After> for NalAnnotationLinkError {
    fn from(reason: After) -> Self {
        match reason {
            After::IdentityConflict => Self::IdentityConflict,
            After::TargetConflict => Self::TargetConflict,
        }
    }
}

/// This operation is dispatched before the caller captures any database source.
pub fn validate(request: &NalAnnotationRequest) -> NalAnnotationValidation {
    match validate_request(request) {
        Ok(()) => NalAnnotationValidation::Valid {},
        Err(_) => NalAnnotationValidation::InvalidRequest {},
    }
}

/// No Notes title policy, SQL, UUID generation or mutation is performed here.
/// The caller consumes this decision after its actual startup and first load.
pub fn prepare(
    input: &NalAnnotationPrepareInput,
) -> Result<NalAnnotationPreparation, NalAnnotationError> {
    validate_request(&input.request)?;
    let bootstrap = crate::nal_bootstrap::prepare_bootstrap(&input.bootstrap);
    let decision = if bootstrap.terminal.is_some() {
        NalAnnotationDecision::DeferredAfterBootstrap {}
    } else if let StateProjectionV1::Prepared { raw_state, .. } = &bootstrap.final_projection {
        let target_exists = if input.request.target_kind == "concept" {
            raw_state
                .concepts
                .iter()
                .any(|concept| concept.id == input.request.target_id)
        } else {
            raw_state
                .statements
                .iter()
                .any(|statement| statement.id == input.request.target_id)
        };
        match plan(
            input.request.clone(),
            NalAnnotationSnapshot {
                annotations: raw_state.annotations.clone(),
                target_exists,
            },
        ) {
            Ok(NalAnnotationPlan::Existing { annotation }) => {
                NalAnnotationDecision::Existing { annotation }
            }
            Ok(NalAnnotationPlan::Create {
                target_kind,
                target_id,
                title,
            }) => {
                let annotation = NalAnnotation {
                    id: input.identities.annotation_id.clone(),
                    target_kind,
                    target_id,
                    note_page_id: input.identities.page_id.clone(),
                };
                let link = prepare_link(&annotation, &raw_state.annotations);
                NalAnnotationDecision::Create {
                    annotation,
                    raw_title: title,
                    link,
                }
            }
            Err(NalAnnotationError::TargetMissing) => NalAnnotationDecision::TargetMissing {},
            Err(error) => return Err(error),
        }
    } else {
        NalAnnotationDecision::DeferredAfterBootstrap {}
    };
    Ok(NalAnnotationPreparation {
        bootstrap,
        decision,
    })
}

/// The original LinkAnnotation identity guard precedes its full state load.
pub fn validate_link_id(annotation: &NalAnnotation) -> Result<(), NalAnnotationLinkError> {
    if annotation.id.trim().is_empty() || annotation.id.len() > 200 {
        return Err(NalAnnotationLinkError::InvalidAnnotationId);
    }
    Ok(())
}

/// Prepare only link-dependent policy. The caller still performs its complete
/// second state load, checks actual annotations, then reads Core note activity
/// before consuming the target selection, including InvalidTargetKind.
pub fn prepare_link(
    annotation: &NalAnnotation,
    annotations: &[NalAnnotation],
) -> NalAnnotationLinkPreparation {
    if validate_link_id(annotation).is_err() {
        return NalAnnotationLinkPreparation::RejectedBeforeLoad {
            reason: Before::InvalidAnnotationId,
        };
    }
    let current = annotations.iter().find(|value| value.id == annotation.id);
    let reason = if current.is_some_and(|value| value != annotation) {
        Some(After::IdentityConflict)
    } else if annotations.iter().any(|value| {
        value.target_kind == annotation.target_kind
            && value.target_id == annotation.target_id
            && value.note_page_id != annotation.note_page_id
    }) {
        Some(After::TargetConflict)
    } else {
        None
    };
    if let Some(reason) = reason {
        return NalAnnotationLinkPreparation::AfterLoadRejected {
            annotations: annotations.to_vec(),
            reason,
        };
    }
    let target = match annotation.target_kind.as_str() {
        "concept" => NalAnnotationLinkTarget::Concept {
            id: annotation.target_id.clone(),
        },
        "statement" => NalAnnotationLinkTarget::Statement {
            id: annotation.target_id.clone(),
        },
        _ => NalAnnotationLinkTarget::InvalidTargetKind {},
    };
    NalAnnotationLinkPreparation::ReadActive {
        annotations: annotations.to_vec(),
        target,
    }
}

#[cfg(test)]
mod tests;
