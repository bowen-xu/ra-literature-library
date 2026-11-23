import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import {test} from "node:test";
import {literatureAnalysisHistoryResources} from "./literature-analysis-history-resources.mjs";
import {literatureReferenceAcceptanceResources} from "./literature-reference-resources.mjs";
import {literatureMatrixResources} from "./literature-matrix-resources.mjs";
import {literatureEvidenceResources} from "./literature-evidence-resources.mjs";

test("analysis history retains the four original SQL byte resources", async () => {
  const expected = [
  [
    "analysis-history-workflow.v1.sql",
    515,
    "22697a7547ff51686852584ef0c1e4a44766f6059056c4d3629c8ac99599b7da"
  ],
  [
    "analysis-history-latest.v1.sql",
    154,
    "26d43786d1905051ee8818a6f1494f6c89d09857691cb9cc76970957aa9be5e4"
  ],
  [
    "analysis-history-turns.v1.sql",
    164,
    "2a232f201bfde60e4fad1472a6c187e80770a88af4e7b76ac1f0a2c3ee1642aa"
  ],
  [
    "analysis-history-attempts.v1.sql",
    1057,
    "feb1f18c9599db1ba6cea1d03a6dafb40fd2f692a3f122b50e449a4c007e1451"
  ]
];
  assert.ok(Object.isFrozen(literatureAnalysisHistoryResources));
  assert.deepEqual(literatureAnalysisHistoryResources, expected.map(([file]) => file));
  for (const [file, size, sha256] of expected) {
    const bytes = await fs.readFile(new URL("../native/data/" + file, import.meta.url));
    assert.equal(bytes.length, size);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha256);
  }
});

