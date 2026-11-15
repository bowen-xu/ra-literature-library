import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {test} from "node:test";
import {buildLiteratureNativePlugin} from "./build-literature-native-plugin.mjs";
import {assertLiteratureNativeBuildManifest} from "../.dependencies/sdk/tooling/native-plugin-build.mjs";
import {literatureTrashCleanupResources} from "./literature-trash-cleanup-resources.mjs";
import {literatureMetadataResources} from "./literature-metadata-resources.mjs";
import {literatureImportJobsResources} from "./literature-import-jobs-resources.mjs";
import {literatureDoiResources} from "./literature-doi-resources.mjs";
import {literatureReferenceResources} from "./literature-reference-resources.mjs";
import {literatureAttachmentResources} from "./literature-attachment-resources.mjs";
import {literaturePdfImportResources} from "./literature-pdf-import-resources.mjs";
import {literatureConceptResources} from "./literature-concept-resources.mjs";
import {literatureReadingUnitResources} from "./literature-reading-unit-resources.mjs";
import {literatureReadingEvidenceResources} from "./literature-reading-evidence-resources.mjs";
import {literaturePaperContextResources} from "./literature-paper-context-resources.mjs";
import {literatureContextCatalogResources} from "./literature-context-catalog-resources.mjs";
import {literatureConceptRetrievalResources} from "./literature-concept-retrieval-resources.mjs";
import {literatureSemanticIndexResources} from "./literature-semantic-index-resources.mjs";
import {literatureContextMetadataResources} from "./literature-context-metadata-resources.mjs";

function nativeManifest() {
  return {formatVersion: 2, id: "literature_library", version: "0.1.0", apiVersion: 1,
    dependencies: {required: [], optional: []}, consumes: {required: [], optional: []},
    native: {protocolVersion: 2, os: "macos", arch: "aarch64", entry: "native/macos-aarch64/literature-library-host"},
    provides: ["literature.note-trace-decision", "literature.catalog-read", "literature.catalog-save",
      "literature.nal-query-collections", "literature.nal-bootstrap", "literature.nal-annotation",
      "literature.nal-mutation", "literature.duplicate-review", "literature.duplicate-undo", "literature.duplicate-merge", "literature.lifecycle", "literature.trash-cleanup", "literature.metadata", "literature.import-jobs", "literature.doi-preview", "literature.reference-records", "literature.attachments", "literature.pdf-import", "literature.concepts", "literature.reading-units", "literature.reading-evidence", "literature.structured-validation", "literature.unreviewed-selection", "literature.editable-template-validation", "literature.paper-context", "literature.paper-context-preview", "literature.paper-context-prepare", "literature.context-metadata", "literature.paper-retrieval-trace", "literature.concept-retrieval", "literature.semantic-index", "literature.analysis-history", "literature.analysis-workflow", "literature.evidence-matrix", "literature.evidence-read", "literature.derived-views", "literature.evidence-write", "literature.research-export", "literature.browser-capture", "literature.reading-history", "literature.paper-confirmation"].map(id => ({id, version: 1}))};
}

test("the literature command has one fixed zero-argument build entry", () => {
  assert.equal(buildLiteratureNativePlugin.length, 0);
});

test("the literature command retains locked offline-only argv before doing a build", () => {
  for (const flag of ["--online", "--project=other", "--protocol=1"]) {
    const result = spawnSync(process.execPath, ["scripts/build-literature-native-plugin.mjs", flag], {encoding: "utf8"});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: node scripts\/build-literature-native-plugin\.mjs \[--offline\] \(always locked\/offline\)/u);
    assert.equal(result.stdout, "");
  }
});

