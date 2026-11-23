import { PortraitClassification } from "./PortraitClassification";
import { catalogDimensions, type PaperPortraitCandidateV1, type PortraitCatalog, type PortraitTagCatalog, type PortraitTagDimension } from "@research-assistant/core/ai";

export function PaperPortraitDimensions({ portrait, catalog, disabled, catalogDisabled, onChange, onSaveTags }: {
  readonly portrait: PaperPortraitCandidateV1 | undefined; readonly catalog: PortraitCatalog; readonly disabled: boolean; readonly catalogDisabled: boolean;
  readonly onChange: (value: PaperPortraitCandidateV1) => void;
  readonly onSaveTags: (dimension: PortraitTagDimension, tags: NonNullable<PortraitTagCatalog[PortraitTagDimension]>) => boolean;
}): React.JSX.Element {
  const customDimensions = [...(portrait?.customDimensions ?? [])];
  for (const value of catalog.customDimensions ?? []) if (!customDimensions.some(dimension => dimension.id === value.id)) customDimensions.push(value);
  const view = portrait === undefined ? undefined : { ...portrait, customDimensions, claims: [...portrait.claims, ...customDimensions.filter(dimension => !portrait.claims.some(claim => claim.dimension === dimension.id)).map(dimension => ({ id: 'claim_' + dimension.id, dimension: dimension.id, label: "不确定", description: "尚未确定分类。", certainty: "uncertain" as const, evidence: [] }))] };
  return <>
    {catalogDimensions({ ...catalog, customDimensions }).map(({ id: dimension, title }) => <PortraitClassification key={dimension} portrait={view} catalog={catalog} dimension={dimension} title={title} disabled={disabled} catalogDisabled={catalogDisabled} onChange={onChange} onSaveTags={onSaveTags} />)}
  </>;
}
