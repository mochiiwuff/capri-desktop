'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');

const MAX_DOC_SIZE = 512 * 1024;
const MAX_SOURCE_SIZE = 1024 * 1024;
const MAX_SOURCE_FILES = 200;
const MAX_SOURCE_DIRS = 500;
const MAX_SOURCE_DEPTH = 12;
const MAX_SYNTAX_CHECK_MS = 10_000;
const MAX_STATIC_RUNTIME_MS = 120_000;
const MAX_TEST_RUNTIME_MS = 120_000;
const MAX_TEST_OUTPUT = 12_000;
const MAX_DIAGNOSTIC_OUTPUT = 4_000;
const MAX_TEST_HISTORY_RUNS = 20;
const MAX_TEST_HISTORY_SIZE = 64 * 1024;
const TEST_HISTORY_VERSION = 1;
const MAX_CHANGE_BYTES = 64 * 1024;
const MAX_CHANGE_PREVIEW = 12 * 1024;
const MAX_CHANGE_PREVIEW_LINES = 300;
const MAX_CHANGE_RECORDS = 50;
const MAX_CHANGE_JOURNAL_SIZE = 128 * 1024;
const CHANGE_JOURNAL_VERSION = 1;
const changeLocks = new Map();
const REVIEW_DOCS = ['TODO.md', 'PROGRESS.md', 'CHANGELOG.md', 'ARCHITECTURE.md'];
const KNOWN_ENTRYPOINTS = [
  'src/preload.js',
  'src/renderer/js/app.js',
  'src/renderer/remote/remote.js',
];

async function listSourceFiles(root) {
  const sourceRoot = path.join(root, 'src');
  const rootStat = await fs.lstat(sourceRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('src path is not a regular directory');

  const files = [];
  let directoryCount = 0;
  async function visit(directory, depth) {
    if (depth > MAX_SOURCE_DEPTH) throw new Error(`source directory depth limit exceeded (${MAX_SOURCE_DEPTH})`);
    directoryCount += 1;
    if (directoryCount > MAX_SOURCE_DIRS) throw new Error(`source directory limit exceeded (${MAX_SOURCE_DIRS})`);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(file, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(file);
        if (files.length > MAX_SOURCE_FILES) throw new Error(`source file limit exceeded (${MAX_SOURCE_FILES})`);
      }
    }
  }
  await visit(sourceRoot, 0);
  return files.sort();
}

function findRelativeImports(source) {
  const imports = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) continue;
    const patterns = [
      /\brequire\s*\(\s*(['"])(\.[^'"]+)\1\s*\)/g,
      /^\s*import\s+(?:.+?\s+from\s+)?(['"])(\.[^'"]+)\1/g,
      /^\s*export\s+.+?\s+from\s+(['"])(\.[^'"]+)\1/g,
    ];
    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern)) {
        imports.push({ line: index + 1, specifier: match[2] || match[1] });
      }
    }
  }
  return imports;
}

async function resolveRelativeModule(root, sourceFile, specifier) {
  const target = path.resolve(path.dirname(sourceFile), specifier);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;

  const extension = path.extname(target);
  const candidates = extension ? [target] : [target, `${target}.js`, `${target}.cjs`, `${target}.mjs`, `${target}.json`, path.join(target, 'index.js')];
  for (const candidate of candidates) {
    try {
      let directory = path.dirname(candidate);
      let hasSymlink = false;
      while (directory !== root && directory.startsWith(root + path.sep)) {
        const parentStat = await fs.lstat(directory);
        if (parentStat.isSymbolicLink()) {
          hasSymlink = true;
          break;
        }
        directory = path.dirname(directory);
      }
      if (hasSymlink) continue;
      const stat = await fs.lstat(candidate);
      if (stat.isFile() && !stat.isSymbolicLink()) return candidate;
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
    }
  }
  return null;
}

function findImportCycles(graph, root) {
  let nextIndex = 0;
  const indexes = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  function connect(file) {
    indexes.set(file, nextIndex);
    lowLinks.set(file, nextIndex);
    nextIndex += 1;
    stack.push(file);
    onStack.add(file);

    for (const { target } of graph.get(file) || []) {
      if (!graph.has(target)) continue;
      if (!indexes.has(target)) {
        connect(target);
        lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(target)));
      } else if (onStack.has(target)) {
        lowLinks.set(file, Math.min(lowLinks.get(file), indexes.get(target)));
      }
    }

    if (lowLinks.get(file) !== indexes.get(file)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== file);
    if (component.length > 1 || (graph.get(file) || []).some(({ target }) => target === file)) {
      components.push(component);
    }
  }

  for (const file of graph.keys()) {
    if (!indexes.has(file)) connect(file);
  }

  return components.map((component) => {
    const members = new Set(component);
    const edges = [];
    for (const from of component) {
      for (const { target, line } of graph.get(from) || []) {
        if (members.has(target)) edges.push({
          from: path.relative(root, from),
          to: path.relative(root, target),
          line,
        });
      }
    }
    edges.sort((a, b) => a.from.localeCompare(b.from) || a.line - b.line || a.to.localeCompare(b.to));
    return {
      files: component.map((file) => path.relative(root, file)).sort(),
      edges,
    };
  }).sort((a, b) => a.files[0].localeCompare(b.files[0]));
}