test("the actual native and combined builders share the closed method artifact gate", () => {
  assert.equal(nativeManifest().provides.length, 41);
  assert.doesNotThrow(() => assertLiteratureNativeBuildManifest(nativeManifest()));
  for (const mutate of [
    value => {value.provides[40].id = "literature.paper-confirmation.execute-sql";},
    value => {value.provides[40].version = 2;},
    value => {value.provides[39].id = "literature.reading-history.execute-sql";},
    value => {value.provides[39].version = 2;},
    value => {value.provides[38].id = "literature.browser-capture.execute-sql";},
    value => {value.provides[38].version = 2;},
    value => {value.provides[36].id = "literature.evidence-write.execute-sql";},
    value => {value.provides[37].id = "literature.research-export.execute-sql";},
    value => {value.provides[37].version = 2;},
    value => {value.provides[36].version = 2;},
    value => {value.provides[35].id = "literature.derived-views.execute-sql";},
    value => {value.provides[35].version = 2;},
    value => {value.provides[33].id = "literature.evidence-matrix.execute-sql";},
    value => {value.provides[33].version = 2;},
    value => {value.provides.splice(33, 1);},
    value => {value.provides.push({...value.provides[33]});},
    value => {value.provides.pop();},
    value => {value.provides.push({id: "literature.unknown", version: 1});},
    value => {value.provides[7] = {...value.provides[0]};},
    value => {value.provides[7].id = "literature.duplicate-merge";},
    value => {value.provides[7].version = 2;},
    value => {value.provides[8].id = "literature.duplicate-undo.execute-sql";},
    value => {value.provides[8].version = 2;},
    value => {value.provides[9].id = "literature.duplicate-merge.execute-sql";},
    value => {value.provides[9].version = 2;},
    value => {value.provides[10].id = "literature.lifecycle.execute-sql";},
    value => {value.provides[10].version = 2;},
    value => {value.provides[11].id = "literature.trash-cleanup.execute-sql";},
    value => {value.provides[11].version = 2;},
    value => {value.provides.splice(11, 1);},
    value => {value.provides.push({...value.provides[11]});},
    value => {value.provides[12].id = "literature.metadata.execute-sql";},
    value => {value.provides[12].version = 2;},
    value => {value.provides.splice(12, 1);},
    value => {value.provides.push({...value.provides[12]});},
    value => {value.provides[13].id = "literature.import-jobs.execute-sql";},
    value => {value.provides[13].version = 2;},
    value => {value.provides.splice(13, 1);},
    value => {value.provides.push({...value.provides[13]});},
    value => {value.provides[14].id = "literature.doi-preview.execute-sql";},
    value => {value.provides[14].version = 2;},
    value => {value.provides.splice(14, 1);},
    value => {value.provides.push({...value.provides[14]});},
    value => {value.provides[15].id = "literature.reference-records.execute-sql";},
    value => {value.provides[15].version = 2;},
    value => {value.provides.splice(15, 1);},
    value => {value.provides.push({...value.provides[15]});},
    value => {value.provides[16].id = "literature.attachments.execute-sql";},
    value => {value.provides[16].version = 2;},
    value => {value.provides.splice(16, 1);},
    value => {value.provides.push({...value.provides[16]});},
    value => {value.provides[17].id = "literature.pdf-import.execute-sql";},
    value => {value.provides[17].version = 2;},
    value => {value.provides.splice(17, 1);},
    value => {value.provides.push({...value.provides[17]});},
    value => {value.provides[18].id = "literature.concepts.execute-sql";},
    value => {value.provides[18].version = 2;},
    value => {value.provides.splice(18, 1);},
    value => {value.provides.push({...value.provides[18]});},
    value => {value.provides[19].id += ".execute-sql";},
    value => {value.provides[19].version = 2;},
    value => {value.provides.splice(19, 1);},
    value => {value.provides.push({...value.provides[19]});},
    value => {value.provides[20].id += ".execute-sql";},
    value => {value.provides[20].version = 2;},
    value => {value.provides.splice(20, 1);},
    value => {value.provides.push({...value.provides[20]});},
    value => {value.provides[21].id += ".execute-sql";},
    value => {value.provides[21].version = 2;},
    value => {value.provides.splice(21, 1);},
    value => {value.provides.push({...value.provides[21]});},
    value => {value.provides[22].id += ".execute-sql";},
    value => {value.provides[22].version = 2;},
    value => {value.provides.splice(22, 1);},
    value => {value.provides.push({...value.provides[22]});},
    value => {value.provides[23].id += ".execute-sql";},
    value => {value.provides[23].version = 2;},
    value => {value.provides.splice(23, 1);},
    value => {value.provides.push({...value.provides[23]});},
    value => {value.provides[24].version = 2;},
    value => {value.provides[25].id += ".execute-sql";},
    value => {value.provides[25].version = 2;},
    value => {value.provides.splice(25, 1);},
    value => {value.provides.push({...value.provides[25]});},
    value => {value.provides[28].id += ".execute-sql";},
    value => {value.provides[28].version = 2;},
    value => {value.provides.push({...value.provides[28]});},
    value => {value.provides[30].id += ".execute-sql";},
    value => {value.provides[30].version = 2;},
    value => {value.provides.push({...value.provides[30]});},
    value => {value.provides.reverse();},
    value => {value.native.protocolVersion = 1;},
    value => {value.id = "writing_projects";},
  ]) {
    const value = nativeManifest();
    mutate(value);
    assert.throws(() => assertLiteratureNativeBuildManifest(value), /literature_native_profile_mismatch/u);
  }
});

