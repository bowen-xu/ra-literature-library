//! Pure guards shared by Native preparation and the original static adapter.
use research_workbench_native_sdk::{
    nal_mutation::{
        NalConceptKindPreparation, NalMutationRejection as R, NalTransitivityAction,
        NalUsageCondition,
    },
    nal_state::{NalStatement, NalTerm},
};
use std::fmt;

mod prepare;
pub use prepare::prepare;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NalMutationError {
    pub reason: R,
}

impl fmt::Display for NalMutationError {
    fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        out.write_str(match self.reason {
            R::TermStructureTooLarge => "词项结构过大或嵌套过深",
            R::ProductArity => "乘积需要 2–16 个有序词项",
            R::InvalidTermIdentity => "词项身份无效",
            R::MissingTerm => "概念或活跃文献已不存在，请刷新",
            R::InvalidConceptKind => "概念类型无效",
            R::ConceptUsedAsRelation => "该概念已用作关系；请先移除相关关系语句和规则",
            R::NotRelation => "只有关系概念可以定义传递规则",
            R::InvalidStatementCount => "每次添加 1–500 条语句",
            R::InvalidStatementIdentityOrOrigin => "新语句身份或来源无效",
            R::MissingConcept => "概念已不存在，请刷新",
            R::MissingStatement => "语句已不存在",
        })
    }
}
impl std::error::Error for NalMutationError {}

fn require(condition: bool, reason: R) -> Result<(), NalMutationError> {
    if condition {
        Ok(())
    } else {
        Err(NalMutationError { reason })
    }
}

/// Exactly one original node is counted before its arity or identity guard.
pub fn validate_term_node(
    term: &NalTerm,
    depth: usize,
    remaining: &mut usize,
) -> Result<(), NalMutationError> {
    require(depth <= 12 && *remaining != 0, R::TermStructureTooLarge)?;
    *remaining -= 1;
    match term {
        NalTerm::Product { terms } => require((2..=16).contains(&terms.len()), R::ProductArity),
        NalTerm::Concept { id } | NalTerm::Paper { id } => require(
            !id.trim().is_empty() && id.len() <= 200,
            R::InvalidTermIdentity,
        ),
    }
}

pub fn require_term_exists(exists: bool) -> Result<(), NalMutationError> {
    require(exists, R::MissingTerm)
}

pub fn validate_statement_count(count: usize) -> Result<(), NalMutationError> {
    require((1..=500).contains(&count), R::InvalidStatementCount)
}

pub fn validate_statement_identity(statement: &NalStatement) -> Result<(), NalMutationError> {
    require(
        statement.origin == "human" && !statement.id.trim().is_empty() && statement.id.len() <= 200,
        R::InvalidStatementIdentityOrOrigin,
    )
}

pub fn validate_concept_kind(kind: &str) -> Result<(), NalMutationError> {
    require(
        matches!(kind, "ordinary" | "relation"),
        R::InvalidConceptKind,
    )
}

pub fn prepare_concept_kind(kind: &str) -> NalConceptKindPreparation {
    if let Err(error) = validate_concept_kind(kind) {
        return NalConceptKindPreparation::Rejected {
            reason: error.reason,
        };
    }
    NalConceptKindPreparation::ReadUsage {
        concept_kind: kind.into(),
        on_used: if kind == "ordinary" {
            NalUsageCondition::Reject {
                reason: R::ConceptUsedAsRelation,
            }
        } else {
            NalUsageCondition::Continue {}
        },
    }
}

pub fn require_kind_usage(kind: &str, used: bool) -> Result<(), NalMutationError> {
    match prepare_concept_kind(kind) {
        NalConceptKindPreparation::Rejected { reason } => Err(NalMutationError { reason }),
        NalConceptKindPreparation::ReadUsage {
            on_used: NalUsageCondition::Reject { reason },
            ..
        } if used => Err(NalMutationError { reason }),
        _ => Ok(()),
    }
}

pub fn prepare_transitivity(enabled: bool) -> NalTransitivityAction {
    if enabled {
        NalTransitivityAction::Enable {
            missing_rejection: R::NotRelation,
        }
    } else {
        NalTransitivityAction::Disable {}
    }
}

pub fn require_relation_kind(enabled: bool, relation: bool) -> Result<(), NalMutationError> {
    match prepare_transitivity(enabled) {
        NalTransitivityAction::Enable { missing_rejection } if !relation => Err(NalMutationError {
            reason: missing_rejection,
        }),
        _ => Ok(()),
    }
}

pub fn require_concept_deleted(affected: usize) -> Result<(), NalMutationError> {
    require(affected == 1, R::MissingConcept)
}

pub fn require_statement_deleted(affected: usize) -> Result<(), NalMutationError> {
    require(affected != 0, R::MissingStatement)
}

#[cfg(test)]
mod tests;
