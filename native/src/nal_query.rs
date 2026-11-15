//! Canonical NAL query collection decisions, without storage or runtime owners.
use research_workbench_native_sdk::nal_query::{
    Condition, Content, Pattern, PrepareOutcome, ProjectionOutcome, Rejection, SavePlan, StoredRow,
};
use std::collections::HashSet;

fn valid_pattern(p: &Pattern, depth: usize, budget: &mut usize) -> bool {
    if depth > 12 || *budget == 0 {
        return false;
    }
    *budget -= 1;
    match p {
        Pattern::Concept { id } | Pattern::Paper { id } | Pattern::Variable { name: id } => {
            !id.trim().is_empty() && id.len() <= 800
        }
        Pattern::Product { terms }
        | Pattern::Conjunction { terms }
        | Pattern::Disjunction { terms } => {
            (2..=16).contains(&terms.len())
                && terms.iter().all(|p| valid_pattern(p, depth + 1, budget))
        }
        Pattern::Statement {
            subject, predicate, ..
        } => {
            valid_pattern(subject, depth + 1, budget) && valid_pattern(predicate, depth + 1, budget)
        }
    }
}
fn variables(p: &Pattern, names: &mut HashSet<String>) {
    match p {
        Pattern::Variable { name } => {
            names.insert(name.clone());
        }
        Pattern::Product { terms }
        | Pattern::Conjunction { terms }
        | Pattern::Disjunction { terms } => {
            for term in terms {
                variables(term, names);
            }
        }
        Pattern::Statement {
            subject, predicate, ..
        } => {
            variables(subject, names);
            variables(predicate, names);
        }
        _ => {}
    }
}
fn valid_condition(q: &Condition, depth: usize, budget: &mut usize) -> bool {
    if depth > 12 || *budget == 0 {
        return false;
    }
    *budget -= 1;
    match q {
        Condition::Statement(q) => {
            valid_pattern(&q.subject, 0, budget) && valid_pattern(&q.predicate, 0, budget)
        }
        Condition::Group(group) => {
            (1..=16).contains(&group.children.len())
                && group
                    .children
                    .iter()
                    .all(|q| valid_condition(q, depth + 1, budget))
        }
    }
}
fn condition_leaves(q: &Condition) -> usize {
    match q {
        Condition::Statement(_) => 1,
        Condition::Group(group) => group.children.iter().map(condition_leaves).sum(),
    }
}
fn condition_variables(q: &Condition, names: &mut HashSet<String>) {
    match q {
        Condition::Statement(q) => {
            variables(&q.subject, names);
            variables(&q.predicate, names);
        }
        Condition::Group(group) => {
            for q in &group.children {
                condition_variables(q, names);
            }
        }
    }
}
pub fn validate(value: &Content) -> Result<(), Rejection> {
    let defs = &value.definitions;
    let mut ids = HashSet::new();
    let mut budget = 16000;
    if defs.len() > 100
        || serde_json::to_vec(value)
            .map_err(|_| Rejection::InvalidStructure)?
            .len()
            > 32 * 1024 * 1024
    {
        return Err(Rejection::TooLarge);
    }
    for d in defs {
        if d.id.trim().is_empty()
            || d.id.len() > 800
            || !ids.insert(&d.id)
            || d.name.trim().is_empty()
            || d.name.chars().count() > 200
            || !(1..=16).contains(&d.conditions.len())
            || !d
                .conditions
                .iter()
                .all(|q| valid_condition(q, 0, &mut budget))
            || d.conditions.iter().map(condition_leaves).sum::<usize>() > 16
        {
            return Err(Rejection::InvalidDefinition);
        }
    }
    for d in defs {
        let mut seen = HashSet::new();
        let mut names = HashSet::new();
        let mut count = 0;
        let mut at = Some(d);
        while let Some(d) = at {
            for q in &d.conditions {
                condition_variables(q, &mut names);
            }
            count += d.conditions.iter().map(condition_leaves).sum::<usize>();
            if !seen.insert(&d.id) || seen.len() > 16 || count > 16 {
                return Err(Rejection::InvalidHierarchy);
            }
            at = if let Some(id) = &d.parent_id {
                Some(
                    defs.iter()
                        .find(|p| &p.id == id)
                        .ok_or(Rejection::MissingParent)?,
                )
            } else {
                None
            };
        }
        if let Some(outputs) = &d.output_variables
            && (outputs.len() != outputs.iter().collect::<HashSet<_>>().len()
                || outputs.iter().any(|name| !names.contains(name)))
        {
            return Err(Rejection::InvalidOutputVariables);
        }
    }
    Ok(())
}

/// Preserve the original domain messages used by the static adapter.
pub fn rejection_message(reason: &Rejection) -> &'static str {
    match reason {
        Rejection::TooLarge => "查询缓存过大",
        Rejection::InvalidDefinition => "查询集合格式无效",
        Rejection::InvalidHierarchy => "查询目录存在循环或超过 16 个条件",
        Rejection::MissingParent => "上级查询已不存在",
        Rejection::InvalidOutputVariables => "输出变量无效，请从语句中选择",
        Rejection::InvalidStructure => "关系数据结构无效",
    }
}

fn save_plan(value: &Content) -> Result<SavePlan, Rejection> {
    validate(value)?;
    SavePlan::encode(value).map_err(|_| Rejection::InvalidStructure)
}

/// Compute only original validated bindings; the caller owns CAS and commit.
pub fn prepare_save(value: &Content) -> PrepareOutcome {
    match save_plan(value) {
        Ok(plan) => PrepareOutcome::Planned { plan },
        Err(reason) => PrepareOutcome::Rejected { reason },
    }
}

/// Structural readback must not apply save-time semantic validation. Returning
/// the raw strings preserves the original JSON parse depth and whitespace.
pub fn project(row: StoredRow) -> ProjectionOutcome {
    match row.clone().decode() {
        Ok(_) => ProjectionOutcome::Success { row },
        Err(_) => ProjectionOutcome::Rejected {
            reason: Rejection::InvalidStructure,
        },
    }
}

#[cfg(test)]
mod tests;
