//! Original structured-review selection, without storage or HBS ownership.

/// Keep the original pending order and duplicates; verification and protection
/// exclude fields without changing their identities.
pub fn unreviewed_fields(
    pending: &[String],
    protected: &[String],
    reviewed: &[String],
) -> Vec<String> {
    let mut selected = pending.to_vec();
    selected.retain(|id| !protected.contains(id) && !reviewed.contains(id));
    selected
}

#[cfg(test)]
mod tests;