test("duplicate-review resource copies retain the three original SQL byte contracts", async () => {
  // Grants and the private F64Bits -> Text column mapping stay in Core. This
  // build check verifies the exact package resources, without another grant map.
  for (const [file, size, sha256] of [
    ["duplicate-candidates-list.v1.sql", 454, "9c54803c87939193c921523392160319cba4df269585a0a370974020f6c604b7"],
    ["duplicate-candidate-decide.v1.sql", 141, "b14dfd0e27351620cc3eb70799842748f25188b6f169f41bd3f1cac63ed044d7"],
    ["duplicate-merge-history.v1.sql", 447, "2ba4edfbf0ddb01ebd152ec818effa02304e3e5b8d490713fe6bea4cd56c0300"],
  ]) {
    const bytes = await fs.readFile(new URL(`../native/data/${file}`, import.meta.url));
    assert.equal(bytes.length, size);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha256);
    assert.notEqual(bytes.at(-1), 10);
  }
});

test("trash cleanup adds a fixed 216-resource artifact list with original 204 SQL bytes", async () => {
  assert.equal(literatureTrashCleanupResources.length, 216);
  assert.equal(new Set(literatureTrashCleanupResources).size, 216);
  assert.ok(Object.isFrozen(literatureTrashCleanupResources));
  const cleanup = [];
  for (const [index, filename] of literatureTrashCleanupResources.entries()) {
    assert.match(filename, /^[a-z0-9_-]+\.v1\.sql$/u);
    const bytes = await fs.readFile(new URL(`../native/data/${filename}`, import.meta.url));
    assert.notEqual(bytes.at(-1), 10);
    if (index < 204) cleanup.push({filename, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.length});
  }
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(cleanup)).digest("hex"), "b185ad5808b5e9a71d97e8cac66c5703302e18e6a1c71861b8114976426eab38");
  assert.deepEqual(literatureTrashCleanupResources.slice(204), [
    "trash-cleanup-expired-ids.v1.sql",
    "trash-cleanup-item-exists.v1.sql",
    "trash-cleanup-deletion-impact.v1.sql",
    "trash-cleanup-content-objects.v1.sql",
    "trash-cleanup-fts-delete.v1.sql",
    "trash-cleanup-item-delete.v1.sql",
    "trash-cleanup-gc-scheduled.v1.sql",
    "trash-cleanup-orphan-creators-delete.v1.sql",
    "trash-cleanup-orphan-tags-delete.v1.sql",
    "catalog-list-trash-ids.v1.sql",
    "catalog-search-trash-fts-ids.v1.sql",
    "catalog-search-trash-year-ids.v1.sql"
  ]);
});

test("metadata adds only 29 fixed original SQL resources and reuses existing relationship resources", async () => {
  assert.equal(literatureMetadataResources.length, 29);
  assert.equal(new Set(literatureMetadataResources).size, 29);
  assert.ok(Object.isFrozen(literatureMetadataResources));
  const records = [];
  for (const filename of literatureMetadataResources) {
    assert.match(filename, /^metadata-[a-z-]+\.v1\.sql$/u);
    const bytes = await fs.readFile(new URL(`../native/data/${filename}`, import.meta.url));
    assert.notEqual(bytes.at(-1), 10);
    records.push({filename, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.length});
  }
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex"), "92bfffbf877fb98e777fb0ed6db909eb8174fecdb3c93a0f302b8e424701ff94");
});

test("import jobs add exactly nine original SQL resources without changing old inputs", async () => {
  assert.deepEqual(literatureImportJobsResources, [
    "import-jobs-header.v1.sql", "import-jobs-results.v1.sql", "import-jobs-create-header.v1.sql",
    "import-jobs-insert-pending.v1.sql", "import-jobs-counts.v1.sql", "import-jobs-finish.v1.sql",
    "import-jobs-result.v1.sql", "import-jobs-list-ids.v1.sql", "import-jobs-cancel.v1.sql",
  ]);
  assert.equal(new Set(literatureImportJobsResources).size, 9);
  assert.ok(Object.isFrozen(literatureImportJobsResources));
  const records = [];
  for (const filename of literatureImportJobsResources) {
    const bytes = await fs.readFile(new URL(`../native/data/${filename}`, import.meta.url));
    assert.notEqual(bytes.at(-1), 10);
    records.push({filename, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.length});
  }
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex"), "377c60e6f3a2dc571dbb0b6c4de3fa6b77df9b6fd0a917ad49aed5daf33688fa");
});