test("AI reference acceptance packages only its finite original transaction resources", async () => {
  const expected = [
    ["reference-records-ai-insert.v1.sql", "754d28131b84e49f21ac2a8442c8f966139b0925670b927d5a3e2988d5789426"],
    ["reference-records-ai-revision.v1.sql", "e7e5ff6830d77f456fcf000aa85151ea33a7ffc7c50ed910fe4599b10f631e92"],
    ["candidate-review-project-contains.v1.sql", "ca10e2afb070fa6b290100644cbe2886a6ed135e3bbc129559defe58f619b736"],
  ];
  assert.deepEqual(literatureReferenceAcceptanceResources, expected.map(([name]) => name));
  assert.ok(Object.isFrozen(literatureReferenceAcceptanceResources));
  for (const [name, hash] of expected) {
    const bytes = await fs.readFile(new URL(`../native/data/${name}`, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash);
  }
});

test("matrix resources retain the original fourteen statement bytes", async () => {
  const expected = [
  [
    "evidence-matrix-ids.v1.sql",
    "8fb349d0ceed36bde6648c62f973e882f371b3288e7d6cc872e6c831ad1dbeb2"
  ],
  [
    "evidence-matrix-cell-header.v1.sql",
    "94da4be46480de58e6b12d92da2ddeb4f8b31595489c020b784bd9942e437290"
  ],
  [
    "evidence-matrix-cell-keys.v1.sql",
    "1797a2109e93b4e2632a061da06e746f18db2a03926309e1a3a5943567145f4a"
  ],
  [
    "evidence-matrix-insert.v1.sql",
    "8706a32abf278cdb29051846fa677054d87fa7cd61f7c11db5b84218f56b4c9b"
  ],
  [
    "evidence-matrix-header.v1.sql",
    "62a827b2a6bd734614428d2f9c352581c6af4baf720f7c7d885842c05e1fc23c"
  ],
  [
    "evidence-matrix-update.v1.sql",
    "f2c891ef824454841d30afc1bf41bf8623067945af5be24e5a3308d0f3d3fd42"
  ],
  [
    "evidence-matrix-revision.v1.sql",
    "b860ac706ba7a1fffd35c9ce1ce690e0e30294dae44a7b6592e76bb55d833791"
  ],
  [
    "evidence-matrix-cell-insert.v1.sql",
    "57d0652608e0150720225b713175685cc5ecd9f843b40dd0848847b196b0a0d2"
  ],
  [
    "evidence-matrix-cell-update.v1.sql",
    "07b843dbbaef451c555cb6819acc79f7c6dd3937e6693f997c7e877ddb1e5024"
  ],
  [
    "evidence-matrix-cell-revision.v1.sql",
    "4f372e343ad30c9a28fa86a08ae2a8afc23114d210c7b16fe26a373adcffa841"
  ],
  [
    "evidence-matrix-matrix.v1.sql",
    "56f3234aba25b70c5c1aac437048a1dac6fc796e7e38a22997e8257f0264adf6"
  ],
  [
    "evidence-matrix-cell.v1.sql",
    "5ac4e16b0550c16694934e836f8301c36767cb14bf2e4176ee05ae23dbf15780"
  ],
  [
    "evidence-matrix-project-belongs.v1.sql",
    "ca10e2afb070fa6b290100644cbe2886a6ed135e3bbc129559defe58f619b736"
  ],
  [
    "evidence-matrix-anchor-belongs.v1.sql",
    "bdb15893e7346797517a3eab447a4486ac44f24d1f69f89020437c0ca04442f4"
  ]
];
  assert.deepEqual(literatureMatrixResources, expected.map(([name]) => name));
  assert.ok(Object.isFrozen(literatureMatrixResources));
  for (const [name, digest] of expected) {
    const bytes = await fs.readFile(new URL(`../native/data/${name}`, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), digest);
  }
});

test("retained matrix dependencies retain four original evidence read statements", async () => {
 const expected=[
  [
    "evidence-read-claims.v1.sql",
    "8e15adc6e35150b2ca5c8296567d8d32ca56b2a37a662c2a6f19e2faa993ad33"
  ],
  [
    "evidence-read-source.v1.sql",
    "e995ba215a620a7ceb895d45606e7b6d7c1921f7fcdd67f03f8b7a77d7743be3"
  ],
  [
    "evidence-read-sources.v1.sql",
    "eaba5530816a93c91aa355a9d6a64d96faec3abeaade1d06f8d346f2a7bb601f"
  ],
  [
    "evidence-read-links.v1.sql",
    "1fffd1c60cb1d8a4b1751fb69e61b964d5eaf15fc60780a91ba68e6969712e3e"
  ]
];
 assert.deepEqual(literatureEvidenceResources, expected.map(([name])=>name));
 for (const [name,digest] of expected) assert.equal(crypto.createHash("sha256").update(await fs.readFile(new URL(`../native/data/${name}`,import.meta.url))).digest("hex"),digest);
});

test("matrix synthesis packages the original context and atomic acceptance statements", async () => {
  const {literatureMatrixSynthesisResources, literatureDerivedAcceptanceResources} = await import("./literature-matrix-synthesis-resources.mjs");
  const expected = [
    ["matrix-synthesis-matches.v1.sql", "4c0ddab235f558219d7d75d4a1f8a33d85781d36fc7cdbe9a46f554d6a7e3f4b"],
    ["matrix-synthesis-cell.v1.sql", "3c5ade2b1a99c33750bca885f70801a0418a71be384834383b1e6729c5c2be5f"],
    ["derived-view-ai-insert.v1.sql", "c70d4f3817c93acf1ca4f95321d76016c0abf075ee0183f3c712d78b7b981948"],
    ["derived-view-ai-revision.v1.sql", "36270ca687038c0983041733896acf7cae5342f9366ba4e90d10e1d16e3c7cc7"],
    ["derived-view-input-snapshot.v1.sql", "f71f9c15f165e0b24845760fed2421310f22b4f6ed24a7808827f24a06ed18a5"],
  ];
  assert.deepEqual([...literatureMatrixSynthesisResources, ...literatureDerivedAcceptanceResources], expected.map(([name]) => name));
  assert.ok(Object.isFrozen(literatureMatrixSynthesisResources));
  assert.ok(Object.isFrozen(literatureDerivedAcceptanceResources));
  for (const [name, hash] of expected) {
    const bytes = await fs.readFile(new URL(`../native/data/${name}`, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash);
  }
});

test("manual derived-view storage retains the six original statements", async () => {
  const {literatureDerivedViewResources} = await import("./literature-derived-view-resources.mjs");
  const expected = [
  [
    "derived-view-ids.v1.sql",
    "814fdf544c99c1de193dd9e173ba50a68fa6e86953df00a0dfc0ae905fe40069"
  ],
  [
    "derived-view-insert.v1.sql",
    "6f7429f043d94e738e6e46b96548217508c5ba116638ac430c9a7b514ce176ce"
  ],
  [
    "derived-view-header.v1.sql",
    "f778b525c34600c30950d5bb5a7c0faf05f043a1f6300702327af67626d4623f"
  ],
  [
    "derived-view-update.v1.sql",
    "604cdc3642d2baef90d831845b7b4aee601fc9d62eae71daa7523bc270aa9f3b"
  ],
  [
    "derived-view-revision.v1.sql",
    "31227960462c069acd3446cfce0dcfeefaea9821317d6f3ed8a776017448836a"
  ],
  [
    "derived-view-view.v1.sql",
    "8f6d105a4e3d76da6de36f9d216ed5d8eefdeb4a883a920bd3909d374e1536cd"
  ]
];
  assert.deepEqual(literatureDerivedViewResources, expected.map(([name]) => name));
  assert.ok(Object.isFrozen(literatureDerivedViewResources));
  for (const [name, hash] of expected) {
    const bytes = await fs.readFile(new URL(`../native/data/${name}`, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash);
  }
});

test("manual evidence writes retain the seven original statements", async () => {
  const {literatureEvidenceWriteResources} = await import("./literature-evidence-write-resources.mjs");
  const expected = [
  [
    "evidence-write-claim.v1.sql",
    "94c41d22dfd850628f56cf4274d14e77970c8735736269a83b574d819f83c83e"
  ],
  [
    "evidence-write-revision.v1.sql",
    "86c635874cd1bfe5cfe6124d343dd66a0f1545b77923bd011c2293c28e8b7cee"
  ],
  [
    "evidence-write-update.v1.sql",
    "f4abd031ffdb06e925fc879045bf5db72aff67584e2112752c71f56718c58624"
  ],
  [
    "evidence-write-insert.v1.sql",
    "ce693af857b843b6c632fb0836493525c5516fd632798cac22e28112d80997c7"
  ],
  [
    "evidence-write-history.v1.sql",
    "9113a4efe5a3cc5f07a6fb92edac17d54c75e862ae489faa647128e37bc7a44f"
  ],
  [
    "evidence-write-link-upsert.v1.sql",
    "9bff8cf2a62b1a199da2227eed2cd96ad691e95b9b074e1abf23cae89532fe65"
  ],
  [
    "evidence-write-link-lookup.v1.sql",
    "a82983c7da7860f99c8f6b8cab1c44182770b6241977c92e409f960c9bb91829"
  ]
];
  assert.deepEqual(literatureEvidenceWriteResources, expected.map(([name]) => name));
  assert.ok(Object.isFrozen(literatureEvidenceWriteResources));
  for (const [name, hash] of expected) {
    const bytes = await fs.readFile(new URL(`../native/data/${name}`, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash);
  }
});

test("accepted knowledge, paper roles and human capture package exact original statements", async () => {
  const {literatureKnowledgePromotionResources} = await import("./literature-knowledge-promotion-resources.mjs");
  const expected = [
    ["concept-foundations-scope.v1.sql","fd1e9c368c820b45c18eb052eca4a514338c103442a6d287954fb9c28e678d36"],
    ["concept-foundations-insert.v1.sql","09251aba2b52e05ef9e83c4fc0e966181da025616142c2256bc20f898d912d6f"],
    ["concept-foundations-papers.v1.sql","2672050979721370c9f3e2d6578e871e622cd1efc6c15fb6cccd04d9cb6d5e3c"],
    ["concept-foundations-sources.v1.sql","1cd9e6eae2460231a3d1de8c75c9d65896b4e900d40f62608df6e88d6babc616"],
    ["concept-algorithm-evolution-exists.v1.sql","c43c68192a281713dc3a07978157c19488eae93eee86522ee06293ebf75a393a"],
    ["concept-algorithm-evolution-papers.v1.sql","739ed01c0ea8db069777d34099b519423c6bd73fb7684c19f7011eb6d6278fc0"],
    ["concept-algorithm-evolution-insert.v1.sql","486f4f6c2800863819d962005d0f29af695e1cbc965a1a6f5f31bdd6486473db"],
    ["concept-algorithm-evolution-source.v1.sql","11317383e9eacdb26d1691f5535dfef9b47ccb7490b0c60e380e6904c326db9b"],
    ["concept-algorithm-run-insert.v1.sql","b6ebed5859a73b8d700ccf5747dddc6263727f3724cb2ef8265bdf109345da42"],
    ["concept-algorithm-run-finish.v1.sql","bdf3d07ed6e9c29c0644f4621b5c1fab9e49d2abacfc11e2ebf569fd13368ce8"],
    ["concept-algorithm-run-fail.v1.sql","91d9d6ca7a8c7443f0c12cae07efdab97d801c0f55b1920f83ff93e6309a15f0"],
    ["concept-algorithm-run-read.v1.sql","7a315f6f824de6a1dff2609c61c64dbbb158f72dce0ad0dccc9667be45be8fec"],
    ["concept-algorithm-run-evolution.v1.sql","da0427206890f6f6c101e4fae11ab123264d4558d5ab8243f24071508355175d"],
    ["concept-algorithm-run-foundations.v1.sql","51f6e4c25593b3336138a77e687c62805875bc8b67ea725449ffffb60fe11e33"],
    ["concept-algorithm-run-concept-watermark.v1.sql","5ed111e60240fddd72077942b18c4ee1fcaf17c444ad89d8df34e39ce5ae791b"],
    ["concept-algorithm-run-relation-watermark.v1.sql","9ed8b1c56d479ac691235fc73776c2dc78b705aacc3477f721a273c16b0f3e16"],
    ["concept-identity-mapping-insert.v1.sql","6b639709d067d13aac07b85f02980cb50384358bad9e14e156ca36bd791c68d4"],
    ["concept-identity-mapping-delete.v1.sql","1d17befd545784e0e603f6a2891414a25d74c057407b20c19750e738e73e7816"],
    ["concept-identity-events-list.v1.sql","bcab48df0a796551403b7fc05f66a9fc8661154ea663b39a25f620f1feb1c949"],
    ["concept-identity-mapping-exists.v1.sql","ba2f2d6970b7773c6100d0873c8891d192c9514b77968c6bd86ebfd22e6cc1cd"],
    ["concept-identity-children-exist.v1.sql","01bfa5094668d38b90811a302216c17a57648ff27d03adb2cac17a9d660608f6"],
    ["concept-identity-summary.v1.sql","deb617f52b2cd6d9df2f91dfeadd7911457c20ecc63d7f458c0e0bd22cb57a7c"],
    ["concept-identity-relations.v1.sql","c1e4f06388af6077132468c4f92fd8fe4c23b9c2eb67f25d82591aeb8ead3e55"],
    ["concept-identity-event-insert.v1.sql","5b3f31535d2a8bb833e2fd91c5627f45d6e3c72bbda5a2fc8d5b4626c6648907"],
    ["concept-identity-impact-insert.v1.sql","b00a46c7646e77a916c67fd2103d9c3331be2ed0ff579c841f5142074be5445c"],
    ["concept-identity-event-read.v1.sql","50d51fe5ef453059ed2e0a7f42173d3edd002220aa6bdd3995c280ad946db7d4"],
    ["concept-identity-active-sources.v1.sql","b0e7b80f03c5de25c7e526e24b34345864dc0b2f690ef6ea92b84a051fad6c2a"],
    ["concept-identity-event-relations.v1.sql","2112cb2b84ad137b1a49229f2a787945b3b97930c9e5efaf686bee2cd546554d"],
    ["concept-identity-jobs-cancel.v1.sql","b5d6b568ed8460f4010a66e8f9cac6c4b34c479469e277d3e401ac771abd9a0b"],
    ["concept-identity-records-tombstone.v1.sql","89d30636ca694a34ae1c39524480137e1e9e0141a48d1fc72e4dc29480cd73ee"],
  ["relation-node-read-concept.v1.sql","652a431e31010bfe6fd3d5da5e59b933fc65dc3d370d32e07a0ce9606bfbcea1"],
  ["relation-node-search-concept.v1.sql","6b1f90cc094abf1a92b8c140fabec80c620475cb105124561f1247936b167b66"],
  ["relation-node-read-definition_claim.v1.sql","2e0a86a31e68b258353a89f3b6f4ce7609914c8055edf982475586ccd8acb216"],
  ["relation-node-search-definition_claim.v1.sql","21f6566b6f1fb0433bbd106b82b96d51fc675de014ccb9e966c865a250a870dd"],
  ["relation-node-read-reading_unit.v1.sql","0384d4ef7da1efc8d049bad78ee64c51fe0cb752d901130f50053cbb38ac91ba"],
  ["relation-node-search-reading_unit.v1.sql","9a2c0f42a6f5bdd987f8a8d32002d0b92ee85f59e80ea44454d49ab75d308571"],
  ["relation-node-read-paper.v1.sql","beda0e5ced9769e97c1ced797cfb9881b9678137832d50ffd04a9024b2413880"],
  ["relation-node-search-paper.v1.sql","35cbd6a0dad3255bbe9915b764dfacb079fe6c429e1f8a46cd93d52ea8f7ba9e"],
  ["relation-node-read-note_page.v1.sql","2632dc010a10467b5fb3dac739b6063e6163829626b82fc7d5e684cec70cd916"],
  ["relation-node-search-note_page.v1.sql","380303f7ba39d761e5d569708c17bc3fe564559b17bbeed1c9c4d9f6327e76c3"],
  ["relation-manual-list.v1.sql","43cf12d03378214151ecafdfe8d85ce2634ecd8ca64baebc0eedc7982399f504"],
  ["relation-manual-insert.v1.sql","cdf17777214a6d036362b81ce80707cf27b57675f24b584c5f208ee08970bcc1"],
  ["relation-manual-update.v1.sql","5aedf559b378c099d2a4404c513326a6163cb8c46b4c9646555818e1bda81f93"],
  ["relation-manual-read.v1.sql","2837e72fb251c41236a9608091966f187ac5d3db07c01031679ad1b555412465"],
  ["relation-manual-evidence-insert.v1.sql","09d12b90fb61495803127b8240e25e9036bb43b57231fe4368e47f7105ff0527"],
  ["definition-manual-current-revision.v1.sql","4578de031322ce28154c54f4a0e76a1d5c3564734813f07411a397fe4c5ab42b"],
  ["definition-manual-update.v1.sql","bcde8d6ed34381972fcdbe99998b0bc746f3b746b46a371d3f46e7e2ebfdb01a"],
  ["definition-manual-list.v1.sql","b4cad6b88c1391115956d07881ee6dbcdd4fb136498f471e1e61d41bb5a6f957"],
  ["knowledge-manual-revisions.v1.sql","c74f7857dad623225f4923fd8b5e4f25c2a5920b29c35e0c71711669c8e4c141"],
  ["concept-capture-anchor-quote.v1.sql", "ba3f1938dceb10860c7e65b3f5f51aab74c42ba7d8c56ae7ee85f199f728b4f6"],
  [
    "paper-concept-assertion-insert.v1.sql",
    "2d0b32a8ac9027052371040ef16bd496878d18987f216567852a1da4681855e7"
  ],
  [
    "paper-concept-assertion-revision-insert.v1.sql",
    "840e64c153c02d580dbf37d60114d38f8cd2d9c8a45fac7a63f3f90ca0619611"
  ],
  [
    "knowledge-promotion-alias-insert.v1.sql",
    "7208c729cbbd99f48d6be01ce9be046b1a72beb1947a59b007e944ed7ab9cbe7"
  ],
  [
    "knowledge-promotion-concept-revision-update.v1.sql",
    "a90136833c3e42bee01be02a3fa6b4f56f0457a7bcd0874cae9401a3aa4402a7"
  ],
  [
    "knowledge-promotion-canonical-concept.v1.sql",
    "385754f47681866ec27b378b3efb499535d19c140d1924e29aa38908d91574bc"
  ],
  [
    "knowledge-promotion-term-usage-read.v1.sql",
    "1ce16ae8541079d31c5579a78dda81b9668991bab550740dc1a68df04df7cf9b"
  ],
  [
    "knowledge-promotion-definition-read.v1.sql",
    "3a9ab7a4750a0719ba5861327cd5de3cb5098720be2b6ecc519504385f2bbfb3"
  ],
  [
    "knowledge-promotion-definition-insert.v1.sql",
    "cfd245a3d90dfd8ffd3f1c5b6e239e4d0cd24cf8ad81f8e400eee0e1ccbd2b1f"
  ],
  [
    "knowledge-promotion-definition-evidence-insert.v1.sql",
    "f85a08ad6cfa3e874ff06c29cc77acc3d3cf17f4c7c2ab0cfcb782959b596a79"
  ],
  [
    "knowledge-promotion-project-exists.v1.sql",
    "9d7fb0dfc0ce5b4d24176d3483315a697c03e8746a27538258ec72f17c086620"
  ],
  [
    "knowledge-promotion-relation-insert.v1.sql",
    "754015311662ab8a77c444a9d5242136889ae82cf6e4022671bf04af86ad8183"
  ],
  [
    "knowledge-promotion-relation-evidence-insert.v1.sql",
    "55162d55a2e18d0106942da61cef07cfaac9705327f0467947227de4b2d5cc46"
  ],
  [
    "knowledge-promotion-term-usage-lookup.v1.sql",
    "1ccf52f3109cc9f1a70d86bb041b7064b312d976750af3f5158cbb8c313acd01"
  ],
  [
    "knowledge-promotion-term-usage-insert.v1.sql",
    "c7382b77a4c7dd7a768ba35943e1061e23265eac38d6ca8e14b1780e1dece129"
  ],
  [
    "knowledge-promotion-relation-concept-node.v1.sql",
    "652a431e31010bfe6fd3d5da5e59b933fc65dc3d370d32e07a0ce9606bfbcea1"
  ],
  [
    "knowledge-promotion-anchor-exists.v1.sql",
    "2b782245169ef7d1328c9d8ab280398b9f8fa7152088573a3ff4893b3d62c4e0"
  ]
];
  assert.ok(Object.isFrozen(literatureKnowledgePromotionResources));
  assert.deepEqual(literatureKnowledgePromotionResources, expected.map(([name]) => name));
  for (const [name, hash] of expected) {
    const bytes = await fs.readFile(new URL(`../native/data/${name}`, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash);
  }
});

test("complete research export retains all original dataset SQL and read order", async () => {
  const {literatureResearchExportResources} = await import("./literature-research-export-resources.mjs");
  const expected = [
    ["research-export-projects.v1.sql", "0710ad1465b802dcfc78db75d438efd1bf17aad2e97d059fb5e6304e1788dea3"],
    ["research-export-papers.v1.sql", "2b36a99f86a9e61470ca147efaf36fd4cfe96e80df76bcb0970bf16041adfe86"],
    ["research-export-creators.v1.sql", "48262135c1b42c9378a3b021aab99091cc1fc5a7f19047d30c7cfaa058f07f35"],
    ["research-export-paper-creators.v1.sql", "481884f6b4fc9e2be5181247a7df97db0cada80dd085b5401cbeb44d055ebc3a"],
    ["research-export-paper-identifiers.v1.sql", "403b0c89366c59c4ddb88b9520804755490f537fcf255785f08465f54b2422d7"],
    ["research-export-paper-metadata-provenance.v1.sql", "26c98aa0816335dee444b1a47aabf3bd7a7707386d9bfed9aa9e88f7688322ad"],
    ["research-export-project-papers.v1.sql", "df49b5e9ffd8a1e86c73c2dd1759f70875f1dfdde3357b414dc25da8d9f3e663"],
    ["research-export-tags.v1.sql", "1875447f9bae5861517244741ed01a7f10eadef3f6fbb403b6d5067fe87c4b92"],
    ["research-export-paper-tags.v1.sql", "30e833df6086eb4382ffce01a95069bf642b595264820feedc180c14aa267a3a"],
    ["research-export-attachments.v1.sql", "a5d0c15bee71f864b1756d87854a27c2bc1498be32676d8d681fa339e54e28ce"],
    ["research-export-source-anchors.v1.sql", "77bcea9e77529965caefeacb41df2864101921e8fc00ef419d44db2daecae317"],
    ["research-export-claims.v1.sql", "d968a88997d2b68ed7fb6baa807b9bccefa533bcec492f2f747d56ba4a883ade"],
    ["research-export-claim-evidence-links.v1.sql", "e7c33494d3eeaf3691a3194846598bbc1111431f86d4288edd39614054c87297"],
    ["research-export-note-pages.v1.sql", "6277c679f062bc5aef1c6b72bbb6b0587195c96099f4bf6c0cb8f0dd31c04eb7"],
    ["research-export-note-page-blocks.v1.sql", "8ebdae293f20998e709f87bdd965a6f5ede2514592e35410a899ceb665da4c22"],
    ["research-export-reading-note-sources.v1.sql", "8c92fdf34421c79b75336ee6ae5b3e4acff5c2f3f249812b94e3a7c85e043c21"],
    ["research-export-note-links.v1.sql", "addcba16d8e31d038b3f5d273f22b8e30587227e51732b37a476a0a5f8aae189"],
    ["research-export-note-page-tags.v1.sql", "aff370fef61eb8dd7e549214880e2cb164e6f5c4aa3f72c548b1b1f6922ddc83"],
    ["research-export-reading-note-tags.v1.sql", "9ed02252837a25786f97029959dcd1dc43e355eaecbfe21d8312b315cb932ba9"],
    ["research-export-project-note-pages.v1.sql", "fec46effff40845479094f0f187545717705fdd060220ec6cd7a5b9d49d37960"],
    ["research-export-project-reading-notes.v1.sql", "db276b11a59593606374d927a3e5c703edb6b416415094ab02698d46e32e49b6"],
    ["research-export-note-revisions.v1.sql", "444fa8fb324a27dd5b4319312f6310162667dfead2bcf540dcd3847155901b3c"],
    ["research-export-note-block-assets.v1.sql", "f845a145c7b5bce4aaed7d831a541652718b4df9966f13bdc6b397acca5f79f0"],
    ["research-export-note-revision-assets.v1.sql", "cd2129457f6b5ea6e6b2b264640ee67e87f9fb3b9dee9714a3a6769b3947839a"],
    ["research-export-structured-reading-units.v1.sql", "143ecbe187e653f3443ab2fcda4098a59cdf3d233870c5b11ee6bace57c46830"],
    ["research-export-reading-unit-evidence-links.v1.sql", "e147c30a45a3348f5fad1dfc02d4822d3cfae5e9e10b78f53b340e2b56ac048a"],
    ["research-export-terms.v1.sql", "b4b7019779b0ab76046bef696577b5f3a342d5214d95567c8357158b2fbefa5c"],
    ["research-export-concepts.v1.sql", "f7a2aabd431bd8dc96938fed79200e27d55de2dc07d35e4b9adb826eb8137841"],
    ["research-export-concept-terms.v1.sql", "c44e5d00bc186766a2c3142f7ef5613a187f97a656aa9b0e9377096408357e25"],
    ["research-export-term-usages.v1.sql", "385ba1204aa72a0858913d01ab7b0d6c6b289237efad688f1f58f20b53acda5e"],
    ["research-export-definition-claims.v1.sql", "92e1725448b6d9a1f50ad431760cab0e6314dd763840176b6585779b2f44a317"],
    ["research-export-definition-evidence-links.v1.sql", "b30b4fb387a417f10c95407377b0c716c50801391fd25314babcdd3223541097"],
    ["research-export-relation-assertions.v1.sql", "352088943d0df5f4b11215596fa2a0882e557054c1d0b9d1e54c5efefdae5eef"],
    ["research-export-relation-evidence-links.v1.sql", "4b8582c494b7e961ae99a81010ab608b789b20a5fb03b0f8306e77243316606a"],
    ["research-export-research-object-revisions.v1.sql", "806915450a5a8285096daec096cd2d172c1ef9672769f62b88d882b1414299e8"],
    ["research-export-concept-identity-events.v1.sql", "ecb238811432ab774f95b89af559218bb103fb621319fff341338e2f0e064b45"],
    ["research-export-concept-identity-mappings.v1.sql", "1595f3be69c128e5227b8023a243e9c0cfd2c46b5204ef5e596b563158f58b18"],
    ["research-export-concept-identity-relation-impacts.v1.sql", "aa6ebfcdc9a6c6afaa0e1f15ebfc54de58eebf6010bf3aae8b68122a035023d8"],
    ["research-export-reading-profiles.v1.sql", "ad3c3b06c16eff57914805f39cd4c022365f0a977d2e2f0bf4b54cb12272b463"],
    ["research-export-paper-reading-profile-selections.v1.sql", "74255ffac11ea6e641fd15a9c4daa4d41ef46fbb1fd29cb6ec8d2fe0ab825767"],
    ["research-export-paper-reading-profile-selection-revisions.v1.sql", "c16d692ba9d3726534f39cb3b6f86da6c6fbcacb539608c7216174693a0950d9"],
    ["research-export-reference-records.v1.sql", "f495ce1c708113386079778130b73e9b54ed2eac9c4a9094f028fab7d1cd2808"],
    ["research-export-reference-record-revisions.v1.sql", "da4d990d8c54d8e2671c41ed24c64fd87275ad150e0b649ec000134564f5fb0f"],
    ["research-export-evidence-matrices.v1.sql", "54d73596c66f211c88c35ef4e15cb41b9774c298a5f70c04a1327bed0e5d77b7"],
    ["research-export-evidence-matrix-revisions.v1.sql", "09cce03c4aa577416bfd9ad54282968470dc904a03cc936b16f0123899fc6f7b"],
    ["research-export-evidence-matrix-cells.v1.sql", "d6c70af57c5867b318017b4281adb626ddb121476f30efd70bf07ac010aa0f04"],
    ["research-export-evidence-matrix-cell-revisions.v1.sql", "52eaaa6dd4533e86182b79b8dea9bc7ff38aa05cdec1ec7626bc4899debaeda3"],
    ["research-export-derived-research-views.v1.sql", "19a12992d3bf6f4276942b7eaeebee1abc159e9c879ca70780d8a56d2a52ad61"],
    ["research-export-derived-research-view-revisions.v1.sql", "263f624a7e91d3f887e1c985611aa70a1b5a1888520c1989d8276eb2bfdde00d"],
    ["research-export-ai-runs.v1.sql", "a0e53c223d202c3d270d2305a9a10883fe8d79e9071411684332372d04843a61"],
    ["research-export-ai-scope-items.v1.sql", "c75158d72d8e6797c03469e6de2d0beb965f8db78d8277261a8214ab20db1fbe"],
    ["research-export-ai-run-stages.v1.sql", "2d3d124a40f32a9dbb446cb0c5137da4d0e40c339371268ee703d3b2c6828320"],
    ["research-export-ai-evidence-bundles.v1.sql", "089f2a4584614bfc9c36eef39fd42e5f289a188aece0515003004946e939bea8"],
    ["research-export-ai-evidence-items.v1.sql", "5d59364e2321ee6ca0baa673dfdec2f4f5b12fa9a81faf34766dae3792336aab"],
    ["research-export-ai-candidates.v1.sql", "bddfcde7a18ff5b73a6c1b66e5495cdae8e3e3630aee31d0018a4c074d4915f2"],
    ["research-export-ai-candidate-revisions.v1.sql", "273dd77331470399d4b9208a61a96ced331467d4069f8f219269b20d4ad5f589"],
    ["research-export-ai-candidate-summary-versions.v1.sql", "2c7392e4bd8dbfeb6b0fc2b6965c04a38796e9069dd41144ed00ee7c9d249d11"],
    ["research-export-ai-review-decisions.v1.sql", "b02a761dd782ec8a4260bb2dfb69e6f24ec107d90fbf7876388135774dc314a3"],
    ["research-export-ai-evidence-inspections.v1.sql", "d6be4fcedc5bed8b49c258bf555e7a08d62310621bb676cbaf7ac3979a6c63db"],
    ["research-export-ai-citation-assessments.v1.sql", "2df46efbb517f540d737d8ce517df4623bb286e37bc3f1b0bca3228bd6f2079e"],
    ["research-export-ai-overview-retry-runs.v1.sql", "66106d7aac70e876c753a4ad8cff097bf2ca6cf800b13be0265e33b875867133"],
    ["research-export-ai-overview-profile-runs.v1.sql", "de50023328e38a0a3462c265decf4f0fcdd260f1ccb9f06c42dcf662871b146c"],
    ["research-export-ai-attention-feedback.v1.sql", "4e76e1cb971822d9a45e98805e1c87d589260114a0a90787cb7eb11bb8a30a93"],
    ["research-export-ai-suggestion-run-contexts.v1.sql", "04c9c4f10ea0b0ec57874841da050bde1b637036b2df059f3c8c62dce0c09f1a"],
    ["research-export-ai-suggestion-item-decisions.v1.sql", "ee5a780cbfbb0af23f505b3d1c8bd9ea5e2cfa3e1b660da7bb450111c85174f5"],
    ["research-export-ai-matrix-synthesis-run-contexts.v1.sql", "23502e88606a930ccf157826ad51f2c8dfb998857e8f53834b6904dbd78a5eff"],
    ["research-export-ai-matrix-synthesis-input-cells.v1.sql", "276b9b9865579fc1b05f1c9b33f6dff397d1e6ba147ab4a57d08252f90df82d9"],
  ];
  assert.ok(Object.isFrozen(literatureResearchExportResources));
  assert.deepEqual(literatureResearchExportResources, expected.map(([name]) => name));
  for (const [name, hash] of expected) {
    const bytes = await fs.readFile(new URL("../native/data/" + name, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash);
  }
});

test("browser capture keeps its original twelve fixed SQL resources", async () => {
  const {literatureBrowserCaptureResources} = await import("./literature-browser-capture-resources.mjs");
  const expected = [
  [
    "browser-capture-session-receipt.v1.sql",
    "09f6ea20a5796a5591a92b2ff3f875b5d3ccfd2598fbf76487a742068744f92d"
  ],
  [
    "browser-capture-session-insert.v1.sql",
    "8d642d32ece5641aae273f4cb0fb93efd145d4ce0828f60cdc539b65bf1405c0"
  ],
  [
    "browser-capture-session-finish.v1.sql",
    "361c41c18f2a31b8386dc90cbb01da6f507ddd970b813225705eb1b8d21bbbcc"
  ],
  [
    "browser-capture-status-receipt.v1.sql",
    "03ed47b47f0993e7731fd1cd7f0cf59c6e6dc6397c933c17dfb5204b3d2ac0f2"
  ],
  [
    "browser-capture-status-attachments.v1.sql",
    "302a47188fa11c750b3997536ab8a269a65f9a1a68a3fcc59cd1cf703c33de91"
  ],
  [
    "browser-capture-item-insert.v1.sql",
    "a2068338d31edc3afa3bac513fc4d1b0e684cba9cb3837e97c7e821ca3dc59f3"
  ],
  [
    "browser-capture-provenance-source.v1.sql",
    "f413b1385409ed1b622c62e87b3fbee25896c2dc8bdd7c8983eed2970aa22185"
  ],
  [
    "browser-capture-identifier-insert.v1.sql",
    "be319b32e54132c5ff0ecc0a8c320b472cf4a613b1ffa64cf7ff9dcdf3fb6a92"
  ],
  [
    "browser-capture-active-parent.v1.sql",
    "725afd4c968a9aecb7afcb3ba63bd484834e653e5c313b7a7061271bb0da7726"
  ],
  [
    "browser-capture-attachment-receipt.v1.sql",
    "a4e9d1c23769716e7b8e91857364396a48b203365775051278b157969be3f45e"
  ],
  [
    "browser-capture-attachment-label.v1.sql",
    "ac9b68d1bfafdb95b24d210d6b8f5e4c5480ff701671cce9bab73971ba111b55"
  ],
  [
    "browser-capture-attachment-insert.v1.sql",
    "2a09ba9e98e32ac90787a3ceccec165dacb84d5bfc9e99b8d954f9cbbb4417f6"
  ]
];
  assert.ok(Object.isFrozen(literatureBrowserCaptureResources));
  assert.deepEqual(literatureBrowserCaptureResources, expected.map(([name]) => name));
  for (const [name, hash] of expected) {
    const bytes = await fs.readFile(new URL("../native/data/" + name, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash);
  }
});