async function findUnreferencedModules(root, files, graph) {
  const fileSet = new Set(files);
  const entryPoints = [];
  for (const relative of KNOWN_ENTRYPOINTS) {
    const file = path.join(root, relative);
    if (fileSet.has(file)) entryPoints.push(file);
  }

  const manifestPath = path.join(root, 'package.json');
  try {
    const stat = await fs.lstat(manifestPath);
    if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_DOC_SIZE) {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      if (typeof manifest.main === 'string') {
        const main = path.resolve(root, manifest.main);
        const relative = path.relative(root, main);
        if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && fileSet.has(main)) {
          entryPoints.push(main);
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Could not determine project entry point: ${err.message}`);
  }

  const visited = new Set();
  const pending = [...new Set(entryPoints)];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    for (const { target } of graph.get(file) || []) {
      if (!visited.has(target)) pending.push(target);
    }
  }

  return {
    entryPoints: [...new Set(entryPoints)].map((file) => path.relative(root, file)).sort(),
    reachableModules: [...visited].map((file) => path.relative(root, file)).sort(),
    candidates: files
      .filter((file) => !visited.has(file))
      .map((file) => ({
        file: path.relative(root, file),
        reason: 'not reachable from a known entry point through detected static relative imports',
      })),
  };
}

async function readOptionalDocument(root, name) {
  const file = path.join(root, name);
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_DOC_SIZE) {
      throw new Error(`${name} is not a regular document or exceeds the size limit`);
    }
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function analyzeProject(root) {
  const docs = {};
  for (const name of REVIEW_DOCS) docs[name] = await readOptionalDocument(root, name);

  let manifest;
  try {
    const manifestPath = path.join(root, 'package.json');
    const stat = await fs.lstat(manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_DOC_SIZE) {
      throw new Error('package.json is not a regular file or exceeds the size limit');
    }
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read project package.json: ${err.message}`);
  }

  const todo = docs['TODO.md'];
  const backlog = todo
    ? [...todo.matchAll(/^\s*-\s+\[([ xX])\]\s+(.+)$/gm)].map(([, checked, title]) => ({
      done: checked.toLowerCase() === 'x',
      title: title.trim(),
    }))
    : [];
  const testDir = path.join(root, 'tests');
  let testFiles = [];
  try {
    const stat = await fs.lstat(testDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('tests path is not a regular directory');
    testFiles = (await fs.readdir(testDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  return {
    projectName: manifest.name || path.basename(root),
    version: manifest.version || 'unknown',
    scripts: Object.keys(manifest.scripts || {}),
    backlog,
    missingDocs: REVIEW_DOCS.filter((name) => docs[name] === null),
    testFiles,
  };
}

function createSourceSuggestions({
  syntaxErrors,
  unresolvedImports,
  importCycles,
  unreferencedModules,
  maintenanceMarkers,
}) {
  const evidence = {
    syntax: syntaxErrors
      .filter((item) => item.file !== 'src' && !item.timedOut && !item.output.startsWith('Skipped:'))
      .map((item) => ({ file: item.file, detail: item.output })),
    unresolvedImport: unresolvedImports
      .map((item) => ({ file: item.file, line: item.line, detail: `${item.specifier} · ${item.text}` })),
    importCycle: importCycles.flatMap((cycle) => cycle.edges
      .map((edge) => ({ file: edge.from, line: edge.line, detail: `imports ${edge.to}` }))),
    maintenanceMarker: maintenanceMarkers
      .map((item) => ({ file: item.file, line: item.line, detail: `${item.marker} · ${item.text}` })),
    unreferencedModule: unreferencedModules
      .map((item) => ({ file: item.file, detail: item.reason })),
  };
  const actions = [
    ['syntax', 'syntaxErrors'],
    ['unresolvedImport', 'unresolvedImports'],
    ['importCycle', 'importCycles'],
    ['maintenanceMarker', 'maintenanceMarkers'],
    ['unreferencedModule', 'unreferencedModules'],
  ];
  return actions
    .filter(([kind]) => evidence[kind].length > 0)
    .map(([kind, source]) => ({
      kind,
      findingCount: kind === 'importCycle' ? importCycles.length : evidence[kind].length,
      evidence: evidence[kind].slice(0, 3).map((item) => ({
        ...item,
        detail: item.detail.slice(0, 240),
      })),
      actionKey: source,
    }));
}

function checkJavaScriptSyntax(file, timeoutMs = MAX_SYNTAX_CHECK_MS) {
  return new Promise((resolve) => {
    let output = '';
    let settled = false;
    let timedOut = false;
    const child = spawn(process.execPath, ['--check', file], {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const append = (chunk) => {
      if (output.length >= MAX_DIAGNOSTIC_OUTPUT) return;
      const available = MAX_DIAGNOSTIC_OUTPUT - output.length;
      output += chunk.toString().slice(0, available);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, output, timedOut });
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (err) => finish({ ok: false, error: err.message }));
    child.on('close', (code) => finish({ ok: !timedOut && code === 0, exitCode: code }));
  });
}

async function analyzeSource(root) {
  const files = await listSourceFiles(root);
  const syntaxErrors = [];
  const maintenanceMarkers = [];
  const unresolvedImports = [];
  const importGraph = new Map();
  const startedAt = Date.now();

  for (const file of files) {
    const remainingMs = MAX_STATIC_RUNTIME_MS - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      syntaxErrors.push({
        file: 'src',
        output: `Analysis time limit exceeded (${MAX_STATIC_RUNTIME_MS} ms); remaining files were not checked.`,
        timedOut: true,
      });
      break;
    }
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    const relativeFile = path.relative(root, file);
    if (stat.size > MAX_SOURCE_SIZE) {
      syntaxErrors.push({
        file: relativeFile,
        output: `Skipped: file exceeds ${MAX_SOURCE_SIZE} bytes.`,
        timedOut: false,
      });
      continue;
    }

    const source = await fs.readFile(file, 'utf8');
    const lines = source.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(/(?:^|\s)\/\/\s*(TODO|FIXME|XXX|HACK)\b|^\s*(?:\/\*|\*)\s*(TODO|FIXME|XXX|HACK)\b/);
      if (match) {
        maintenanceMarkers.push({
          file: relativeFile,
          line: index + 1,
          marker: match[1] || match[2],
          text: lines[index].trim().slice(0, 240),
        });
      }
    }
    const edges = [];
    for (const reference of findRelativeImports(source)) {
      const target = await resolveRelativeModule(root, file, reference.specifier);
      if (!target) {
        unresolvedImports.push({
          file: relativeFile,
          line: reference.line,
          specifier: reference.specifier,
          text: lines[reference.line - 1].trim().slice(0, 240),
        });
      } else if (path.extname(target) === '.js') {
        edges.push({ target, line: reference.line });
      }
    }
    importGraph.set(file, edges);

    const check = await checkJavaScriptSyntax(file, Math.min(MAX_SYNTAX_CHECK_MS, remainingMs));
    if (!check.ok) {
      syntaxErrors.push({
        file: relativeFile,
        output: check.output || check.error || 'Syntax check failed without diagnostic output.',
        timedOut: check.timedOut,
      });
    }
  }

  const reachability = await findUnreferencedModules(root, files, importGraph);
  const result = {
    syntaxErrors,
    maintenanceMarkers,
    unresolvedImports,
    importCycles: findImportCycles(importGraph, root),
    unreferencedModules: reachability.candidates,
  };
  return {
    filesScanned: files.length,
    ...result,
    suggestions: createSourceSuggestions(result),
    entryPoints: reachability.entryPoints,
    reachableModules: reachability.reachableModules,
  };
}

async function runProjectTests(root, { timeoutMs = MAX_TEST_RUNTIME_MS } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TEST_RUNTIME_MS) {
    throw new RangeError(`timeoutMs must be between 1 and ${MAX_TEST_RUNTIME_MS}`);
  }

  const testDir = path.join(root, 'tests');
  const stat = await fs.lstat(testDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('tests path is not a regular directory');
  const entries = await fs.readdir(testDir, { withFileTypes: true });
  const testFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => path.join('tests', entry.name))
    .sort();
  if (!testFiles.length) return { ok: false, exitCode: null, output: 'No test files found.', timedOut: false };

  return new Promise((resolve) => {
    let output = '';
    let outputTruncated = false;
    let settled = false;
    let timedOut = false;
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['--test', ...testFiles], {
      cwd: root,
      env,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const append = (chunk) => {
      const text = chunk.toString();
      output += text;
      if (output.length > MAX_TEST_OUTPUT) {
        output = output.slice(-MAX_TEST_OUTPUT);
        outputTruncated = true;
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        output: outputTruncated ? `${output}\n[output truncated]` : output,
        timedOut,
        summary: parseTestSummary(output),
      });
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (err) => finish({ ok: false, exitCode: null, error: err.message }));
    child.on('close', (code) => finish({
      ok: !timedOut && code === 0,
      exitCode: code,
    }));
  });
}

function parseTestSummary(output) {
  const number = (label) => {
    const match = output.match(new RegExp(`(?:ℹ\\s*)?${label}\\s+(\\d+)`, 'i'));
    return match ? Number(match[1]) : null;
  };
  return {
    tests: number('tests'),
    passed: number('pass'),
    failed: number('fail'),
    cancelled: number('cancelled'),
    skipped: number('skipped'),
    todo: number('todo'),
  };
}

function isValidTestHistory(value) {
  return value
    && value.version === TEST_HISTORY_VERSION
    && Array.isArray(value.runs)
    && value.runs.length <= MAX_TEST_HISTORY_RUNS
    && value.runs.every((run) => (
      typeof run?.at === 'string'
      && typeof run.ok === 'boolean'
      && (run.outcome === 'passed' || run.outcome === 'failed' || run.outcome === 'timed-out' || run.outcome === 'error')
      && run.summary && typeof run.summary === 'object'
      && ['tests', 'passed', 'failed', 'cancelled', 'skipped', 'todo'].every((key) => (
        run.summary[key] === null || (Number.isInteger(run.summary[key]) && run.summary[key] >= 0)
      ))
    ));
}

async function readTestHistory(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_TEST_HISTORY_SIZE) {
      throw new Error('test history is not a regular file or exceeds the size limit');
    }
    const history = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!isValidTestHistory(history)) throw new Error('test history has an unsupported or invalid format');
    return history.runs;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function makeTestRun(result) {
  const summary = Object.fromEntries(
    ['tests', 'passed', 'failed', 'cancelled', 'skipped', 'todo']
      .map((key) => [key, Number.isInteger(result.summary?.[key]) ? result.summary[key] : null]),
  );
  const outcome = result.timedOut ? 'timed-out' : result.ok ? 'passed' : result.error ? 'error' : 'failed';
  return {
    at: new Date().toISOString(),
    ok: result.ok === true,
    outcome,
    summary,
  };
}