test("DOI preview adds three original autocommit statements without a broader result update", async () => {
  assert.deepEqual(literatureDoiResources, [
    "doi-preview-result-failed.v1.sql", "doi-preview-candidate-insert.v1.sql", "doi-preview-job-queued.v1.sql",
  ]);
  assert.ok(Object.isFrozen(literatureDoiResources));
  for (const [index, bytesExpected, sha256] of [
    [0, 149, "8e361f52e94765b86e2f7eb123f9712cbfbab1078dc58b35145218a9c97d2f9b"],
    [1, 240, "6a1a5cbc42a5e39de780786d4d95ff43c97c0a8fd71ccf3c15beeee358e294dc"],
    [2, 118, "e19da19f93cf50ad23c2134a6a1864ba0ce7783d462d99497c655d1ffac83cfb"],
  ]) {
    const bytes = await fs.readFile(new URL(`../native/data/${literatureDoiResources[index]}`, import.meta.url));
    assert.equal(bytes.length, bytesExpected);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha256);
    assert.notEqual(bytes.at(-1), 10);
    if (index === 0) assert.doesNotMatch(bytes.toString(), /item_id/u);
  }
});

test("reference records add exactly the eight original list/save statements", async () => {
  const expected = [
    ["ids", 97, "732f26c8921c2378bde944653acdf136083d7167b3ab1bc5a74d7160c9999257"],
    ["record", 342, "1f8b80efdd02b0a62b73af267fec267dded4627d6bc6ac0d3061cfa5a8095643"],
    ["anchor-belongs", 74, "61ecf08567083debd6e54a8563fef4db418e460ed028c6fafd38637f8574a9ad"],
    ["matched-exists", 62, "80173affeca72358c1f958dbd4ec8d9504d17be12244789698f38cdc0ef79d1b"],
    ["insert", 487, "27fb074cd59409283f6ad5febfbe429bfad95981e096b4f096bb8e6383f10ed2"],
    ["header", 108, "ef03df684ce11bccb7eedf614ad81285db571a3cee0942cefa172564d6398697"],
    ["update", 440, "3a6a9feaf0f6e607f6b180bc9cbc014d21caaf8015b65454d4180f95adb9762b"],
    ["revision", 250, "8c09f3e0b87bc3d2bd6dfd94da74ce93a1205b00d1a2faa982b9b439c315822b"],
  ];
  assert.deepEqual(literatureReferenceResources, expected.map(([key]) => `reference-records-${key}.v1.sql`));
  assert.ok(Object.isFrozen(literatureReferenceResources));
  for (const [index, [, size, sha256]] of expected.entries()) {
    const bytes = await fs.readFile(new URL(`../native/data/${literatureReferenceResources[index]}`, import.meta.url));
    assert.equal(bytes.length, size);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha256);
    assert.notEqual(bytes.at(-1), 10);
  }
});

