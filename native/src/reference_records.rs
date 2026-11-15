//! Canonical reference validation and save values; no SQL, clock or ID owner.
use std::collections::HashSet;

use research_workbench_native_sdk::reference_records::{
    ReferenceMetadataField, ReferenceRecordDraft, ReferenceRecordPlanV1,
    ReferenceRecordPreparationV1, ReferenceRecordRejectionV1,
};

/// Only the original pure prefix. Source/usage/matched queries retain their
/// original order after this check; new/update revision checks remain in TX.
pub fn validate_draft(draft: &ReferenceRecordDraft) -> Result<(), ReferenceRecordRejectionV1> {
    if draft.raw_text.trim().is_empty()
        || draft.raw_text.chars().count() > 8_000
        || draft.change_reason.trim().is_empty()
        || draft.change_reason.chars().count() > 120
        || draft.usage_summary.chars().count() > 4_000
    {
        return Err(ReferenceRecordRejectionV1::InvalidFields);
    }
    validate_states(draft)?;
    validate_fields(&draft.fields)
}

fn validate_states(draft: &ReferenceRecordDraft) -> Result<(), ReferenceRecordRejectionV1> {
    let parse_valid = matches!(draft.parse_state.as_str(), "unparsed" | "parsed" | "failed");
    let identity_valid = matches!(
        draft.identity_state.as_str(),
        "unverified" | "matched_existing" | "verified_external" | "ambiguous" | "not_found"
    );
    let semantic_valid = match draft.semantic_state.as_str() {
        "unreviewed" => {
            draft.usage_kind.is_none()
                && draft.usage_summary.is_empty()
                && draft.usage_anchor_id.is_none()
        }
        "reviewed" => {
            matches!(
                draft.usage_kind.as_deref(),
                Some(
                    "mentions" | "uses_method" | "supports" | "opposes" | "extends" | "background"
                )
            ) && !draft.usage_summary.trim().is_empty()
                && draft.usage_anchor_id.is_some()
        }
        _ => false,
    };
    let identity_target_valid =
        (draft.identity_state == "matched_existing") == draft.matched_item_id.is_some();
    if !parse_valid || !identity_valid || !semantic_valid || !identity_target_valid {
        return Err(ReferenceRecordRejectionV1::InvalidStates);
    }
    Ok(())
}

fn validate_fields(fields: &[ReferenceMetadataField]) -> Result<(), ReferenceRecordRejectionV1> {
    let mut names = HashSet::new();
    for field in fields {
        if !matches!(field.name.as_str(), "title" | "authors" | "year" | "doi")
            || !matches!(
                field.source_kind.as_str(),
                "reference_text" | "external_metadata" | "ai_inference" | "human"
            )
            || field.value.chars().count() > 2_000
            || !names.insert(field.name.as_str())
            || field.source_kind == "ai_inference" && field.confirmed_by_user
        {
            return Err(ReferenceRecordRejectionV1::InvalidMetadataFields);
        }
    }
    Ok(())
}

pub fn prepare(draft: ReferenceRecordDraft) -> ReferenceRecordPreparationV1 {
    if let Err(reason) = validate_draft(&draft) {
        return ReferenceRecordPreparationV1::Rejected { reason };
    }
    // The legacy DTO contains only strings, booleans, i64 and their containers.
    // Encoding keeps the original fallible API without another policy layer.
    let fields_json = match serde_json::to_string(&draft.fields) {
        Ok(value) => value,
        Err(_) => {
            return ReferenceRecordPreparationV1::Rejected {
                reason: ReferenceRecordRejectionV1::FieldsEncoding,
            };
        }
    };
    let snapshot_json = match serde_json::to_string(&draft) {
        Ok(value) => value,
        Err(_) => {
            return ReferenceRecordPreparationV1::Rejected {
                reason: ReferenceRecordRejectionV1::SnapshotEncoding,
            };
        }
    };
    ReferenceRecordPreparationV1::Ready {
        plan: Box::new(ReferenceRecordPlanV1 {
            raw_text: draft.raw_text.trim().to_owned(),
            usage_summary: draft.usage_summary.trim().to_owned(),
            change_reason: draft.change_reason.trim().to_owned(),
            draft,
            fields_json,
            snapshot_json,
        }),
    }
}

#[cfg(test)]
mod tests;
