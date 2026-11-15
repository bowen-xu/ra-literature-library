//! Original matrix-candidate promotion preserves its frozen project and source references.
use research_workbench_native_sdk::{
    candidate_contracts::CandidateValidationError as AiError,
    candidate_review::derived::DerivedPromotionInputV1,
    derived_view::{AcceptedDerivedViewV1, DerivedViewItem},
};
use std::collections::HashMap;
pub fn prepare(input: &DerivedPromotionInputV1) -> Result<AcceptedDerivedViewV1, AiError> {
    let context = input
        .context
        .as_ref()
        .ok_or_else(|| invalid("派生视图候选缺少冻结上下文"))?;
    if input.project_id.as_deref() != Some(context.project_id.as_str()) {
        return Err(invalid("派生视图必须晋升到其冻结矩阵所属项目"));
    }
    let anchors = input
        .anchors_by_key
        .iter()
        .map(|(key, anchor)| (key.as_str(), anchor.as_str()))
        .collect::<HashMap<_, _>>();
    let items = input
        .view
        .items
        .iter()
        .map(|item| {
            let evidence_anchor_ids = item
                .evidence_item_ids
                .iter()
                .map(|key| {
                    anchors
                        .get(key.as_str())
                        .map(|anchor| (*anchor).to_owned())
                        .ok_or_else(|| invalid("派生视图引用了冻结范围外的证据"))
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(DerivedViewItem {
                id: item.id.clone(),
                text: item.text.clone(),
                epistemic_role: item.epistemic_role.clone(),
                evidence_anchor_ids,
                has_conflict: item.has_conflict,
            })
        })
        .collect::<Result<Vec<_>, AiError>>()?;
    Ok(AcceptedDerivedViewV1 {
        project_id: context.project_id.clone(),
        view_kind: input.view.view_kind.clone(),
        title: input.view.title.clone(),
        scope_note: input.view.scope_note.clone(),
        inputs: context.inputs.clone(),
        items,
        provenance_kind: if input.provenance_kind == "ai_accepted_after_edit" {
            "ai_accepted_after_edit"
        } else {
            "ai_suggestion"
        }
        .into(),
        provider_id: input.provider_id.clone(),
        model_id: input.model_id.clone(),
        generated_at: input.generated_at.clone(),
        candidate_id: input.candidate_id.clone(),
        candidate_revision: input.candidate_revision,
    })
}
fn invalid(message: &str) -> AiError {
    AiError::InvalidInput(message.into())
}
