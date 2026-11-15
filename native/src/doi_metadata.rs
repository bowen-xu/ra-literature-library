//! DOI metadata translation and publisher-page enrichment.
//!
//! The translator order and the Crossref/DataCite/embedded-metadata dispatch are
//! adapted from Zotero translators at fixed revisions:
//! - zotero/zotero: 1dffe21de036f59f9d31e3be5341d486608a8781
//! - zotero/translators: 60f2d542ffcd3bb1208b0d991e9c8e8fc849a1f7
//!
//! Zotero is Copyright (C) Corporation for Digital Scholarship and contributors
//! and is distributed under AGPL-3.0. This project currently uses the adapted
//! behavior for private local use. Distribution requires a renewed license review.

mod conversion;
mod crossref_xml;
mod csl_json;
mod datacite_json;
mod embedded_metadata;
mod model;
mod workflow;

pub use workflow::preview;

use std::collections::BTreeMap;

use research_workbench_native_sdk::doi_metadata::DoiHttpErrorV1;
use serde::Serialize;

use crossref_xml::parse_crossref_xml;
use csl_json::parse_csl_json;
use datacite_json::parse_datacite_json;
use embedded_metadata::{embedded_metadata, enrich_from_page};
use model::TypeEvidence;
pub use model::{DoiCreator, DoiMetadataDraft, DoiMetadataError, DoiMetadataResult};

/// Original content-negotiation preference; the adapter owns the actual GET.
pub const DOI_ACCEPT: &str = "application/vnd.datacite.datacite+json, application/vnd.crossref.unixref+xml, application/vnd.citationstyles.csl+json";
pub const DOI_RESPONSE_LIMIT: usize = 4 * 1024 * 1024;
pub const HTML_RESPONSE_LIMIT: usize = 2 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RawEnvelope<'a> {
    schema_version: u8,
    adapter: &'a str,
    content_type: &'a str,
    doi_response: &'a str,
    embedded_metadata: &'a BTreeMap<String, String>,
    type_evidence: &'a [TypeEvidence],
    warnings: &'a [String],
}

/// Only the result of the original bounded publisher read, never an IO handle.
#[derive(Debug)]
pub enum PublisherOutcome {
    Html { body: String, final_https: bool },
    Failed(DoiHttpErrorV1),
}

/// Parsed base metadata. The caller cannot replace its adapter or evidence.
#[derive(Debug)]
pub struct PreparedDoi {
    adapter: &'static str,
    content_type: String,
    body: String,
    draft: DoiMetadataDraft,
    evidence: Vec<TypeEvidence>,
}

fn adapter_for(body: &str) -> &'static str {
    if body.contains("<crossref") {
        "crossref-unixref-xml"
    } else if body.contains("http://datacite.org/schema")
        || body.contains("\"agency\": \"DataCite\"")
        || body.contains("\"providerId\":")
        || body.contains("\"resourceTypeGeneral\"")
    {
        "datacite-json"
    } else {
        "csl-json"
    }
}

/// Preserve the original resolver/body failure distinction and exact labels.
pub fn resolver_error(error: DoiHttpErrorV1) -> DoiMetadataError {
    match error {
        DoiHttpErrorV1::InvalidResolver { cause } => {
            DoiMetadataError::Request(format!("DOI resolver 地址无效：{cause}"))
        }
        DoiHttpErrorV1::Client { cause } => DoiMetadataError::Request(cause),
        DoiHttpErrorV1::Send { cause } => {
            DoiMetadataError::Request(format!("无法连接 DOI resolver：{cause}"))
        }
        other => body_error(other, "DOI resolver "),
    }
}

