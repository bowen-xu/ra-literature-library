use super::validate_editable_template;
use serde_json::{Value, json};

fn template() -> Value {
    json!({"kind":"reading_template_v1","schemaVersion":1,"name":" 原模板 ",
        "fields":[{"id":"question","title":" 原标题 ","question":" 原问题? "}]})
}

#[test]
fn accepted_values_keep_whitespace_omissions_empty_claims_and_color_case() {
    let mut value = template();
    assert_eq!(validate_editable_template(value.clone()).unwrap(), value);
    value["fields"][0]["claimIds"] = json!([]);
    value["fields"][0]["color"] = json!("#AbCdEf");
    assert_eq!(validate_editable_template(value.clone()).unwrap(), value);
}

#[test]
fn original_rejections_keep_top_level_then_field_and_property_precedence() {
    for (value, expected) in [
        (json!({"kind":"wrong"}), "模板缺少fields数组"),
        (json!({"fields":null,"kind":"wrong"}), "模板缺少fields数组"),
        (
            json!({"fields":[null],"kind":"wrong"}),
            "模板类型、名称或字段数量无效",
        ),
        (
            {
                let mut v = template();
                v["fields"][0] = json!({"extra":true});
                v
            },
            "fields[0]包含未知属性",
        ),
        (
            {
                let mut v = template();
                v["fields"][0] = json!({"id":1,"title":""});
                v
            },
            "模板字段缺少稳定id",
        ),
        (
            {
                let mut v = template();
                v["fields"][0]["id"] = json!("");
                v["fields"][0]["title"] = json!("");
                v
            },
            "fields[0].id无效或重复",
        ),
        (
            {
                let mut v = template();
                v["fields"][0]["title"] = json!("");
                v["fields"][0]["question"] = json!("");
                v
            },
            "fields[0].title无效",
        ),
        (
            {
                let mut v = template();
                v["fields"][0]["question"] = json!("");
                v["fields"][0]["claimIds"] = json!(["paper_claim"]);
                v
            },
            "fields[0].question无效",
        ),
        (
            {
                let mut v = template();
                v["fields"][0]["claimIds"] = json!(["paper_claim"]);
                v["fields"][0]["color"] = json!("bad");
                v
            },
            "全局模板不能包含论文专用claimIds",
        ),
        (
            {
                let mut v = template();
                v["fields"][0]["color"] = json!("bad");
                v
            },
            "模板字段颜色无效",
        ),
    ] {
        assert_eq!(validate_editable_template(value).unwrap_err(), expected);
    }
}

#[test]
fn field_count_identity_bytes_and_duplicate_order_keep_original_bounds() {
    let mut value = template();
    value["fields"] = json!(
        (0..20)
            .map(|index| json!({"id":format!("f{index}"),"title":"题","question":"问"}))
            .collect::<Vec<_>>()
    );
    assert_eq!(validate_editable_template(value.clone()).unwrap(), value);
    value["fields"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"last","title":"题","question":"问"}));
    assert_eq!(
        validate_editable_template(value).unwrap_err(),
        "模板类型、名称或字段数量无效"
    );
    let mut value = template();
    value["fields"][0]["id"] = json!("a".repeat(64));
    assert_eq!(validate_editable_template(value.clone()).unwrap(), value);
    value["fields"][0]["id"] = json!("a".repeat(65));
    assert_eq!(
        validate_editable_template(value).unwrap_err(),
        "fields[0].id无效或重复"
    );
    let mut value = template();
    let duplicate = value["fields"][0].clone();
    value["fields"].as_array_mut().unwrap().push(duplicate);
    value["fields"][1]["title"] = json!("");
    assert_eq!(
        validate_editable_template(value).unwrap_err(),
        "fields[1].id无效或重复"
    );
}

#[test]
fn text_limits_count_unicode_characters_without_trimming_accepted_text() {
    let mut value = template();
    value["name"] = json!("名".repeat(120));
    value["fields"][0]["title"] = json!("题".repeat(120));
    value["fields"][0]["question"] = json!("问".repeat(1000));
    assert_eq!(validate_editable_template(value.clone()).unwrap(), value);
    for (field, count, expected) in [
        ("title", 121, "fields[0].title无效"),
        ("question", 1001, "fields[0].question无效"),
    ] {
        let mut invalid = value.clone();
        invalid["fields"][0][field] = json!("字".repeat(count));
        assert_eq!(validate_editable_template(invalid).unwrap_err(), expected);
    }
    value["name"] = json!("名".repeat(121));
    assert_eq!(
        validate_editable_template(value).unwrap_err(),
        "模板类型、名称或字段数量无效"
    );
}

#[test]
fn immutable_snapshot_identity_and_present_nulls_are_not_editable_defaults() {
    let mut value = template();
    value["templateResourceId"] = json!("paper-template");
    value["templateResourceRevision"] = json!(1);
    assert_eq!(
        validate_editable_template(value).unwrap_err(),
        "模板类型、名称或字段数量无效"
    );
    for claims in [json!(null), json!(["claim"]), json!({})] {
        let mut value = template();
        value["fields"][0]["claimIds"] = claims;
        assert_eq!(
            validate_editable_template(value).unwrap_err(),
            "全局模板不能包含论文专用claimIds"
        );
    }
    let mut value = template();
    value["fields"][0]["color"] = json!(null);
    assert_eq!(
        validate_editable_template(value).unwrap_err(),
        "模板字段颜色无效"
    );
    let mut value = template();
    value["schemaVersion"] = json!(1.0);
    assert_eq!(
        validate_editable_template(value).unwrap_err(),
        "模板类型、名称或字段数量无效"
    );
}