test("attachment artifact inputs preserve the seventeen original statement byte contracts", async () => {
  assert.equal(literatureAttachmentResources.length, 17);
  assert.equal(new Set(literatureAttachmentResources).size, 17);
  assert.ok(Object.isFrozen(literatureAttachmentResources));
  const records = [];
  for (const filename of literatureAttachmentResources) {
    const bytes = await fs.readFile(new URL(`../native/data/${filename}`, import.meta.url));
    assert.notEqual(bytes.at(-1), 10);
    records.push({filename, byteSize: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex")});
  }
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex"),
    "9ef839b496eec695001d1361b9615edf3c8f4cc5c6412ee9fd26af915234bf97");
});

test("PDF import keeps its original queued header and ten original worker statements", async () => {
  assert.equal(literaturePdfImportResources.length, 10);
  assert.equal(new Set(literaturePdfImportResources).size, 10);
  assert.ok(Object.isFrozen(literaturePdfImportResources));
  const records = [];
  for (const filename of literaturePdfImportResources) {
    const bytes = await fs.readFile(new URL(`../native/data/${filename}`, import.meta.url));
    assert.notEqual(bytes.at(-1), 10);
    if (filename === "pdf-import-create-header.v1.sql") assert.match(bytes.toString(), /'pdf', 'queued'/u);
    records.push({filename, byteSize: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex")});
  }
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex"),
    "321865f9d78e30ea7aa723494fc962d8cca8229ecf3e3a2186ec19523fb2ed2c");
});

test("concept search/save adds only seven original SQL byte contracts", async () => {
  const expected = [
    ["search", 744, "fb65718d36365e147caafd10c0b860c0d39a658401f322a2d519448c77cd26cc"],
    ["name-active", 72, "fe84ba2557b8c053610e9f83584d7ccb6712fb508715b6621f10dc8fd62c20f9"],
    ["merged", 110, "c70f9c07b3bebe4f8dc60a6eaa990a03d9c2413a41ecf520a74f48a95335fe27"],
    ["current-revision", 43, "865fd86364266e591a1276fb7c8797454fb53a6e0a58398501b4fae545a23edf"],
    ["alias-update", 133, "2e52cd8f98ea6f6e68182cee24f1a7eb4cbc93301664d8776b6142b433e713e0"],
    ["preferred-upsert", 243, "a74c0042def12616afb434abf00f731bd20dad8c49d9658157a17e188744898c"],
    ["update", 226, "4ba5240986958942e9a05b465cf19c4f0a691d5b79cd2460e9da5361a4031811"],
  ];
  assert.deepEqual(literatureConceptResources, expected.map(([key]) => `concepts-${key}.v1.sql`));
  assert.ok(Object.isFrozen(literatureConceptResources));
  for (const [index, [, size, sha256]] of expected.entries()) {
    const bytes = await fs.readFile(new URL(`../native/data/${literatureConceptResources[index]}`, import.meta.url));
    assert.equal(bytes.length, size);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha256);
    assert.notEqual(bytes.at(-1), 10);
  }
});

test("manual reading units add only seven original SQL resources", async () => {
  const expected = [
    [
      "read",
      539,
      "e088ef029fe20a03547397fbe665f503cdb378e322ba01a3e3d7bee19104e297"
    ],
    [
      "template-read",
      99,
      "c827b690470f6cc07452662c2ffa3036fe2ca71d11fa01a1d40f9558997db7ba"
    ],
    [
      "list",
      210,
      "32b73afd8a1b193055da95c131ad04ee4ae86128a72049a0ebc08043a9b4aa69"
    ],
    [
      "current-revision",
      83,
      "deb2d2990b839ce980db847d2535af745e95735c356e60e582a5ba8ff6738aa0"
    ],
    [
      "update",
      254,
      "86b7f84aa0d66dc9094ac003e76f5fad0a2d7761ec53435d5b7027b57df0034b"
    ],
    [
      "insert",
      371,
      "e1f2f6e43ea347c067001e3cd3c02d183018a442b3fad3ce024163d27e829d34"
    ],
    [
      "evidence-upsert",
      315,
      "75574a68c41feb07e1be76774599be581ad0288b18c5b5588db96423d33fe80d"
    ]
  ];
  assert.deepEqual(literatureReadingUnitResources, expected.map(([key]) => `reading-units-${key}.v1.sql`));
  assert.ok(Object.isFrozen(literatureReadingUnitResources));
  for (const [index, [, size, sha256]] of expected.entries()) {
    const bytes = await fs.readFile(new URL(`../native/data/${literatureReadingUnitResources[index]}`, import.meta.url));
    assert.equal(bytes.length, size);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha256);
  }
});

test("HBS extends the original two evidence reads only with validation latest", async () => {
  const expected = [
    [
      "snapshot-hash",
      76,
      "9fd93259f0cb66e07ac7759be59697ea33c853cbf9a5df428d8fd15e868d5f7d"
    ],
    [
      "snapshot-rows",
      278,
      "17bdfcf4e74fe021b781f8bcdb48f8a35266f3e99f4f7c6c8af107a9b8388e6b"
    ],
    [
      "validation-latest",
      97,
      "bfc8196efd5310654731f39829cf65e00c1d1eeba62225263923b65e17815e84"
    ]
  ];
  assert.deepEqual(literatureReadingEvidenceResources, expected.map(([key]) => `reading-evidence-${key}.v1.sql`));
  assert.ok(Object.isFrozen(literatureReadingEvidenceResources));
  for (const [index, [, size, sha256]] of expected.entries()) {
    const bytes = await fs.readFile(new URL(`../native/data/${literatureReadingEvidenceResources[index]}`, import.meta.url));
    assert.equal(bytes.length, size);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha256);
  }
  const latest = await fs.readFile(new URL("../native/data/reading-evidence-validation-latest.v1.sql", import.meta.url), "utf8");
  assert.equal(latest, "select id from paper_context_snapshots where paper_id=?1 order by created_at desc,id desc limit 1");
});


