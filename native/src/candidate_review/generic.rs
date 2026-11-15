//! Original generic promotion formatting, with storage retained by Core.
use research_workbench_native_sdk::{
    candidate_contracts::{
        CandidateValidationError as AiError, PaperOverviewPayload, SelectionExplanationPayload,
    },
    candidate_review::generic::{GenericPromotionInputV1, GenericPromotionPlanV1},
    reading_units::accepted::AcceptedReadingUnitV1,
};
pub fn prepare(input: &GenericPromotionInputV1) -> Result<GenericPromotionPlanV1, AiError> {
    let custom_title = input
        .reading_unit_title
        .as_deref()
        .map(str::trim)
        .filter(|title| !title.is_empty());
    let unit = |kind: &str, title: String, body: String, role: &str| AcceptedReadingUnitV1 {
        project_id: input.project_id.clone(),
        paper_id: input.paper_id.clone(),
        unit_kind: kind.into(),
        title,
        body,
        provenance_kind: input.provenance_kind.clone(),
        epistemic_role: role.into(),
        anchor_ids: input.anchor_ids.clone(),
        candidate_id: input.candidate_id.clone(),
        candidate_revision: input.candidate_revision,
    };
    let units = match input.payload["kind"].as_str() {
        Some("paper_portrait_v1") => {
            return Ok(GenericPromotionPlanV1::Portrait {
                candidate_id: input.candidate_id.clone(),
                candidate_revision: input.candidate_revision,
            });
        }
        Some("selection_explanation_v1") => {
            let selection: SelectionExplanationPayload =
                serde_json::from_value(input.payload.clone())
                    .map_err(|_| AiError::InvalidInput("选区候选格式无效".into()))?;
            vec![unit(
                "other",
                custom_title.unwrap_or("选区解释（人工确认）").into(),
                selection_reading_unit_body(&selection),
                selection_reading_unit_role(&selection),
            )]
        }
        Some("paper_overview_unit_v1") => {
            let overview: PaperOverviewPayload = serde_json::from_value(input.payload.clone())
                .map_err(|_| AiError::InvalidInput("概要候选格式无效".into()))?;
            if overview.paper_template.is_some() {
                return Err(AiError::InvalidInput(
                    "本文模板请在文献画像区域逐字段确认".into(),
                ));
            }
            let units: Vec<_> = overview
                .fields
                .iter()
                .filter(|field| !field.statements.is_empty())
                .map(|field| {
                    let body = field
                        .statements
                        .iter()
                        .map(|statement| format!("- {}", statement.text))
                        .collect::<Vec<_>>()
                        .join("\n");
                    let title = custom_title
                        .map(|value| format!("{value} · {}", field.field))
                        .unwrap_or_else(|| format!("论文概要 · {}", field.field));
                    unit(&field.field, title, body, overview_field_role(field))
                })
                .collect();
            if units.is_empty() {
                return Err(AiError::InvalidInput(
                    "概要没有可晋升的非空字段；请拒绝或暂缓候选".into(),
                ));
            }
            units
        }
        _ => {
            return Err(AiError::InvalidInput(
                "知识和注意力候选必须使用类型专用审查".into(),
            ));
        }
    };
    Ok(GenericPromotionPlanV1::ReadingUnits { units })
}
fn selection_reading_unit_body(
    selection: &research_workbench_native_sdk::candidate_contracts::SelectionExplanationPayload,
) -> String {
    let mut lines = selection
        .statements
        .iter()
        .map(|statement| format!("- {}", statement.text))
        .collect::<Vec<_>>();
    if !selection.uncertainties.is_empty() {
        lines.push(String::new());
        lines.push("尚待确认：".to_owned());
        lines.extend(
            selection
                .uncertainties
                .iter()
                .map(|uncertainty| format!("- {uncertainty}")),
        );
    }
    lines.join("\n")
}

fn overview_field_role(
    field: &research_workbench_native_sdk::candidate_contracts::PaperOverviewField,
) -> &'static str {
    if field.statements.len() != 1 {
        return "synthesis";
    }
    match field.statements[0].epistemic_role.as_str() {
        "source_paraphrase" => "source_paraphrase",
        "inference" => "inference",
        "uncertain" => "working_note",
        _ => "synthesis",
    }
}

