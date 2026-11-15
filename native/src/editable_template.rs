//! Original editable-template rule; no evidence, database or runtime owner.
use serde_json::Value;

pub fn validate_editable_template(value: Value) -> Result<Value, String> {
    let fields = value
        .get("fields")
        .and_then(Value::as_array)
        .ok_or("模板缺少fields数组")?;
    if value.as_object().is_none_or(|object| {
        object
            .keys()
            .any(|key| !["kind", "schemaVersion", "name", "fields"].contains(&key.as_str()))
    }) || value["kind"] != "reading_template_v1"
        || value["schemaVersion"] != 1
        || value["name"]
            .as_str()
            .is_none_or(|v| v.trim().is_empty() || v.chars().count() > 120)
        || !(1..=20).contains(&fields.len())
    {
        return Err("模板类型、名称或字段数量无效".into());
    }
    let mut ids = std::collections::HashSet::new();
    for (index, field) in fields.iter().enumerate() {
        if field.as_object().is_none_or(|object| {
            object.keys().any(|key| {
                !["id", "title", "question", "claimIds", "color"].contains(&key.as_str())
            })
        }) {
            return Err(format!("fields[{index}]包含未知属性"));
        }
        let id = field["id"].as_str().ok_or("模板字段缺少稳定id")?;
        if id.is_empty()
            || id.len() > 64
            || !id.starts_with(|c: char| c.is_ascii_lowercase())
            || !id
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
            || !ids.insert(id)
        {
            return Err(format!("fields[{index}].id无效或重复"));
        }
        for (key, max) in [("title", 120), ("question", 1000)] {
            if field[key]
                .as_str()
                .is_none_or(|v| v.trim().is_empty() || v.chars().count() > max)
            {
                return Err(format!("fields[{index}].{key}无效"));
            }
        }
        if field
            .get("claimIds")
            .is_some_and(|v| v.as_array().is_none_or(|a| !a.is_empty()))
        {
            return Err("全局模板不能包含论文专用claimIds".into());
        }
        if field.get("color").is_some_and(|v| {
            v.as_str().is_none_or(|c| {
                c.len() != 7
                    || !c.starts_with('#')
                    || !c[1..].bytes().all(|b| b.is_ascii_hexdigit())
            })
        }) {
            return Err("模板字段颜色无效".into());
        }
    }
    Ok(value)
}

#[cfg(test)]
mod tests;