fn body_error(error: DoiHttpErrorV1, label: &str) -> DoiMetadataError {
    match error {
        DoiHttpErrorV1::InvalidResolver { cause } | DoiHttpErrorV1::Client { cause } => {
            DoiMetadataError::Request(cause)
        }
        DoiHttpErrorV1::Send { cause } => DoiMetadataError::Request(cause),
        DoiHttpErrorV1::NotFound {} => {
            DoiMetadataError::Request("没有找到 DOI 元数据，请检查 DOI 是否正确".to_owned())
        }
        DoiHttpErrorV1::Status { cause, .. } => {
            DoiMetadataError::Request(format!("{label}返回错误：{cause}"))
        }
        DoiHttpErrorV1::TooLarge { .. } => {
            DoiMetadataError::Request(format!("{label}响应超过大小限制"))
        }
        DoiHttpErrorV1::Read { cause, .. } => {
            DoiMetadataError::Request(format!("无法读取{label}响应：{cause}"))
        }
        DoiHttpErrorV1::Utf8 { cause, .. } => {
            DoiMetadataError::Parse(format!("{label}响应不是 UTF-8：{cause}"))
        }
    }
}

/// Translate the already-read response in the original adapter order.
pub fn prepare(
    normalized_doi: &str,
    content_type: &str,
    body: &str,
) -> Result<PreparedDoi, DoiMetadataError> {
    let adapter = adapter_for(body);
    let (mut draft, evidence) = match adapter {
        "crossref-unixref-xml" => parse_crossref_xml(normalized_doi, body)?,
        "datacite-json" => parse_datacite_json(normalized_doi, body)?,
        _ => parse_csl_json(normalized_doi, body)?,
    };
    if draft.title.is_empty() {
        draft.title = normalized_doi.to_owned();
    }
    Ok(PreparedDoi {
        adapter,
        content_type: content_type.to_owned(),
        body: body.to_owned(),
        draft,
        evidence,
    })
}

impl PreparedDoi {
    pub fn needs_publisher(&self) -> bool {
        let has_assertion_evidence = self
            .evidence
            .iter()
            .any(|evidence| evidence.kind == "crossref-event-or-assertion");
        matches!(self.draft.item_type.as_str(), "bookSection" | "document")
            || has_assertion_evidence
    }

    /// Supply the actual read outcome exactly when `needs_publisher` is true.
    /// Reject a missing or unsolicited outcome rather than inventing an attempt.
    pub fn finish(
        self,
        publisher: Option<PublisherOutcome>,
    ) -> Result<DoiMetadataResult, DoiMetadataError> {
        let needs_publisher = self.needs_publisher();
        let invalid_publisher = matches!(
            &publisher,
            Some(PublisherOutcome::Failed(
                DoiHttpErrorV1::InvalidResolver { .. } | DoiHttpErrorV1::Client { .. }
            ))
        );
        if needs_publisher != publisher.is_some() || invalid_publisher {
            return Err(DoiMetadataError::Parse(
                "DOI 出版商补充结果与准备状态不符".to_owned(),
            ));
        }
        let Self {
            adapter,
            content_type,
            body,
            mut draft,
            mut evidence,
        } = self;
        let mut warnings = Vec::new();
        let mut metadata = BTreeMap::new();
        match publisher {
            Some(PublisherOutcome::Html {
                body,
                final_https: true,
            }) => {
                metadata = embedded_metadata(&body);
                enrich_from_page(&mut draft, &metadata, &mut evidence);
            }
            Some(PublisherOutcome::Html { .. }) => {
                warnings.push("出版商页面不是 HTTPS，已保留 DOI 基础元数据".to_owned());
            }
            Some(PublisherOutcome::Failed(error)) => warnings.push(format!(
                "出版商页面补充失败：{}；已保留 DOI 基础元数据",
                body_error(error, "出版商页面")
            )),
            None => (),
        }
        if draft.item_type == "document" {
            warnings.push("文献类型缺少明确会议证据，请人工确认".to_owned());
        }
        let raw_payload = serde_json::to_string(&RawEnvelope {
            schema_version: 1,
            adapter,
            content_type: &content_type,
            doi_response: &body,
            embedded_metadata: &metadata,
            type_evidence: &evidence,
            warnings: &warnings,
        })
        .map_err(|error| DoiMetadataError::Parse(format!("无法记录 DOI 审计信息：{error}")))?;
        Ok(DoiMetadataResult {
            draft,
            raw_payload,
            source_kind: format!("doi.org:{adapter}"),
            warnings,
        })
    }
}

#[cfg(test)]
mod flow_tests;
#[cfg(test)]
mod tests;
