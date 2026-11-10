'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  analyzeProject, analyzeSource, parseTestSummary, readTestHistory, recordTestRun, runProjectTests,
  applyReviewedChange, listReversibleChanges, prepareChangeRevert, prepareReviewedChange, revertReviewedChange,
} = require('../src/main/self-improvement');
const { TRAY } = require('../src/main/labels');

test('self-improvement tray actions are localized and expose a confirmation before tests', () => {
  for (const labels of Object.values(TRAY)) {
    assert.ok(labels.selfImprove);
    assert.ok(labels.reviewProject);
    assert.ok(labels.runProjectTests);
    assert.ok(labels.reviewSource);
    assert.ok(labels.testsOnlyNote);
    assert.ok(labels.testHistoryNote);
    assert.ok(labels.reviewPatch);
    assert.ok(labels.patchConfirmNote);
    assert.ok(labels.undoPatchNote);
    assert.ok(labels.localAnalysisNote);
    assert.ok(labels.importCycles);
    assert.ok(labels.unreferencedModules);
    assert.ok(labels.cancel);
    assert.ok(labels.evidenceSuggestions);
    for (const action of ['syntaxErrors', 'unresolvedImports', 'importCycles', 'maintenanceMarkers', 'unreferencedModules']) {
      assert.ok(labels.sourceSuggestionActions[action]);
    }
  }
});

async function createProject(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capri-review-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('project review reads only known docs, counts backlog, and discovers direct test files', async (t) => {
  const root = await createProject(t);
  await fs.mkdir(path.join(root, 'tests'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture-capri', version: '1.0.0', scripts: { test: 'node --test' },
  }));
  await fs.writeFile(path.join(root, 'TODO.md'), '- [x] Done item\n- [ ] Pending item\n');
  await fs.writeFile(path.join(root, 'tests', 'safe.test.js'), '');
  await fs.writeFile(path.join(root, 'tests', 'ignored.js'), '');
  await fs.mkdir(path.join(root, 'tests', 'nested'));
  await fs.writeFile(path.join(root, 'tests', 'nested', 'hidden.test.js'), '');

  const report = await analyzeProject(root);
  assert.equal(report.projectName, 'fixture-capri');
  assert.deepEqual(report.backlog, [
    { done: true, title: 'Done item' },
    { done: false, title: 'Pending item' },
  ]);
  assert.deepEqual(report.testFiles, ['safe.test.js']);
  assert.deepEqual(report.missingDocs, ['PROGRESS.md', 'CHANGELOG.md', 'ARCHITECTURE.md']);
});

test('source analysis reports syntax failures and maintenance markers with file and line evidence', async (t) => {
  const root = await createProject(t);
  await fs.mkdir(path.join(root, 'src', 'main'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'renderer'));
  await fs.writeFile(path.join(root, 'src', 'renderer', 'exists.js'), 'module.exports = true;\n');
  await fs.writeFile(path.join(root, 'src', 'renderer', 'cycle-a.js'), "require('./cycle-b');\n");
  await fs.writeFile(path.join(root, 'src', 'renderer', 'cycle-b.js'), "require('./cycle-a');\n");
  await fs.writeFile(path.join(root, 'src', 'main', 'broken.js'), 'const = ;\n');
  await fs.writeFile(path.join(root, 'src', 'renderer', 'work.js'), [
    '// TODO: add a specific follow-up',
    "const present = require('./exists');",
    "const missing = require('./missing');",
    'module.exports = present;',
  ].join('\n'));

  const result = await analyzeSource(root);
  assert.equal(result.filesScanned, 5);
  assert.equal(result.syntaxErrors.length, 1);
  assert.equal(result.syntaxErrors[0].file, path.join('src', 'main', 'broken.js'));
  assert.match(result.syntaxErrors[0].output, /SyntaxError/);
  assert.deepEqual(result.maintenanceMarkers, [{
    file: path.join('src', 'renderer', 'work.js'),
    line: 1,
    marker: 'TODO',
    text: '// TODO: add a specific follow-up',
  }]);
  assert.deepEqual(result.unresolvedImports, [{
    file: path.join('src', 'renderer', 'work.js'),
    line: 3,
    specifier: './missing',
    text: "const missing = require('./missing');",
  }]);
  assert.deepEqual(result.importCycles, [{
    files: [path.join('src', 'renderer', 'cycle-a.js'), path.join('src', 'renderer', 'cycle-b.js')],
    edges: [
      { from: path.join('src', 'renderer', 'cycle-a.js'), to: path.join('src', 'renderer', 'cycle-b.js'), line: 1 },
      { from: path.join('src', 'renderer', 'cycle-b.js'), to: path.join('src', 'renderer', 'cycle-a.js'), line: 1 },
    ],
  }]);
  assert.deepEqual(result.suggestions.map((item) => item.kind), [
    'syntax', 'unresolvedImport', 'importCycle', 'maintenanceMarker', 'unreferencedModule',
  ]);
  const unresolvedSuggestion = result.suggestions.find((item) => item.kind === 'unresolvedImport');
  assert.equal(unresolvedSuggestion.findingCount, 1);
  assert.deepEqual(unresolvedSuggestion.evidence[0], {
    file: path.join('src', 'renderer', 'work.js'),
    line: 3,
    detail: "./missing · const missing = require('./missing');",
  });
  const cycleSuggestion = result.suggestions.find((item) => item.kind === 'importCycle');
  assert.equal(cycleSuggestion.findingCount, 1);
  assert.equal(cycleSuggestion.evidence[0].file, path.join('src', 'renderer', 'cycle-a.js'));
});

