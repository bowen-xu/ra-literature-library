import { Plus, X } from "lucide-react";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";
import { PortraitTagMenu } from "./PortraitTagMenu";
import { SettingRow } from "@research-assistant/workbench-sdk/settings";
import { portraitTagDefinition, togglePortraitTag, type PaperPortraitCandidateV1, type PortraitCatalog, type PortraitTagCatalog, type PortraitTagDimension } from "@research-assistant/core/ai";

export function PortraitClassification({ portrait, catalog, dimension, title, disabled, catalogDisabled, onChange, onSaveTags }: {
  readonly portrait: PaperPortraitCandidateV1 | undefined; readonly catalog: PortraitCatalog; readonly dimension: PortraitTagDimension; readonly title: string; readonly disabled: boolean;
  readonly catalogDisabled: boolean;
  readonly onChange: (value: PaperPortraitCandidateV1) => void;
  readonly onSaveTags: (dimension: PortraitTagDimension, tags: NonNullable<PortraitTagCatalog[PortraitTagDimension]>) => boolean;
}): React.JSX.Element {
  const tags = catalog.tags;
  const claims = portrait?.claims.filter(claim => claim.dimension === dimension) ?? [];
  const remaining = (tags[dimension] ?? []).filter(tag => !claims.some(claim => claim.label === tag.label));
  function toggle(label: string): void { if (portrait === undefined) return; onChange(togglePortraitTag(portrait, dimension, label, `claim_${crypto.randomUUID().replaceAll("-", "")}`)); }
  return <section className="portrait-dimension" aria-label={title}>
    <SettingRow title={title} details={
      <ul className="portrait-classification-list">{claims.map(claim => <li className="portrait-classification-row" key={claim.id}>
        <span className="portrait-selected-tag">{claim.label}<button type="button" className="portrait-tag-remove" disabled={disabled} aria-label={`移除${claim.label}标签`} onClick={() => toggle(claim.label)}><X size={12} aria-hidden="true" /></button></span>
        <span className="portrait-classification-description" aria-label={`${claim.label}说明`}>{portraitTagDefinition(tags, dimension, claim.label)}</span>
      </li>)}</ul>
    }>
      <ActionMenu label={`添加${title}标签`} trigger={<Plus size={15} aria-hidden="true" />} className="portrait-tag-add-menu" triggerClassName="portrait-tag-add"
        contentClassName="portrait-tag-menu" portal disabled={disabled || remaining.length === 0 || (portrait?.claims.length ?? 0) >= 24 && !(claims.length === 1 && claims[0]?.label === "不确定")}>
        {remaining.map(tag => <ActionMenuItem key={tag.label} onClick={() => toggle(tag.label)} title={tag.description}>{tag.label}</ActionMenuItem>)}
      </ActionMenu>
      <PortraitTagMenu dimension={dimension} title={title} tags={tags[dimension] ?? []} disabled={catalogDisabled} onSaveTags={onSaveTags} />
    </SettingRow>
  </section>;
}
