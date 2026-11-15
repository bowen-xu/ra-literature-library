use super::CatalogDecodeError;
use research_workbench_native_sdk::{
    context_metadata::{
        ContextMetadataDecisionV1, ContextMetadataInputV1, ContextMetadataOutcomeV1,
        ContextMetadataRequestV1,
    },
    paper_context_wire::decode_payload,
};

pub(super) fn project(
    input: Box<ContextMetadataRequestV1>,
) -> Result<ContextMetadataOutcomeV1, CatalogDecodeError> {
    let captured: ContextMetadataInputV1 = decode_payload(&input.cbor_base64)
        .map_err(|_| CatalogDecodeError::InvalidContextMetadataInput)?;
    let decision = match crate::context_metadata::project(&captured) {
        Ok(body_json) => ContextMetadataDecisionV1::Projected { body_json },
        Err(reason) => ContextMetadataDecisionV1::Rejected { reason },
    };
    Ok(ContextMetadataOutcomeV1 { input, decision })
}
