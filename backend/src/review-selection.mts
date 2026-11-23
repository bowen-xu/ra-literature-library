/** Structured-review selection migrated from the native plugin. */

/** Keep pending order and duplicates while excluding protected/reviewed fields. */
export function selectUnreviewedFields(
  pending: readonly string[],
  protectedFields: readonly string[],
  reviewed: readonly string[],
): readonly string[] {
  return pending.filter(id => !protectedFields.includes(id) && !reviewed.includes(id));
}
