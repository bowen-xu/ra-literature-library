//! Original quote selection, text interpretation and provenance over owned values.
use super::rules;
use research_workbench_native_sdk::{
    candidate_contracts::{
        CandidateValidationError as Error, PaperOverviewField, PaperOverviewPayload,
    },
    candidate_review::contracts::AiCandidate,
    paper_confirmation::field::{ConfirmedFieldV1, FieldAnchorV1, FieldPlanV1},
};
use std::collections::HashSet;

pub fn plan(
    candidate: &AiCandidate,
    overview: &PaperOverviewPayload,
    field: &PaperOverviewField,
) -> FieldPlanV1 {
    FieldPlanV1 {
        anchors: anchors(candidate, field),
        unit: unit(candidate, overview, field),
        hash: rules::field_hash(field),
    }
}

pub fn anchors(
    candidate: &AiCandidate,
    field: &PaperOverviewField,
) -> Vec<Result<FieldAnchorV1, Error>> {
    let mut anchors = Vec::new();
    let mut seen = HashSet::new();
    for statement in &field.statements {
        for key in &statement.evidence_item_ids {
            let Some(source) = candidate
                .evidence_bundle
                .items
                .iter()
                .find(|item| &item.citation_key == key)
            else {
                anchors.push(Err(Error::InvalidInput("字段引用了未知证据".into())));
                return anchors;
            };
            let quote = statement
                .evidence_quotes
                .as_ref()
                .and_then(|quotes| quotes.iter().find(|quote| &quote.evidence_item_id == key))
                .map(|quote| quote.quote.as_str());
            let Some(quote) = quote else {
                if seen.insert((source.anchor_id.clone(), source.quote_exact.clone())) {
                    anchors.push(Ok(FieldAnchorV1::Existing {
                        id: source.anchor_id.clone(),
                    }));
                }
                continue;
            };
            if !seen.insert((source.anchor_id.clone(), quote.to_owned())) {
                continue;
            }
            let Some(offset) = source.quote_exact.find(quote) else {
                anchors.push(Err(Error::InvalidInput(
                    "字段摘录不是原文的连续片段".into(),
                )));
                return anchors;
            };
            let unique = source.quote_exact.rfind(quote) == Some(offset);
            let prefix = if unique {
                format!("{}{}", source.quote_prefix, &source.quote_exact[..offset])
            } else {
                String::new()
            };
            let suffix = if unique {
                format!(
                    "{}{}",
                    &source.quote_exact[offset + quote.len()..],
                    source.quote_suffix
                )
            } else {
                String::new()
            };
            let prefix = prefix
                .chars()
                .rev()
                .take(160)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            let suffix = suffix.chars().take(160).collect();
            anchors.push(Ok(FieldAnchorV1::Quoted {
                paper_id: source.paper_id.clone(),
                attachment_id: source.attachment_id.clone(),
                content_sha256: source.content_sha256.clone(),
                page_index: source.page_index,
                page_label: source.page_label.clone(),
                quote: quote.into(),
                prefix,
                suffix,
            }));
        }
    }
    anchors
}

fn unit(
    candidate: &AiCandidate,
    overview: &PaperOverviewPayload,
    field: &PaperOverviewField,
) -> Result<ConfirmedFieldV1, Error> {
    let body = field
        .statements
        .iter()
        .map(|statement| statement.text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    let decision_kind = rules::latest_field_editor(candidate, &field.field)?;
    let definition = overview.paper_template.as_ref().and_then(|template| {
        template
            .fields
            .iter()
            .find(|definition| definition.id == field.field)
    });
    Ok(ConfirmedFieldV1 {
        title: format!(
            "结构化阅读 · {}",
            definition.map_or_else(
                || rules::field_label(&field.field),
                |definition| definition.title.as_str()
            )
        ),
        body,
        unit_kind: if overview.paper_template.is_some() {
            "other".into()
        } else {
            field.field.clone()
        },
        template_field: overview
            .paper_template
            .as_ref()
            .map(|template| (template.reference.id().to_owned(), field.field.clone())),
        decision_kind: decision_kind.into(),
        provenance_kind: if decision_kind == "human_edited" {
            "ai_accepted_after_edit"
        } else {
            "ai_accepted_unchanged"
        }
        .into(),
        epistemic_role: rules::overview_field_role(field).into(),
    })
}
