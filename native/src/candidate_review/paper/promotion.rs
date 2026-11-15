//! Original paper concept/definition/surface-form preparation with bound sources.
use super::*;
struct PromotionSource<'a> {
    id: &'a str,
    sources: &'a [(String, String)],
}
pub(super) fn prepare(
    item: PaperItemV1,
    resolution: Option<AiSuggestionResolutionDraft>,
    paper_id: &str,
    candidate_id: &str,
    candidate_revision: i64,
    sources: &[(String, String)],
) -> Result<KnowledgePromotionV1, AiError> {
    let candidate = PromotionSource {
        id: candidate_id,
        sources,
    };
    match (item, resolution) {
        (PaperItemV1::Concept(concept), Some(resolution)) => concept_promotion(
            &candidate,
            &concept,
            candidate_revision,
            paper_id,
            resolution,
        )
        .map(KnowledgePromotionV1::PaperConcept),
        (
            PaperItemV1::Relation(relation),
            Some(AiSuggestionResolutionDraft::AssertRelation {
                subject_concept_id,
                object_concept_id,
                project_id,
            }),
        ) => Ok(KnowledgePromotionV1::Relation(AiRelationPromotion {
            project_id,
            subject_concept_id,
            object_concept_id,
            predicate_kind: relation.predicate_kind.clone(),
            scope_note: nonempty(&relation.scope_note),
            anchor_ids: anchor_ids(&candidate, &relation.evidence_item_ids)?,
        })),
        _ => Err(AiError::InvalidInput("论文概念审查目标无效".into())),
    }
}
fn concept_promotion(
    candidate: &PromotionSource<'_>,
    concept: &PaperConceptPayload,
    candidate_revision: i64,
    paper_id: &str,
    resolution: AiSuggestionResolutionDraft,
) -> Result<AiPaperConceptPromotion, AiError> {
    let preferred = concept
        .surface_forms
        .iter()
        .find(|form| form.relation_kind == "preferred" && form.text == concept.preferred_term)
        .ok_or_else(|| AiError::InvalidInput("概念缺少首选词形".to_owned()))?;
    let concept_anchor_ids = anchor_ids(candidate, &concept.evidence_item_ids)?;
    Ok(AiPaperConceptPromotion {
        paper_id: paper_id.to_owned(),
        source_candidate_id: candidate.id.to_owned(),
        source_candidate_revision: candidate_revision,
        source_local_concept_id: concept.id.clone(),
        preferred_term: concept.preferred_term.clone(),
        preferred_language: preferred.language.clone(),
        surface_forms: concept
            .surface_forms
            .iter()
            .map(|form| {
                let form_anchor_ids = if form.evidence_item_ids.is_empty() {
                    concept_anchor_ids.clone()
                } else {
                    anchor_ids(candidate, &form.evidence_item_ids)?
                };
                Ok(AiPaperSurfaceFormPromotion {
                    text: form.text.clone(),
                    language: form.language.clone(),
                    anchor_ids: form_anchor_ids,
                })
            })
            .collect::<Result<_, AiError>>()?,
        paper_function: concept.paper_function.clone(),
        novelty_status: concept.novelty_status.clone(),
        explanation_status: concept.explanation_status.clone(),
        explanation: concept.explanation.clone(),
        disambiguation: concept.disambiguation.clone(),
        role_rationale: concept.role_rationale.clone(),
        novelty_rationale: concept.novelty_rationale.clone(),
        definition_claims: concept
            .definition_claims
            .iter()
            .map(|definition| {
                Ok(AiPaperDefinitionPromotion {
                    statement: definition.statement.clone(),
                    scope_note: definition.scope_note.clone(),
                    anchor_ids: anchor_ids(candidate, &definition.evidence_item_ids)?,
                })
            })
            .collect::<Result<_, AiError>>()?,
        anchor_ids: concept_anchor_ids,
        resolution: match resolution {
            AiSuggestionResolutionDraft::CreateConcept => AiConceptResolution::CreateNew,
            AiSuggestionResolutionDraft::LinkConcept { concept_id } => {
                AiConceptResolution::LinkExisting(concept_id)
            }
            AiSuggestionResolutionDraft::Unresolved => AiConceptResolution::Unresolved,
            _ => return Err(AiError::InvalidInput("概念消歧方式无效".to_owned())),
        },
    })
}

fn anchor_ids(
    candidate: &PromotionSource<'_>,
    evidence_ids: &[String],
) -> Result<Vec<String>, AiError> {
    let anchors = evidence_ids
        .iter()
        .filter_map(|key| {
            candidate
                .sources
                .iter()
                .find(|(k, _)| k == key)
                .map(|(_, id)| id.clone())
        })
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    if anchors.is_empty() {
        Err(AiError::InvalidInput("概念条目缺少可晋升来源".into()))
    } else {
        Ok(anchors)
    }
}
fn nonempty(value: &str) -> Option<String> {
    (!value.trim().is_empty()).then(|| value.trim().to_owned())
}
