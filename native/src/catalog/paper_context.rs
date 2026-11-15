//! Only the original pure context algorithms consume these request-bound leaves.
use super::CatalogDecodeError;
use research_workbench_native_sdk::paper_context::{
    PaperContextBuildInputV1, SnapshotDigestInputV1, SnapshotProjectionInputV1,
};
use research_workbench_native_sdk::paper_context_wire::{
    PaperContextDecisionV1 as Decision, PaperContextInputV1 as Input, PaperContextOutcomeV1,
    decode_payload, encode_payload,
};

pub(super) fn prepare(input: Box<Input>) -> Result<PaperContextOutcomeV1, CatalogDecodeError> {
    let decision = match input.as_ref() {
        Input::Build { cbor_base64 } => {
            let candidate: PaperContextBuildInputV1 = decode_payload(cbor_base64)
                .map_err(|_| CatalogDecodeError::InvalidPaperContextInput)?;
            match encode_payload(&crate::paper_context::build(&candidate)) {
                Ok(prepared_cbor_base64) => Decision::Built {
                    prepared_cbor_base64,
                },
                Err(_) => Decision::Unavailable {},
            }
        }
        Input::Project { cbor_base64 } => {
            let candidate: SnapshotProjectionInputV1 = decode_payload(cbor_base64)
                .map_err(|_| CatalogDecodeError::InvalidPaperContextInput)?;
            match crate::paper_context_snapshot::project(&candidate) {
                Ok(projection) => match encode_payload(&projection) {
                    Ok(projection_cbor_base64) => Decision::Projected {
                        projection_cbor_base64,
                    },
                    Err(_) => Decision::Unavailable {},
                },
                Err(error) => failure(error),
            }
        }
        Input::Digest { cbor_base64 } => {
            let candidate: SnapshotDigestInputV1 = decode_payload(cbor_base64)
                .map_err(|_| CatalogDecodeError::InvalidPaperContextInput)?;
            match crate::paper_context_snapshot::digest(&candidate) {
                Ok(context_hash) => Decision::Digested { context_hash },
                Err(error) => failure(error),
            }
        }
        Input::Preview { cbor_base64 } => {
            let candidate = decode_payload(cbor_base64)
                .map_err(|_| CatalogDecodeError::InvalidPaperContextInput)?;
            match encode_payload(&crate::paper_context_preview::evaluate(candidate)) {
                Ok(decision_cbor_base64) => Decision::Previewed {
                    decision_cbor_base64,
                },
                Err(_) => Decision::Unavailable {},
            }
        }
        Input::Prepare { cbor_base64 } => {
            let candidate = decode_payload(cbor_base64)
                .map_err(|_| CatalogDecodeError::InvalidPaperContextInput)?;
            match encode_payload(&crate::paper_context_prepare::evaluate(candidate)) {
                Ok(decision_cbor_base64) => Decision::Prepared {
                    decision_cbor_base64,
                },
                Err(_) => Decision::Unavailable {},
            }
        }
    };
    Ok(PaperContextOutcomeV1 { input, decision })
}

fn failure(error: crate::paper_context_snapshot::PaperContextProjectionError) -> Decision {
    use crate::paper_context_snapshot::PaperContextProjectionError as Error;
    match error {
        Error::InvalidInput(message) => Decision::Rejected { message },
        Error::TemporaryUnavailable => Decision::Unavailable {},
    }
}

#[cfg(test)]
mod tests;