fn selection_reading_unit_role(
    selection: &research_workbench_native_sdk::candidate_contracts::SelectionExplanationPayload,
) -> &'static str {
    if selection.statements.len() == 1 {
        match selection.statements[0].epistemic_role.as_str() {
            "source_paraphrase" => "source_paraphrase",
            "inference" => "inference",
            "uncertain" => "working_note",
            _ => "synthesis",
        }
    } else {
        "synthesis"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn input(payload: serde_json::Value) -> GenericPromotionInputV1 {
        GenericPromotionInputV1 {
            payload,
            reading_unit_title: Some("  Human Ω  ".into()),
            project_id: None,
            paper_id: "paper".into(),
            anchor_ids: vec!["a".into(), "b".into()],
            provenance_kind: "ai_accepted_unchanged".into(),
            candidate_id: "candidate".into(),
            candidate_revision: 1,
        }
    }
    fn statement(role: &str) -> serde_json::Value {
        json!({"id":"s","text":"Original Ω","epistemicRole":role,"evidenceItemIds":["e"]})
    }
    #[test]
    fn original_selection_format_roles_uncertainty_and_storage_binding() {
        for (role, expected) in [
            ("source_paraphrase", "source_paraphrase"),
            ("inference", "inference"),
            ("uncertain", "working_note"),
            ("synthesis", "synthesis"),
        ] {
            let input = input(
                json!({"kind":"selection_explanation_v1","schemaVersion":1,"statements":[statement(role)],"uncertainties":["Limit Ω"]}),
            );
            let plan = prepare(&input).unwrap();
            assert!(input.is_bound_to(&plan));
            let GenericPromotionPlanV1::ReadingUnits { mut units } = plan else {
                panic!("unit");
            };
            let unit = &units[0];
            assert_eq!(unit.title, "Human Ω");
            assert_eq!(unit.body, "- Original Ω\n\n尚待确认：\n- Limit Ω");
            assert_eq!(unit.epistemic_role, expected);
            assert_eq!(unit.unit_kind, "other");
            crate::reading_units::accepted::validate(unit).unwrap();
            units[0].anchor_ids.push("outside".into());
            assert!(!input.is_bound_to(&GenericPromotionPlanV1::ReadingUnits { units }));
        }
    }
    #[test]
    fn original_overview_field_order_empty_skip_and_template_rejection() {
        let mut input = input(
            json!({"kind":"paper_overview_unit_v1","schemaVersion":1,"profileId":"legacy","fields":[
                {"field":"conclusion","status":"filled","statements":[statement("uncertain")]},
                {"field":"limitation","status":"insufficient_evidence","statements":[]},
                {"field":"approach","status":"filled","statements":[statement("inference"),statement("synthesis")]}
            ]}),
        );
        let plan = prepare(&input).unwrap();
        assert!(input.is_bound_to(&plan));
        let GenericPromotionPlanV1::ReadingUnits { units } = plan else {
            panic!("units");
        };
        assert_eq!(
            units
                .iter()
                .map(|unit| unit.unit_kind.as_str())
                .collect::<Vec<_>>(),
            ["conclusion", "approach"]
        );
        assert_eq!(units[0].title, "Human Ω · conclusion");
        assert_eq!(units[0].epistemic_role, "working_note");
        assert_eq!(units[1].epistemic_role, "synthesis");
        input.payload["fields"] = json!([]);
        assert!(
            prepare(&input)
                .unwrap_err()
                .to_string()
                .contains("概要没有可晋升")
        );
        input.payload["kind"] = json!("concept_suggestion_v1");
        assert!(
            prepare(&input)
                .unwrap_err()
                .to_string()
                .contains("类型专用审查")
        );
    }
    #[test]
    fn accepted_validation_preserves_content_before_provenance_and_unicode_limit() {
        let input = input(
            json!({"kind":"selection_explanation_v1","schemaVersion":1,"statements":[statement("inference")],"uncertainties":[]}),
        );
        let GenericPromotionPlanV1::ReadingUnits { mut units } = prepare(&input).unwrap() else {
            panic!("unit");
        };
        let unit = &mut units[0];
        unit.title = "Ω".repeat(240);
        crate::reading_units::accepted::validate(unit).unwrap();
        unit.title.push('Ω');
        unit.provenance_kind = "invalid".into();
        assert!(
            crate::reading_units::accepted::validate(unit)
                .unwrap_err()
                .to_string()
                .contains("内容无效")
        );
        unit.title.clear();
        assert!(
            crate::reading_units::accepted::validate(unit)
                .unwrap_err()
                .to_string()
                .contains("来源或认识角色无效")
        );
    }
}