async function saveTestHistory(file, runs) {
  if (!Array.isArray(runs) || runs.length > MAX_TEST_HISTORY_RUNS || !isValidTestHistory({
    version: TEST_HISTORY_VERSION,
    runs,
  })) throw new Error('refusing to save invalid test history');

  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_TEST_HISTORY_SIZE) {
      throw new Error('refusing to replace unsafe test history file');
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const temporary = path.join(path.dirname(file), `.capri-test-history-${process.pid}-${randomBytes(8).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ version: TEST_HISTORY_VERSION, runs }), 'utf8');
    await handle.close();
    handle = null;
    await fs.rename(temporary, file);
  } catch (err) {
    if (handle) await handle.close();
    await fs.unlink(temporary).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('[capri] could not remove temporary test history:', cleanupError.message);
    });
    throw err;
  }
}

async function recordTestRun(file, result) {
  const previousRuns = await readTestHistory(file);
  const previous = previousRuns[previousRuns.length - 1] || null;
  const current = makeTestRun(result);
  let comparison = 'first-run';
  if (previous?.ok && !current.ok) comparison = 'regression';
  else if (!previous?.ok && current.ok && previous) comparison = 'improved';
  else if (previous?.ok && current.ok) comparison = 'stable';
  else if (previous) comparison = 'still-failing';

  const runs = [...previousRuns, current].slice(-MAX_TEST_HISTORY_RUNS);
  await saveTestHistory(file, runs);
  return { current, previous, comparison, runsStored: runs.length };
}

function validateChangePath(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.includes('\\') || path.posix.isAbsolute(relativePath)) {
    throw new Error('change path must be a relative src path using forward slashes');
  }
  const segments = relativePath.split('/');
  if (
    segments.length < 2
    || segments[0] !== 'src'
    || segments.some((segment) => !segment || segment === '.' || segment === '..' || /[:*?"<>|]/.test(segment))
  ) {
    throw new Error('changes are limited to existing files under src/');
  }
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('change path escapes the project root');
  }
  return target;
}

async function assertNoSymlinkPath(root, target) {
  let current = target;
  while (current !== root && current.startsWith(root + path.sep)) {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new Error('symbolic links are not allowed in change paths');
    current = path.dirname(current);
  }
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('project root is not a regular directory');
}

function createTextDiff(relativePath, before, after) {
  const oldLines = before.split(/\r?\n/);
  const newLines = after.split(/\r?\n/);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;

  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const changedLines = removed.length + added.length;
  const diff = [
    `--- ${relativePath}`,
    `+++ ${relativePath}`,
    `@@ ${prefix + 1} -${removed.length} +${added.length} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ].join('\n');
  if (changedLines > MAX_CHANGE_PREVIEW_LINES || Buffer.byteLength(diff) > MAX_CHANGE_PREVIEW) {
    throw new Error('change is too large to display safely for review');
  }
  return diff;
}

