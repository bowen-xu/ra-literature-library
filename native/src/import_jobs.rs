//! Original BibTeX preparation and import-job result policy, without I/O.
use research_workbench_native_sdk::catalog_save::CatalogDraft;
pub use research_workbench_native_sdk::import_jobs::*;

mod projection;
pub use projection::project;

const NOT_FOUND: &str = "找不到文献或附件";
const EMPTY_TITLE: &str = "标题不能为空";

/// Preserve the original label test and serialize every unmodified draft first.
pub fn prepare_inputs(drafts: &[CatalogDraft]) -> Result<Vec<(String, String)>, serde_json::Error> {
    drafts.iter().map(original_input).collect()
}

fn original_input(draft: &CatalogDraft) -> Result<(String, String), serde_json::Error> {
    let label = if draft.bibtex_key.trim().is_empty() {
        draft.title.clone()
    } else {
        draft.bibtex_key.clone()
    };
    serde_json::to_string(draft).map(|raw| (label, raw))
}

pub fn finish_state(imported: usize, failed: usize) -> &'static str {
    if failed == 0 {
        "completed"
    } else if imported == 0 {
        "failed"
    } else {
        "completed_with_errors"
    }
}

pub fn prepare(input: PrepareBibtexInputV1) -> Result<BibtexPreparationV1, serde_json::Error> {
    if input.inputs.is_empty() {
        return Ok(BibtexPreparationV1::Rejected {
            reason: ImportJobsRejectionV1::EmptyTitle {},
            message: EMPTY_TITLE.into(),
        });
    }
    let raw = input
        .inputs
        .iter()
        .map(|input| original_input(&input.draft))
        .collect::<Result<Vec<_>, _>>()?;
    let entries = input
        .inputs
        .into_iter()
        .zip(raw)
        .map(|(mut input, (input_label, raw_input))| {
            input.draft.source_kind = Some("bibtex".into());
            PreparedBibtexEntryV1 {
                input_label,
                raw_input,
                save: crate::catalog_save::prepare(input),
            }
        })
        .collect();
    Ok(BibtexPreparationV1::Ready {
        plan: Box::new(PreparedBibtexV1 {
            entries,
            rules: rules(),
        }),
    })
}

fn rules() -> ImportJobRulesV1 {
    ImportJobRulesV1 {
        source_kind: "bibtex".into(),
        imported_state: "imported".into(),
        failed_state: "failed".into(),
        finish_states: ImportFinishStatesV1 {
            no_failed: finish_state(0, 0).into(),
            no_imported: finish_state(0, 1).into(),
            mixed: finish_state(1, 1).into(),
        },
        not_found_message: NOT_FOUND.into(),
        empty_title_message: EMPTY_TITLE.into(),
        unsupported_type_prefix: "不支持的文献类型：".into(),
        database_error_prefix: "文献数据库操作失败：".into(),
    }
}

#[cfg(test)]
mod tests;