test('source analysis identifies modules unreachable from known roots through static imports', async (t) => {
  const root = await createProject(t);
  await fs.mkdir(path.join(root, 'src', 'main'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ main: 'src/main/entry.js' }));
  await fs.writeFile(path.join(root, 'src', 'main', 'entry.js'), "require('./used');\n");
  await fs.writeFile(path.join(root, 'src', 'main', 'used.js'), 'module.exports = true;\n');
  await fs.writeFile(path.join(root, 'src', 'main', 'orphan.js'), 'module.exports = false;\n');

  const result = await analyzeSource(root);
  assert.ok(result.entryPoints.includes(path.join('src', 'main', 'entry.js')));
  assert.ok(result.reachableModules.includes(path.join('src', 'main', 'used.js')));
  assert.deepEqual(result.unreferencedModules, [{
    file: path.join('src', 'main', 'orphan.js'),
    reason: 'not reachable from a known entry point through detected static relative imports',
  }]);
  assert.deepEqual(result.suggestions, [{
    kind: 'unreferencedModule',
    findingCount: 1,
    evidence: [{
      file: path.join('src', 'main', 'orphan.js'),
      detail: 'not reachable from a known entry point through detected static relative imports',
    }],
    actionKey: 'unreferencedModules',
  }]);
});

test('project test runner executes only explicit top-level .test.js files without a shell', async (t) => {
  const root = await createProject(t);
  await fs.mkdir(path.join(root, 'tests'));
  await fs.writeFile(path.join(root, 'tests', 'one.test.js'), `
    const test = require('node:test');
    const assert = require('node:assert/strict');
    test('fixture passes', () => assert.equal(2 + 2, 4));
  `);
  await fs.writeFile(path.join(root, 'tests', 'not-a-test.js'), 'throw new Error("must not execute");');

  const result = await runProjectTests(root, { timeoutMs: 10000 });
  assert.equal(result.ok, true, result.output);
  assert.match(result.output, /fixture passes/);
  assert.deepEqual(result.summary, {
    tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0,
  });
});

test('test summary parser extracts Node test reporter counts', () => {
  assert.deepEqual(parseTestSummary([
    'ℹ tests 12', 'ℹ pass 10', 'ℹ fail 1', 'ℹ cancelled 0', 'ℹ skipped 1', 'ℹ todo 0',
  ].join('\n')), {
    tests: 12, passed: 10, failed: 1, cancelled: 0, skipped: 1, todo: 0,
  });
  assert.equal(parseTestSummary('partial output').tests, null);
});

test('test history compares runs locally and retains only the newest 20 summaries', async (t) => {
  const root = await createProject(t);
  const file = path.join(root, 'history.json');
  const passing = { ok: true, summary: { tests: 4, passed: 4, failed: 0, cancelled: 0, skipped: 0, todo: 0 } };
  const failing = { ok: false, summary: { tests: 4, passed: 3, failed: 1, cancelled: 0, skipped: 0, todo: 0 } };

  assert.equal((await recordTestRun(file, passing)).comparison, 'first-run');
  assert.equal((await recordTestRun(file, passing)).comparison, 'stable');
  const regression = await recordTestRun(file, failing);
  assert.equal(regression.comparison, 'regression');
  assert.equal(regression.previous.ok, true);
  assert.equal((await recordTestRun(file, passing)).comparison, 'improved');

  for (let index = 0; index < 21; index += 1) await recordTestRun(file, passing);
  const history = await readTestHistory(file);
  assert.equal(history.length, 20);
  assert.equal(history.every((run) => run.ok), true);
});

