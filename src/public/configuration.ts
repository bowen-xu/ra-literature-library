import type {ConfigurationSetting, PluginConfigurationDeclaration} from "@research-assistant/workbench-sdk/configuration";
import {DEFAULT_LITERATURE_SORT, type LiteratureSort} from "../components/literatureTableModel";

export const literatureSortSetting: ConfigurationSetting<LiteratureSort> = {
  key: "sort", defaultValue: DEFAULT_LITERATURE_SORT, scopes: ["application"], effect: "immediate",
  schema: {type: "object", properties: {
    key: {type: "string", enum: ["created", "title", "creator", "itemType", "year", "attachment"]},
    direction: {type: "string", enum: ["ascending", "descending"]},
  }},
};
export const literatureConfiguration = {owner: "literature_library", settings: [literatureSortSetting]} satisfies PluginConfigurationDeclaration;