async function prepareReviewedChange(root, change) {
  if (!change || typeof change !== 'object' || typeof change.content !== 'string') {
    throw new Error('patch must contain text content');
  }
  if (Buffer.byteLength(change.content) > MAX_CHANGE_BYTES) throw new Error('new file content exceeds the 64 KiB limit');
  if (typeof change.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(change.expectedSha256)) {
    throw new Error('patch must include the expected SHA-256 of the current file');
  }

  const target = validateChangePath(root, change.relativePath);
  await assertNoSymlinkPath(root, target);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CHANGE_BYTES) {
    throw new Error('only existing regular files up to 64 KiB can be changed');
  }
  const beforeBuffer = await fs.readFile(target);
  const before = beforeBuffer.toString('utf8');
  if (!Buffer.from(before, 'utf8').equals(beforeBuffer)) throw new Error('only valid UTF-8 text files can be changed');
  const currentSha256 = createHash('sha256').update(before).digest('hex');
  if (currentSha256 !== change.expectedSha256.toLowerCase()) {
    throw new Error('file changed since this patch was prepared; review a fresh patch');
  }
  if (before === change.content) throw new Error('patch does not change the file');
  const relativePath = path.relative(root, target).split(path.sep).join('/');
  return {
    relativePath,
    currentSha256,
    newSha256: createHash('sha256').update(change.content).digest('hex'),
    content: change.content,
    mode: stat.mode & 0o777,
    diff: createTextDiff(relativePath, before, change.content),
  };
}

