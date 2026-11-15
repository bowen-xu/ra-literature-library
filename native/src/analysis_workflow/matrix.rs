//! Original matrix scope checks retain their positions between fixed Core reads.
use research_workbench_native_sdk::{
    analysis_workflow::{AnalysisWorkflowError as AiError, matrix::*},
    generation::{AiMatrixSynthesisContext, AiMatrixSynthesisContextDraft},
};
use std::collections::HashSet;

pub fn context(input: MatrixContextInputV1) -> MatrixContextDecisionV1 {
    use MatrixContextInputV1 as Input;
    let rejection = match input {
        Input::Header { draft } => validate_header(&draft).err(),
        Input::Revision { matches } => {
            (!matches).then(|| invalid("证据矩阵版本已变化，请重新预览综合范围"))
        }
        Input::Input {
            input,
            prior_cell_ids,
        } => (input.object_kind != "matrix_cell"
            || input.object_revision < 1
            || input.selection_reason.chars().count() > 500
            || prior_cell_ids.contains(&input.object_id))
        .then(|| invalid("多文献综合输入单元无效或重复")),
        Input::Coverage { snapshot } => (snapshot.coverage_state != "populated")
            .then(|| invalid("多文献综合只能使用已填充的矩阵单元")),
        Input::Finish {
            draft,
            cells,
            scope,
        } => {
            return MatrixContextDecisionV1::Resolved {
                result: finish(draft, cells, scope),
            };
        }
    };
    MatrixContextDecisionV1::Validated { rejection }
}
fn validate_header(draft: &AiMatrixSynthesisContextDraft) -> Result<(), AiError> {
    if !matches!(
        draft.view_kind.as_str(),
        "taxonomy" | "historical_context" | "gap_hypothesis" | "innovation_hypothesis"
    ) || draft.title.trim().is_empty()
        || draft.title.chars().count() > 240
        || draft.scope_note.trim().is_empty()
        || draft.scope_note.chars().count() > 4_000
    {
        return Err(invalid("多文献综合上下文参数无效"));
    }
    Ok(())
}
fn finish(
    draft: AiMatrixSynthesisContextDraft,
    cells: Vec<MatrixCellObservationV1>,
    scope: Vec<(String, String)>,
) -> Result<AiMatrixSynthesisContext, AiError> {
    let paper_ids = cells
        .iter()
        .map(|cell| &cell.paper_id)
        .collect::<HashSet<_>>();
    let mut seen = HashSet::new();
    let evidence_anchor_ids = cells
        .iter()
        .flat_map(|cell| &cell.snapshot.statements)
        .flat_map(|statement| &statement.evidence_anchor_ids)
        .filter(|anchor| seen.insert((*anchor).clone()))
        .cloned()
        .collect::<Vec<_>>();
    if !(2..=20).contains(&draft.inputs.len())
        || paper_ids.len() < 2
        || !(2..=32).contains(&evidence_anchor_ids.len())
    {
        return Err(invalid(
            "多文献综合需要 2–20 个单元、至少两篇论文和 2–32 条来源",
        ));
    }
    if scope.iter().any(|(kind, _)| kind != "anchor") {
        return Err(invalid("多文献综合范围只能包含冻结原文锚点"));
    }
    let ids = scope.iter().map(|(_, id)| id).collect::<Vec<_>>();
    if ids.iter().copied().collect::<HashSet<_>>().len() != scope.len()
        || ids.len() != evidence_anchor_ids.len()
        || ids.iter().copied().ne(evidence_anchor_ids.iter())
    {
        return Err(invalid("多文献综合外发范围或顺序与所选单元证据不一致"));
    }
    Ok(AiMatrixSynthesisContext {
        project_id: draft.project_id,
        matrix_id: draft.matrix_id,
        matrix_revision: draft.matrix_revision,
        view_kind: draft.view_kind,
        title: draft.title.trim().into(),
        scope_note: draft.scope_note.trim().into(),
        inputs: draft.inputs,
        evidence_anchor_ids,
    })
}
fn invalid(message: &str) -> AiError {
    AiError::InvalidInput(message.into())
}

pub fn static_sql() -> [&'static str; 2] {
    [
        include_str!("../../data/matrix-synthesis-matches.v1.sql"),
        include_str!("../../data/matrix-synthesis-cell.v1.sql"),
    ]
}
