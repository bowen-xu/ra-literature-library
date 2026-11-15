pub use super::policy::is_supported_item_type;
use super::{
    DeferredMetadataPatchV1, LiteratureMetadataPatch, MetadataPreparationError, MetadataRejectionV1,
};
use research_workbench_native_sdk::catalog_save::PreparedDoi;

pub fn validate_item_type(item_type: &str) -> Result<(), MetadataRejectionV1> {
    if is_supported_item_type(item_type) {
        Ok(())
    } else {
        Err(MetadataRejectionV1::UnsupportedType {
            item_type: item_type.into(),
        })
    }
}

pub fn field_name(patch: &LiteratureMetadataPatch) -> &'static str {
    use LiteratureMetadataPatch::*;
    match patch {
        ItemType(_) => "itemType",
        Title(_) => "title",
        AbstractText(_) => "abstractText",
        IssuedYear(_) => "issuedYear",
        ContainerTitle(_) => "containerTitle",
        ConferenceName(_) => "conferenceName",
        ProceedingsTitle(_) => "proceedingsTitle",
        Place(_) => "place",
        Volume(_) => "volume",
        Issue(_) => "issue",
        Pages(_) => "pages",
        Doi(_) => "doi",
        Url(_) => "url",
        Language(_) => "language",
        BibtexKey(_) => "bibtexKey",
        Creators(_) => "creators",
        Tags(_) => "tags",
    }
}

/// Normalizes only this patch. A domain rejection remains a deferred value for
/// the original transaction position, so earlier SQL failures still win.
pub fn prepare_patch(
    patch: &LiteratureMetadataPatch,
    doi: Option<&PreparedDoi>,
) -> Result<DeferredMetadataPatchV1, MetadataPreparationError> {
    use LiteratureMetadataPatch::*;
    let normalized = match patch {
        ItemType(value) => match validate_item_type(value) {
            Ok(()) => ItemType(value.clone()),
            Err(error) => return Ok(DeferredMetadataPatchV1::Rejected { error }),
        },
        Title(value) => {
            let value = value.trim();
            if value.is_empty() {
                return Ok(DeferredMetadataPatchV1::Rejected {
                    error: MetadataRejectionV1::EmptyTitle {},
                });
            }
            Title(value.into())
        }
        AbstractText(value) => AbstractText(value.trim().into()),
        IssuedYear(value) => IssuedYear(*value),
        ContainerTitle(value) => ContainerTitle(value.trim().into()),
        ConferenceName(value) => ConferenceName(value.trim().into()),
        ProceedingsTitle(value) => ProceedingsTitle(value.trim().into()),
        Place(value) => Place(value.trim().into()),
        Volume(value) => Volume(value.trim().into()),
        Issue(value) => Issue(value.trim().into()),
        Pages(value) => Pages(value.trim().into()),
        Doi(_) => {
            let doi = doi
                .ok_or(MetadataPreparationError::MissingPreparedDoi)?
                .clone();
            return Ok(DeferredMetadataPatchV1::Ready {
                patch: Doi(doi.display.clone()),
                doi: (!doi.normalized.is_empty()).then_some(doi),
            });
        }
        Url(value) => Url(value.trim().into()),
        Language(value) => Language(value.trim().into()),
        BibtexKey(value) => BibtexKey(value.trim().into()),
        Creators(creators) => Creators(
            creators
                .iter()
                .cloned()
                .map(|mut creator| {
                    creator.family_name = creator.family_name.trim().into();
                    creator.given_name = creator.given_name.trim().into();
                    creator.literal_name = creator.literal_name.trim().into();
                    creator
                })
                .collect(),
        ),
        Tags(tags) => Tags(
            tags.iter()
                .map(|tag| tag.trim())
                .filter(|tag| !tag.is_empty())
                .map(str::to_owned)
                .collect(),
        ),
    };
    Ok(DeferredMetadataPatchV1::Ready {
        patch: normalized,
        doi: None,
    })
}