async function writeAtomic(file, content, mode = 0o600) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.capri-change-${process.pid}-${randomBytes(8).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', mode);
    await handle.writeFile(content);
    await handle.close();
    handle = null;
    await fs.rename(temporary, file);
  } catch (err) {
    if (handle) await handle.close();
    await fs.unlink(temporary).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('[capri] could not remove temporary change file:', cleanupError.message);
    });
    throw err;
  }
}

async function writeExclusive(file, content, mode = 0o600) {
  let handle;
  try {
    handle = await fs.open(file, 'wx', mode);
    await handle.writeFile(content);
    await handle.close();
    handle = null;
  } catch (err) {
    if (handle) await handle.close();
    await fs.unlink(file).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('[capri] could not remove incomplete backup:', cleanupError.message);
    });
    throw err;
  }
}

async function ensurePrivateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('self-improvement storage must be a regular directory');
}

async function readChangeJournal(journalFile) {
  await ensurePrivateDirectory(path.dirname(journalFile));
  try {
    const stat = await fs.lstat(journalFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CHANGE_JOURNAL_SIZE) {
      throw new Error('change journal is not a regular file or exceeds the size limit');
    }
    const journal = JSON.parse(await fs.readFile(journalFile, 'utf8'));
    if (
      journal?.version !== CHANGE_JOURNAL_VERSION
      || !Array.isArray(journal.records)
      || journal.records.length > MAX_CHANGE_RECORDS
      || journal.records.some((record) => (
        !/^[a-f0-9]{24}$/.test(record?.id)
        || record.backupFile !== `${record.id}.bak`
        || typeof record.relativePath !== 'string'
        || !/^src\/(?!.*(?:^|\/)\.\.(?:\/|$)).+$/.test(record.relativePath)
        || !/^[a-f0-9]{64}$/.test(record.originalSha256)
        || !/^[a-f0-9]{64}$/.test(record.appliedSha256)
        || !['applied', 'reverted'].includes(record.state)
      ))
    ) throw new Error('change journal has an unsupported or invalid format');
    return journal.records;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function saveChangeJournal(journalFile, records) {
  const json = JSON.stringify({ version: CHANGE_JOURNAL_VERSION, records });
  if (Buffer.byteLength(json) > MAX_CHANGE_JOURNAL_SIZE) throw new Error('change journal size limit exceeded');
  await ensurePrivateDirectory(path.dirname(journalFile));
  await writeAtomic(journalFile, json, 0o600);
}

async function withChangeLock(storageDir, operation) {
  const key = path.resolve(storageDir, 'changes.json');
  const previous = changeLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  changeLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (changeLocks.get(key) === current) changeLocks.delete(key);
  }
}

async function applyReviewedChange(root, storageDir, change) {
  return withChangeLock(storageDir, () => applyReviewedChangeLocked(root, storageDir, change));
}

async function applyReviewedChangeLocked(root, storageDir, change) {
  const prepared = await prepareReviewedChange(root, change);
  await ensurePrivateDirectory(storageDir);
  await ensurePrivateDirectory(path.join(storageDir, 'backups'));
  const journalFile = path.join(storageDir, 'changes.json');
  const records = await readChangeJournal(journalFile);
  if (records.length >= MAX_CHANGE_RECORDS) throw new Error('change history is full; archive it before applying more changes');

  const id = randomBytes(12).toString('hex');
  const backupFile = `${id}.bak`;
  const backupPath = path.join(storageDir, 'backups', backupFile);
  const target = validateChangePath(root, prepared.relativePath);
  await assertNoSymlinkPath(root, target);
  const current = await fs.readFile(target);
  if (createHash('sha256').update(current).digest('hex') !== prepared.currentSha256) {
    throw new Error('file changed while awaiting confirmation; no changes were applied');
  }

  await writeExclusive(backupPath, current, 0o600);

  const record = {
    id,
    at: new Date().toISOString(),
    relativePath: prepared.relativePath,
    backupFile,
    originalSha256: prepared.currentSha256,
    appliedSha256: prepared.newSha256,
    state: 'applied',
  };
  try {
    await writeAtomic(target, prepared.content, prepared.mode);
    records.push(record);
    await saveChangeJournal(journalFile, records);
  } catch (err) {
    try {
      await writeAtomic(target, current, prepared.mode);
    } catch (restoreError) {
      throw new Error(`change failed and automatic restore failed; backup retained at ${backupPath}: ${restoreError.message}`);
    }
    await fs.unlink(backupPath).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('[capri] could not remove unused change backup:', cleanupError.message);
    });
    throw err;
  }
  return { id, relativePath: prepared.relativePath, backupFile, diff: prepared.diff };
}