test("authorized PDF context preserves original context and ordered preview SQL resources and existing evidence reads", async () => {
  const expected = [
    ["attachments-paper-exists",85,"0d11774cf214b7a223310792c915b535f5fcda72d3f795a9526bd915174b3edf"],
    ["attachments-all",153,"92f40882515e701625d31078c13439982c879162561faa8b1a14df3833e6bd50"],
    ["attachments-exact",136,"db3d31b54f18d626af0a41300080a279dfa627a028a332d77db4833c0010501c"],
    ["snapshot-load-header",125,"89c66d6d96446fa73d1d131a4a9c6f200507d394ec7fd1b675f3ccfbb5cca1d3"],
    ["snapshot-load-attachments",139,"b2c9f32eb2e6648463a3759dc5d0825dec0f36d5942a9a684f32620babfded1d"],
    ["snapshot-load-items",315,"4763cfa6778a79d1c1043892e136e0b63e327605ae3d65f09dca682cd2f11446"],
    ["snapshot-persist-find-hash",62,"c021b0efb0880ed343e54910b95f07bcd7a3cb20847c585ddaa594abf9c5db2d"],
    ["snapshot-membership",158,"1afd1b147dec7731e81deb9d5b73bb5fd0a24dad2388533ec864bc616d6cbfec"],
    ["snapshot-item-geometry",119,"6aac9350194c0edf4c5d1cb60b9a18be050b9845b63c10922cd6052e972808ef"],
    ["snapshot-repair-delete-items",52,"8970fcf52e4e3eadf432e4c42b64665d9ea839c59dfd4c939f67b77c813acdab"],
    ["snapshot-repair-delete-attachments",58,"da86c8c2d617c11b1aa045bf54358c449c399ee92bac90a9dc7f4d11008e9986"],
    ["snapshot-repair-delete-header",47,"8ae9b8212b4ee86dc0bda394c341696eabbf76d052bc39d1fe74a61f50d57fa5"],
    ["snapshot-persist-insert-header",181,"8f9d17e3cb6bafac7ca3b350653f6928bc4467739654c6477757b7b31560ee20"],
    ["snapshot-persist-insert-attachment",159,"bf0f9052bdc7fc234c615ac397bc495ab511cc0aa297583dc1fd4fdfa276fc62"],
    ["snapshot-persist-insert-item",441,"15e1c79d0a044b72734ea1a81f8afc53fbe4704b7c499fe2505c548b629f322c"],
    ["preview-header",182,"8593ed6b370bef89103628a517a1ea58dfd0f0632e4fcb6d5c50161a7a94c68c"],
    ["preview-items-budget",551,"1db71f102eb62bb47f1703116b1fef25de31184eac8475dd8eec0dd16ceb4d72"],
    ["preview-attachments-budget",154,"6234a0c4d6bbbf4b226e23bf80eb063dc209f8487de3d2f01da3c88f79be753d"],
    ["session-latest",141,"5151ea26e786d8dd99a815aa4f972cc1bd141fe0a354894098e022e20ca30363"],
    ["session-summary",384,"4ae724e71c272a08a6498fbe75a5e25ff6a02c500d7008107e57f31303518025"]
  ];
  assert.deepEqual(literaturePaperContextResources, expected.map(([key]) => `paper-context-${key}.v1.sql`));
  assert.ok(Object.isFrozen(literaturePaperContextResources));
  assert.equal(new Set(literaturePaperContextResources).size, expected.length);
  for (const [index, [, size, sha256]] of expected.entries()) {
    const bytes = await fs.readFile(new URL(`../native/data/${literaturePaperContextResources[index]}`, import.meta.url));
    assert.equal(bytes.length, size);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha256);
    assert.notEqual(bytes.at(-1), 10);
  }
  assert.deepEqual(literatureReadingEvidenceResources.slice(0, 2), [
    "reading-evidence-snapshot-hash.v1.sql", "reading-evidence-snapshot-rows.v1.sql",
  ]);
});

