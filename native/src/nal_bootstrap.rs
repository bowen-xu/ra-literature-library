//! Pure preparations for the original import, repair, cleanup and load chain.
mod concepts;
mod policy;
mod preparation;
mod probes;
mod projection;

pub use policy::{
    embedding_space_id, normalize_term, rejection_message, render_concept, stable_row_id,
    validate_name,
};
pub use preparation::prepare_bootstrap;
pub use probes::prepare_bootstrap_probes;
pub use projection::project_rules;

use research_workbench_native_sdk::nal_bootstrap::*;

pub(super) fn ready<T>(value: T) -> SourceProbe<T> {
    SourceProbe::Available { value }
}

pub(super) fn require<T>(
    probe: &SourceProbe<T>,
    phase: BootstrapPhaseV1,
) -> Result<&T, BootstrapStopV1> {
    match probe {
        SourceProbe::Available { value } => Ok(value),
        SourceProbe::Deferred {} => Err(stop(phase, BootstrapStopReasonV1::Deferred {})),
        SourceProbe::Skipped {} => Err(stop(phase, BootstrapStopReasonV1::InvalidBinding {})),
    }
}

pub(super) fn stop(phase: BootstrapPhaseV1, reason: BootstrapStopReasonV1) -> BootstrapStopV1 {
    BootstrapStopV1 {
        phase,
        concept_key: None,
        statement_id: None,
        reason,
    }
}

#[cfg(test)]
mod tests;