async function listReversibleChanges(storageDir) {
  const records = await readChangeJournal(path.join(storageDir, 'changes.json'));
  return records.filter((record) => record.state === 'applied').reverse();
}

async function prepareChangeRevert(root, storageDir, id) {
  const journalFile = path.join(storageDir, 'changes.json');
  const records = await readChangeJournal(journalFile);
  const record = records.find((item) => item.id === id && item.state === 'applied');
  if (!record) throw new Error('change is not available for rollback');

  const target = validateChangePath(root, record.relativePath);
  await assertNoSymlinkPath(root, target);
  const backupPath = path.join(storageDir, 'backups', record.backupFile);
  await ensurePrivateDirectory(path.dirname(backupPath));
  const backupStat = await fs.lstat(backupPath);
  if (!backupStat.isFile() || backupStat.isSymbolicLink() || backupStat.size > MAX_CHANGE_BYTES) {
    throw new Error('backup is not a regular file or exceeds the size limit');
  }
  const [current, backup] = await Promise.all([fs.readFile(target), fs.readFile(backupPath)]);
  if (createHash('sha256').update(current).digest('hex') !== record.appliedSha256) {
    throw new Error('file has changed since the recorded patch; refusing to overwrite newer edits');
  }
  if (createHash('sha256').update(backup).digest('hex') !== record.originalSha256) {
    throw new Error('backup integrity check failed; rollback was not applied');
  }
  const currentText = current.toString('utf8');
  const backupText = backup.toString('utf8');
  return {
    id,
    relativePath: record.relativePath,
    currentSha256: record.appliedSha256,
    restoredSha256: record.originalSha256,
    content: backupText,
    mode: (await fs.stat(target)).mode & 0o777,
    diff: createTextDiff(record.relativePath, currentText, backupText),
  };
}