test("context catalog packages only the two unchanged original inventory statements", async () => {
  const expected = [
    ["papers", 267, "248da1be21fc97b914c0631a2fe59353ac80849471fe7e8d6072ff0d1ed5e7f6"],
    ["pdf-attachments", 105, "e9bffd3fa0ece61539bd06341b6a659725c686f43733074fe81dcbc7f4c13be4"],
  ];
  // Frozen SQL expectations remain independent of the canonical package files.
  const literals = [
    "select id,title from bibliographic_items i where trashed_at is null and (instr(lower(title||' '||abstract_text),lower(?1))>0 or exists(select 1 from attachments a where a.item_id=i.id and instr(lower(a.display_name),lower(?1))>0)) order by updated_at desc,id limit 60",
    "select id,display_name from attachments where item_id=?1 and attachment_kind='pdf' order by created_at,id"
  ];
  assert.ok(Object.isFrozen(literatureContextCatalogResources));
  assert.deepEqual(literatureContextCatalogResources, expected.map(([key]) => `context-catalog-${key}.v1.sql`));
  for (const [index, [, size, sha256]] of expected.entries()) {
    const bytes = await fs.readFile(new URL(`../native/data/${literatureContextCatalogResources[index]}`, import.meta.url));
    assert.equal(bytes.length, size);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha256);
    assert.deepEqual(bytes, Buffer.from(literals[index]));
    assert.notEqual(bytes.at(-1), 10);
  }
});

test("context metadata preserves the three original ordered statements without trailing newlines", async () => {
  const expected = [
    ["header", 283, "b34406f491c6bbf0dc5da5a9eb31f6b37409b8de8caaa0f9319bf125ecb1a784"],
    ["creators", 169, "9ac0b30cc86ae93f1e42f82b9e123e122cac5fce8c4fd972c4d0244f999c9294"],
    ["identifiers", 76, "aa4dd69c737cf0b24ef022da422207c9782301b06afb1f8349758c9a66171ed1"],
  ];
  // Frozen SQL expectations remain independent of the canonical package files.
  const literals = [
    "select json_object('title',title,'itemType',item_type,'abstract',abstract_text,'year',issued_year,'container',container_title,'volume',volume,'issue',issue,'pages',pages,'url',url,'language',language,'bibtexKey',bibtex_key) from bibliographic_items where id=?1 and trashed_at is null",
    "select c.family_name||' '||c.given_name||' '||c.literal_name,ic.role from item_creators ic join creators c on c.id=ic.creator_id where ic.item_id=?1 order by ic.position",
    "select kind,display_value from identifiers where item_id=?1 order by kind,id"
  ];
  assert.ok(Object.isFrozen(literatureContextMetadataResources));
  assert.equal(new Set(literatureContextMetadataResources).size, 3);
  assert.deepEqual(literatureContextMetadataResources, expected.map(([key]) => `context-metadata-${key}.v1.sql`));
  for (const [index, [, size, sha256]] of expected.entries()) {
    const bytes = await fs.readFile(new URL(`../native/data/${literatureContextMetadataResources[index]}`, import.meta.url));
    assert.equal(bytes.length, size);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha256);
    assert.deepEqual(bytes, Buffer.from(literals[index]));
    assert.notEqual(bytes.at(-1), 10);
  }
});

