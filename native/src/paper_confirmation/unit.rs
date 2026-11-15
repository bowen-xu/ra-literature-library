//! Original confirmed-unit validation, version check and lazy snapshot errors.
use research_workbench_native_sdk::paper_confirmation::unit::*;
use serde_json::Value;

pub fn prepare(input: UnitInputV1) -> UnitDecisionV1 {
    match input {
        UnitInputV1::Validate {
            title,
            body,
            unit_kind,
            provenance_kind,
            epistemic_role,
            anchor_count,
        } => {
            let rejection = if title.trim().chars().count() > 240
                || body.trim().is_empty()
                || anchor_count == 0
                || !crate::reading_units::UNIT_KINDS.contains(&unit_kind.as_str())
                || !matches!(
                    provenance_kind.as_str(),
                    "ai_accepted_unchanged" | "ai_accepted_after_edit"
                )
                || !crate::reading_units::EPISTEMIC_ROLES.contains(&epistemic_role.as_str())
            {
                Some(invalid("AI 确认生成的阅读单元内容无效"))
            } else {
                None
            };
            UnitDecisionV1::Validated { rejection }
        }
        UnitInputV1::Revision {
            current_revision,
            expected_revision,
            ..
        } => {
            let result = match current_revision {
                None => Err(UnitProblemV1::NotFound {}),
                Some(current_revision) if current_revision != expected_revision => {
                    Err(UnitProblemV1::RevisionConflict { current_revision })
                }
                Some(current_revision) => Ok(current_revision + 1),
            };
            UnitDecisionV1::Revision { result }
        }
        UnitInputV1::Restore { snapshot } => UnitDecisionV1::Restore {
            header: header(&snapshot),
            links: links(&snapshot),
        },
    }
}

fn invalid(message: &str) -> UnitProblemV1 {
    UnitProblemV1::InvalidInput {
        message: message.into(),
    }
}
fn text(snapshot: &Value, key: &str) -> Result<String, UnitProblemV1> {
    snapshot[key]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| invalid("阅读单元历史快照无效"))
}
fn optional_text(snapshot: &Value, key: &str) -> Result<Option<String>, UnitProblemV1> {
    if snapshot[key].is_null() {
        Ok(None)
    } else {
        text(snapshot, key).map(Some)
    }
}
fn header(snapshot: &Value) -> Result<RestoredUnitV1, UnitProblemV1> {
    Ok(RestoredUnitV1 {
        project_id: optional_text(snapshot, "projectId")?,
        paper_id: optional_text(snapshot, "paperId")?,
        unit_kind: text(snapshot, "unitKind")?,
        title: text(snapshot, "title")?,
        body: text(snapshot, "body")?,
        provenance_kind: text(snapshot, "provenanceKind")?,
        epistemic_role: text(snapshot, "epistemicRole")?,
    })
}
fn links(
    snapshot: &Value,
) -> Result<Vec<Result<RestoredEvidenceV1, UnitProblemV1>>, UnitProblemV1> {
    let links = snapshot["evidenceLinks"]
        .as_array()
        .ok_or_else(|| invalid("阅读单元证据历史快照无效"))?;
    let mut restored = Vec::new();
    for link in links {
        let result = (|| {
            Ok(RestoredEvidenceV1 {
                anchor_id: text(link, "anchorId")?,
                stance: text(link, "stance")?,
                rationale: text(link, "rationale")?,
            })
        })();
        let failed = result.is_err();
        restored.push(result);
        if failed {
            break;
        }
    }
    Ok(restored)
}