async function revertReviewedChange(root, storageDir, id) {
  return withChangeLock(storageDir, () => revertReviewedChangeLocked(root, storageDir, id));
}

async function revertReviewedChangeLocked(root, storageDir, id) {
  const prepared = await prepareChangeRevert(root, storageDir, id);
  await ensurePrivateDirectory(storageDir);
  await ensurePrivateDirectory(path.join(storageDir, 'backups'));
  const journalFile = path.join(storageDir, 'changes.json');
  const records = await readChangeJournal(journalFile);
  const record = records.find((item) => item.id === id && item.state === 'applied');
  if (!record) throw new Error('change is not available for rollback');

  const target = validateChangePath(root, prepared.relativePath);
  await assertNoSymlinkPath(root, target);
  const current = await fs.readFile(target);
  if (createHash('sha256').update(current).digest('hex') !== prepared.currentSha256) {
    throw new Error('file changed while awaiting rollback confirmation; rollback was not applied');
  }

  record.state = 'reverted';
  const currentBackupPath = path.join(storageDir, 'backups', `${id}-before-rollback.bak`);
  await writeExclusive(currentBackupPath, current, 0o600);
  try {
    await writeAtomic(target, prepared.content, prepared.mode);
    await saveChangeJournal(journalFile, records);
  } catch (err) {
    record.state = 'applied';
    try {
      await writeAtomic(target, current, prepared.mode);
    } catch (restoreError) {
      throw new Error(`rollback failed and automatic restore failed; backup retained at ${currentBackupPath}: ${restoreError.message}`);
    }
    await fs.unlink(currentBackupPath).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('[capri] could not remove unused rollback backup:', cleanupError.message);
    });
    throw err;
  }
  return { id, relativePath: prepared.relativePath, diff: prepared.diff };
}

module.exports = {
  analyzeProject, analyzeSource, runProjectTests,
  parseTestSummary, readTestHistory, recordTestRun,
  prepareReviewedChange, applyReviewedChange, listReversibleChanges,
  prepareChangeRevert, revertReviewedChange,
};