test('test history rejects malformed persisted data instead of silently resetting it', async (t) => {
  const root = await createProject(t);
  const file = path.join(root, 'history.json');
  await fs.writeFile(file, '{"version":99,"runs":[]}');
  await assert.rejects(readTestHistory(file), /unsupported or invalid format/);
});

test('reviewed source changes require the exact digest, preserve backup, and can be reverted', async (t) => {
  const root = await createProject(t);
  const source = path.join(root, 'src', 'main', 'module.js');
  const storage = path.join(root, 'private-data');
  const before = 'module.exports = 1;\n';
  const after = 'module.exports = 2;\n';
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, before);
  const change = {
    relativePath: 'src/main/module.js',
    expectedSha256: createHash('sha256').update(before).digest('hex'),
    content: after,
  };

  const preview = await prepareReviewedChange(root, change);
  assert.match(preview.diff, /-module\.exports = 1/);
  assert.match(preview.diff, /\+module\.exports = 2/);
  const applied = await applyReviewedChange(root, storage, change);
  assert.equal(await fs.readFile(source, 'utf8'), after);
  assert.equal((await listReversibleChanges(storage)).length, 1);
  assert.equal(await fs.readFile(path.join(storage, 'backups', applied.backupFile), 'utf8'), before);

  const revertPreview = await prepareChangeRevert(root, storage, applied.id);
  assert.match(revertPreview.diff, /-module\.exports = 2/);
  assert.match(revertPreview.diff, /\+module\.exports = 1/);
  await revertReviewedChange(root, storage, applied.id);
  assert.equal(await fs.readFile(source, 'utf8'), before);
  assert.deepEqual(await listReversibleChanges(storage), []);
});

test('reviewed source changes reject unsafe paths, stale hashes, and rollback over newer edits', async (t) => {
  const root = await createProject(t);
  const source = path.join(root, 'src', 'module.js');
  const before = 'module.exports = 1;\n';
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, before);
  const change = {
    relativePath: 'src/module.js',
    expectedSha256: createHash('sha256').update(before).digest('hex'),
    content: 'module.exports = 2;\n',
  };

  await assert.rejects(prepareReviewedChange(root, { ...change, relativePath: '../outside.js' }), /limited to existing files under src/);
  await assert.rejects(prepareReviewedChange(root, { ...change, relativePath: 'src/../outside.js' }), /limited to existing files under src/);
  await fs.writeFile(source, 'changed elsewhere\n');
  await assert.rejects(prepareReviewedChange(root, change), /file changed since this patch was prepared/);

  await fs.writeFile(source, before);
  const applied = await applyReviewedChange(root, path.join(root, 'private-data'), change);
  await fs.writeFile(source, 'newer user edit\n');
  await assert.rejects(prepareChangeRevert(root, path.join(root, 'private-data'), applied.id), /refusing to overwrite newer edits/);
  assert.equal(await fs.readFile(source, 'utf8'), 'newer user edit\n');
});

test('concurrent patch apply and rollback operations serialize per local journal', async (t) => {
  const root = await createProject(t);
  const source = path.join(root, 'src', 'module.js');
  const storage = path.join(root, 'private-data');
  const before = 'module.exports = 1;\n';
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, before);
  const change = {
    relativePath: 'src/module.js',
    expectedSha256: createHash('sha256').update(before).digest('hex'),
    content: 'module.exports = 2;\n',
  };

  const applications = await Promise.allSettled([
    applyReviewedChange(root, storage, change),
    applyReviewedChange(root, storage, change),
  ]);
  const applied = applications.filter((result) => result.status === 'fulfilled');
  const rejected = applications.filter((result) => result.status === 'rejected');
  assert.equal(applied.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason.message, /file changed since this patch was prepared/);
  assert.equal((await listReversibleChanges(storage)).length, 1);
  assert.equal(await fs.readFile(source, 'utf8'), change.content);

  const rollbacks = await Promise.allSettled([
    revertReviewedChange(root, storage, applied[0].value.id),
    revertReviewedChange(root, storage, applied[0].value.id),
  ]);
  assert.equal(rollbacks.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(rollbacks.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(await fs.readFile(source, 'utf8'), before);
  assert.deepEqual(await listReversibleChanges(storage), []);
});

test('project test runner validates timeout limits and reports missing tests', async (t) => {
  const root = await createProject(t);
  await fs.mkdir(path.join(root, 'tests'));

  await assert.rejects(runProjectTests(root, { timeoutMs: 120001 }), RangeError);
  const result = await runProjectTests(root);
  assert.equal(result.ok, false);
  assert.equal(result.output, 'No test files found.');
});
