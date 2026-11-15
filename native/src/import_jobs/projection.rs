use super::*;
use crate::catalog::{CatalogDecodeError, Row};

pub fn project(
    input: &ImportJobsProjectionInputV1,
) -> Result<ImportJobsProjectionOutcomeV1, CatalogDecodeError> {
    let result = match input {
        ImportJobsProjectionInputV1::Job { expected_id, rows } => {
            let Some(job) = job(expected_id, rows)? else {
                return Ok(not_found());
            };
            ImportJobsResultV1::Job { job }
        }
        ImportJobsProjectionInputV1::Jobs { expected_ids, rows } => {
            if rows.len() > expected_ids.len() {
                return Err(CatalogDecodeError::InvalidImportJobsProjection);
            }
            let mut jobs = Vec::with_capacity(rows.len());
            for (id, captured) in expected_ids.iter().zip(rows) {
                let Some(job) = job(id, captured)? else {
                    return Ok(not_found());
                };
                jobs.push(job);
            }
            if rows.len() != expected_ids.len() {
                return Err(CatalogDecodeError::InvalidImportJobsProjection);
            }
            ImportJobsResultV1::Jobs { jobs }
        }
        ImportJobsProjectionInputV1::Cancel { affected_rows: 0 } => {
            return Ok(not_found());
        }
        ImportJobsProjectionInputV1::Cancel { .. } => ImportJobsResultV1::Done {},
    };
    Ok(ImportJobsProjectionOutcomeV1::Success { result })
}

fn not_found() -> ImportJobsProjectionOutcomeV1 {
    ImportJobsProjectionOutcomeV1::NotFound {
        message: NOT_FOUND.into(),
    }
}

fn job(
    expected_id: &str,
    captured: &ImportJobRowsV1,
) -> Result<Option<ImportedJob>, CatalogDecodeError> {
    if captured.header.rows.is_empty() {
        return Ok(None);
    }
    if captured.header.rows.len() != 1 {
        return Err(CatalogDecodeError::MultipleMainRows);
    }
    let row = Row::new(&captured.header.rows[0], "importJob", 0, 8)?;
    let mut job = ImportedJob {
        id: row.text(0)?,
        state: row.text(1)?,
        source_kind: row.text(2)?,
        total_count: count(&row, 3)?,
        completed_count: count(&row, 4)?,
        cancellation_requested: row.integer(5)? != 0,
        results: Vec::new(),
        created_at: row.text(6)?,
        updated_at: row.text(7)?,
    };
    if job.id != expected_id {
        return Err(CatalogDecodeError::ImportJobIdentityMismatch);
    }
    let results = captured
        .results
        .as_ref()
        .ok_or(CatalogDecodeError::InvalidImportJobsProjection)?;
    job.results = results
        .rows
        .iter()
        .enumerate()
        .map(|(index, values)| {
            let row = Row::new(values, "importResults", index, 5)?;
            Ok(ImportedResult {
                input_label: row.text(0)?,
                raw_input: row.text(1)?,
                state: row.text(2)?,
                item_id: row.optional_text(3)?,
                error_message: row.optional_text(4)?,
            })
        })
        .collect::<Result<_, CatalogDecodeError>>()?;
    Ok(Some(job))
}

fn count(row: &Row<'_>, column: usize) -> Result<usize, CatalogDecodeError> {
    usize::try_from(row.integer(column)?).map_err(|_| row.invalid(column, "usize"))
}
