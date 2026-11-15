// @vitest-environment happy-dom
import { expect, it } from "vitest";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import { visibleReadingTemplates } from "./ReadingTemplateDialog";

function template(id: string, revision: number, paperId?: string): StructuredResource {
  return {
    id, revision, kind: "readingTemplate", title: id, sourceUri: `source://catalog/${id}`,
    content: revision?{kind:"reading_template_v1",schemaVersion:1,name:id,fields:[]}:null, reviewBaseline: null, pendingFieldIds: [], reviewedFieldIds: [],
    ...(paperId ? {paperId} : {}),
  };
}

it("shows only this paper's template and saved current global alternatives in the paper dialog", () => {
  const rows = [template("own", 0, "paper"), template("other", 1, "other-paper"),
    template("global", 1), template("empty", 0)];
  expect(visibleReadingTemplates(rows, "own").map(value => value.id)).toEqual(["own", "global"]);
  expect(visibleReadingTemplates(rows).map(value => value.id)).toEqual(["global", "empty"]);
});
