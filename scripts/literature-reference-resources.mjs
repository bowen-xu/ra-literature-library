// Fixed artifact inputs only. Core owns the exact grants and row codecs.
export const literatureReferenceResources = Object.freeze([
  "reference-records-ids.v1.sql",
  "reference-records-record.v1.sql",
  "reference-records-anchor-belongs.v1.sql",
  "reference-records-matched-exists.v1.sql",
  "reference-records-insert.v1.sql",
  "reference-records-header.v1.sql",
  "reference-records-update.v1.sql",
  "reference-records-revision.v1.sql",
]);

// AI review borrows its original transaction; these are separate from manual saves.
export const literatureReferenceAcceptanceResources = Object.freeze([
  "reference-records-ai-insert.v1.sql",
  "reference-records-ai-revision.v1.sql",
  "candidate-review-project-contains.v1.sql",
]);
