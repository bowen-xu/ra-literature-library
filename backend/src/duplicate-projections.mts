/** Duplicate row projections and undo preparation migrated from native sources. */

import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {DataRows, DataValue} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/data.js';

export interface F64Bits {readonly value: string; asString(): string; toF64(): number}
class F64BitsValue implements F64Bits {
  readonly value: string;
  constructor(value: string) {this.value = value;}
  asString(): string {return this.value;}
  toF64(): number {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, BigInt(`0x${this.value}`), false);
    return view.getFloat64(0, false);
  }
}

function f64Bits(value: string): F64Bits {
  if (value.length !== 16 || !/^[0-9a-f]{16}$/u.test(value)) throw new Error('invalid f64 wire bits');
  return new F64BitsValue(value);
}

class Row {
  private readonly values: readonly DataValue[];
  private readonly group: string;
  private readonly index: number;
  constructor(values: readonly DataValue[], group: string, index: number, count: number) {
    this.values = values;
    this.group = group;
    this.index = index;
    if (values.length !== count) throw new Error(`literature_catalog_input_invalid: ${group} row ${index} has ${values.length} columns; expected ${count}`);
  }
  text(column: number): string {
    const value = this.values[column];
    if (value?.kind !== 'text') throw new Error(`literature_catalog_input_invalid: ${this.group} row ${this.index} column ${column} requires String`);
    return value.value;
  }
}

export interface DuplicateCandidateBits {
  readonly id: string; readonly leftItemId: string; readonly leftTitle: string; readonly rightItemId: string;
  readonly rightTitle: string; readonly reason: string; readonly confidenceBits: F64Bits;
}
export interface MergeOperation {
  readonly id: string; readonly survivorItemId: string; readonly survivorTitle: string; readonly mergedItemId: string;
  readonly mergedTitle: string; readonly state: string; readonly createdAt: string;
}

export function projectDuplicateCandidates(rows: DataRows): DuplicateCandidateBits[] {
  return rows.rows.map((values, index) => {
    const row = new Row(values, 'duplicateCandidates', index, 7);
    return {id: row.text(0), leftItemId: row.text(1), leftTitle: row.text(2), rightItemId: row.text(3), rightTitle: row.text(4), reason: row.text(5), confidenceBits: f64Bits(row.text(6))};
  });
}

export function projectMergeOperations(rows: DataRows): MergeOperation[] {
  return rows.rows.map((values, index) => {
    const row = new Row(values, 'mergeOperations', index, 7);
    return {id: row.text(0), survivorItemId: row.text(1), survivorTitle: row.text(2), mergedItemId: row.text(3), mergedTitle: row.text(4), state: row.text(5), createdAt: row.text(6)};
  });
}

interface Membership {readonly itemId: string; readonly collectionId: string}
interface Assignment {readonly itemId: string; readonly relationId: string}
interface NalStatement {readonly id: string; readonly [key: string]: unknown}
interface NalAnnotation {readonly id: string; readonly [key: string]: unknown}
interface MergeNal {readonly before: readonly NalStatement[]; readonly after: readonly NalStatement[]; readonly before_annotations: readonly NalAnnotation[]; readonly after_annotations: readonly NalAnnotation[]}
interface MergeClassification {readonly nal: MergeNal | null; readonly beforeMemberships: readonly Membership[]; readonly beforeAssignments: readonly Assignment[]; readonly afterMemberships: readonly Membership[]; readonly afterAssignments: readonly Assignment[]}
interface MergeSnapshot {readonly classification: MergeClassification | null}

export interface PreparedNalUndo {readonly expectedStatementsJson: string; readonly expectedAnnotationsJson: string; readonly deleteStatementIds: readonly string[]; readonly deleteAnnotationIds: readonly string[]}
export interface PreparedClassificationUndo {
  readonly expectedMembershipsJson: string; readonly expectedAssignmentsJson: string; readonly deleteAssignments: readonly Assignment[];
  readonly deleteMemberships: readonly Membership[]; readonly nal: PreparedNalUndo | null;
}
export interface PreparedDuplicateUndo {readonly snapshotSha256: string; readonly classification: PreparedClassificationUndo | null}

function deleteDelta<T>(before: readonly T[], after: readonly T[]): T[] {return after.filter(value => !before.some(previous => isDeepStrictEqual(previous, value)));}
function prepareNal(snapshot: MergeNal): PreparedNalUndo {
  return {
    expectedStatementsJson: JSON.stringify(snapshot.after), expectedAnnotationsJson: JSON.stringify(snapshot.after_annotations),
    deleteStatementIds: deleteDelta(snapshot.before, snapshot.after).map(statement => statement.id),
    deleteAnnotationIds: deleteDelta(snapshot.before_annotations, snapshot.after_annotations).map(annotation => annotation.id),
  };
}

export function prepareDuplicateUndo(snapshotJson: string): PreparedDuplicateUndo {
  let snapshot: MergeSnapshot;
  try {snapshot = JSON.parse(snapshotJson) as MergeSnapshot;} catch {throw new Error('literature_catalog_input_invalid: duplicate undo preparation requires a valid original merge snapshot');}
  const classification = snapshot.classification;
  const prepared = classification === null ? null : {
    expectedMembershipsJson: JSON.stringify(classification.afterMemberships), expectedAssignmentsJson: JSON.stringify(classification.afterAssignments),
    deleteAssignments: deleteDelta(classification.beforeAssignments, classification.afterAssignments),
    deleteMemberships: deleteDelta(classification.beforeMemberships, classification.afterMemberships),
    nal: classification.nal === null ? null : prepareNal(classification.nal),
  };
  return {snapshotSha256: createHash('sha256').update(snapshotJson, 'utf8').digest('hex'), classification: prepared};
}
