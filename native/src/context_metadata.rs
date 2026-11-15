//! The original metadata body projection, over caller-captured rows only.
use research_workbench_native_sdk::context_metadata::{
    ContextMetadataInputV1, ContextMetadataRejectionV1,
};
use serde_json::json;

pub fn project(input: &ContextMetadataInputV1) -> Result<String, ContextMetadataRejectionV1> {
    if !input.base.is_object() && !input.base.is_null() {
        return Err(ContextMetadataRejectionV1::InvalidBase);
    }
    let mut value = input.base.clone();
    value["creators"] = json!(input.creators);
    value["identifiers"] = json!(input.identifiers);
    Ok(value.to_string())
}

#[cfg(test)]
mod tests;
