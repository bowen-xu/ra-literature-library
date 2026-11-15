import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { FileSearch2, Settings2 } from "lucide-react";
import type { LiteratureItem, LiteratureType } from "@research-assistant/core/literature";

import { LiteratureBasicFieldPicker } from "./LiteratureBasicFieldPicker";
import { ActionMenu } from "@research-assistant/workbench-sdk/overlay";
import { ContentTrustIndicator } from "@research-assistant/workbench-sdk/ui";
import {
  LITERATURE_BASIC_FIELDS,
  basicFieldLabel,
  creatorRoleLabel,
  isBasicFieldApplicable,
  metadataTrustTree,
  primaryCreatorRoleForLiteratureType,
  type LiteratureBasicFieldKey,
} from "./literatureDetailModel";
import { aggregateContentTrust } from "@research-assistant/core/content-trust";
import { typeLabel } from "./literatureWorkspaceModel";

interface LiteratureSummaryProps {
  readonly item: LiteratureItem;
  readonly basicFields: readonly LiteratureBasicFieldKey[];
  readonly isFieldPickerOpen: boolean;
  readonly onOpenDetails: () => void;
  readonly onOpenPendingDetails: () => void;
  readonly onToggleFieldPicker: () => void;
  readonly onCloseFieldPicker: () => void;
  readonly onToggleBasicField: (field: LiteratureBasicFieldKey) => void;
  readonly onResetBasicFields: (itemType: LiteratureType) => void;
}

function creatorNames(item: LiteratureItem): string {
  const primaryRole = primaryCreatorRoleForLiteratureType(item.itemType);
  const names = item.creators.filter((creator) => creator.role === primaryRole).map((creator) => (
    `${creator.givenName} ${creator.familyName}`.trim() || creator.literalName
  )).filter(Boolean);
  return names.join("、") || `${creatorRoleLabel(primaryRole)}未知`;
}

function basicFieldValue(item: LiteratureItem, field: LiteratureBasicFieldKey): string {
  if (field === "itemType") return typeLabel(item.itemType);
  if (field === "issuedYear") return item.issuedYear?.toString() ?? "—";
  if (field === "containerTitle") return item.containerTitle || "—";
  if (field === "conferenceName") return item.conferenceName || "—";
  if (field === "proceedingsTitle") return item.proceedingsTitle || "—";
  if (field === "place") return item.place || "—";
  if (field === "volumeIssuePages") {
    return [item.volume, item.issue, item.pages].filter(Boolean).join(" / ") || "—";
  }
  if (field === "doi") return item.doi || "—";
  if (field === "tags") return item.tags.join("、") || "—";
  if (field === "language") return item.language || "—";
  if (field === "url") return item.url || "—";
  if (field === "bibtexKey") return item.bibtexKey || "—";
  return item.abstractText || "—";
}

export function LiteratureSummary({
  item,
  basicFields,
  isFieldPickerOpen,
  onOpenDetails,
  onOpenPendingDetails,
  onToggleFieldPicker,
  onCloseFieldPicker,
  onToggleBasicField,
  onResetBasicFields,
}: LiteratureSummaryProps): React.JSX.Element {
  const reviewStatus = aggregateContentTrust(metadataTrustTree(item.metadataSources));
  const visibleDefinitions = LITERATURE_BASIC_FIELDS.filter((field) => (
    basicFields.includes(field.key) && isBasicFieldApplicable(item.itemType, field.key)
  ));

  // Replace only this paint subtree when the selected item changes. WKWebView can otherwise
  // retain stale glyphs when long wrapped text is updated inside an overflow scroll layer.
  return (
    <section className="literature-summary" key={item.id}>
      <h2>{item.title}</h2>
      <p className="detail-authors">{creatorNames(item)}</p>
      <div className="literature-summary-metadata">
        <div className="literature-summary-controls">
          <ControlHint content="查看详情"><button
            aria-label="查看文献详情"
            className="summary-icon-action summary-hover-action"
            onClick={onOpenDetails}
            type="button"
          >
            <FileSearch2 aria-hidden="true" size={16} strokeWidth={1.8} />
          </button></ControlHint>
          <ActionMenu label="配置基本信息字段" menuLabel="基本信息显示字段" hint
            className="basic-field-picker-anchor summary-hover-action" triggerClassName="summary-icon-action"
            contentClassName="basic-field-picker" placement="bottom-end" open={isFieldPickerOpen}
            setOpen={next => { if (next && !isFieldPickerOpen) onToggleFieldPicker(); else if (!next && isFieldPickerOpen) onCloseFieldPicker(); }}
            trigger={<Settings2 aria-hidden="true" size={16} strokeWidth={1.8} />}>
              <LiteratureBasicFieldPicker
                onReset={() => onResetBasicFields(item.itemType)}
                onToggle={onToggleBasicField}
                selectedFields={basicFields}
                itemType={item.itemType}
              />
          </ActionMenu>
          <ContentTrustIndicator
            onActivate={onOpenPendingDetails}
            status={reviewStatus}
            subjectLabel="文献基础信息"
          />
        </div>
        <dl className="metadata-list">
          {visibleDefinitions.map((field) => (
            <div key={field.key}>
              <dt>{basicFieldLabel(field.key, item.itemType)}</dt>
              <dd>{basicFieldValue(item, field.key)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