test("retrieval preview retains nineteen original SQL byte resources without added newline", async () => {
  const expected = [
  [
    "concept-retrieval-paper-exists.v1.sql",
    62,
    "80173affeca72358c1f958dbd4ec8d9504d17be12244789698f38cdc0ef79d1b"
  ],
  [
    "concept-retrieval-lexical-search.v1.sql",
    179,
    "a74e3b6b1d3aab402f504842f9e071984e85eb5958ffc1aa3ca7177119577c6b"
  ],
  [
    "concept-retrieval-lease-insert.v1.sql",
    300,
    "063b46c2bc389528c54e3083eff4752f7fc88add8f131a06f8c1a4d7b8ff6d0b"
  ],
  [
    "concept-retrieval-lease-release.v1.sql",
    93,
    "9b382b488f104c73e3db73169622e37da4f3004450c0287c7ae099523c52ab1a"
  ],
  [
    "concept-retrieval-vector-target.v1.sql",
    617,
    "e8f893955cb2ddb494136574076966f3f63a67caf7dce5793daa8a784d77a07f"
  ],
  [
    "concept-retrieval-vector-valid.v1.sql",
    456,
    "32d2810b1870e1b37774f36f3d2554125e28b1f103f2c3831d0aa630d80b9072"
  ],
  [
    "concept-retrieval-concept-identity.v1.sql",
    462,
    "2f6b2d3433f6744eb8e0f764ea30bf908d22a30d2b6159ac58c1c2ba39dee5ab"
  ],
  [
    "concept-retrieval-graph.v1.sql",
    410,
    "08d97fb1d4cc79fdfa5d229f0a3155697e3bbbead087d9ffcfc680893c4c01a2"
  ],
  [
    "concept-retrieval-definition-sources.v1.sql",
    947,
    "07cee7ef545515f8e7ff3fd5277ad76673537bf2210d6c5c46e4a7d601583ad1"
  ],
  [
    "concept-retrieval-usage-sources.v1.sql",
    930,
    "14d87eff133150a961bd3a11d8c55ac2c92e4466386aa9653b086f816bf19b2c"
  ],
  [
    "concept-retrieval-trace-insert.v1.sql",
    478,
    "620013fd7fce75dcafaf3ac466d88c2d40a4f71686def20795ce49252772ef57"
  ],
  [
    "concept-retrieval-trace-expiry.v1.sql",
    61,
    "18443123fbd8b891b282659ed1f5db66d058a21b11054bcef77124acb1008b03"
  ],
  [
    "concept-retrieval-trace-seed-insert.v1.sql",
    280,
    "d5d7984b34ec5c23e58e0a4d6af9c0bba50e0f6b1fe4443bb8d2f36d6e819011"
  ],
  [
    "concept-retrieval-trace-edge-insert.v1.sql",
    281,
    "cba0371e891459c808a304824b4bd2dd88a50409f57785e59ac3d5dbd2649395"
  ],
  [
    "concept-retrieval-trace-source-insert.v1.sql",
    392,
    "75d93a2ea69d87b2ff630bf13dc282b6d34375bd0ff7054e8d20082ec9d2b30d"
  ],
  [
    "concept-retrieval-trace-header.v1.sql",
    254,
    "1db6a953520fb5609e87b50e7e25644fb2ae9119203ac14abbdaebb09b5b089b"
  ],
  [
    "concept-retrieval-trace-seeds.v1.sql",
    227,
    "9cd0b9e2017fec7c22e55a09d3adb8f6485949a66dad39c0a05f025addce296a"
  ],
  [
    "concept-retrieval-trace-edges.v1.sql",
    233,
    "15cb4d5a679e5c26b899fe278dd7fe0dbe425d17a6eb30b0341d875f27b8ee7b"
  ],
  [
    "concept-retrieval-trace-sources.v1.sql",
    316,
    "f2bc9c0096e305d6dbad28e02f3fd225c0bf9ef3eb48bf9f1503aa096083280b"
  ]
];
  assert.deepEqual(literatureConceptRetrievalResources, expected.map(([file]) => file));
  for (const [file, size, hash] of expected) {
    const bytes = await fs.readFile(new URL(`../native/data/${file}`, import.meta.url));
    assert.equal(bytes.length, size);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash);
    assert.equal(bytes.at(-1) === 10, false);
  }
});

test("semantic index pins original resources with the approved pending-generation retry priority", async () => {
  assert.ok(Object.isFrozen(literatureSemanticIndexResources));
  assert.equal(literatureSemanticIndexResources.length, 46);
  assert.equal(new Set(literatureSemanticIndexResources).size, 46);
  const observed = [];
  for (const file of [...literatureSemanticIndexResources].sort()) {
    const bytes = await fs.readFile(new URL(`../native/data/${file}`, import.meta.url));
    observed.push(file + "\0" + bytes.length + "\0" + crypto.createHash("sha256").update(bytes).digest("hex"));
  }
  assert.equal(crypto.createHash("sha256").update(observed.join("\n")).digest("hex"), "c5d7c4c3e0aae20b7ef358b4c49052476577219a298317261e409e0e86374627");
});

test("legacy reading history retains the five original SQL bodies", async () => {
  const {literatureReadingHistoryResources} = await import("./literature-reading-history-resources.mjs");
  const hashes = [
    "737ebb2ae7aaa0f3687e8738d6ce1c1429ed824b815409a35f90e761cce5946f",
    "b6a7f0d96adc2ec49dd79da81c32e74ae32a93f962fce80b9e9e881e05120d54",
    "d8026b7c5a3a422c5745f6aa0a494c264850a7a817917fa800e73128b38a3d98",
    "6dabccc6539f7fc33f3d97b35efd5b3cb448b38aac89dbc1a7f39846e8778e83",
    "15723de47b04405ef1dfc439fb2657d02d2d0e90feb9fbac017b68b9ccf2a0ae",
  ];
  assert.equal(literatureReadingHistoryResources.length, hashes.length);
  for (const [index, filename] of literatureReadingHistoryResources.entries()) {
    const bytes = await fs.readFile(new URL("../native/data/" + filename, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hashes[index]);
  }
});
