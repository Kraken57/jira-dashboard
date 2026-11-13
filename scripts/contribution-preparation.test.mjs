import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();
let fetchImpl = () => { throw new Error("Unexpected network request"); };
// Execute pure TypeScript helpers without adding a test framework or emitted repo files.
function loadTs(file) {
  const path = resolve(file);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const js = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports, process, console, AbortSignal, URLSearchParams,
    window: { self: null, top: null }, fetch: (...args) => fetchImpl(...args),
    require: (name) => name.startsWith('.') ? loadTs(resolve(dirname(path), `${name}.ts`))
      : name.startsWith('@/') ? loadTs(resolve('src', `${name.slice(2)}.ts`))
      : name === '@forge/api' ? { __esModule: true, default: {}, route: () => {} } : require(name),
  }, { filename: path });
  return module.exports;
}
const preparation = loadTs('src/lib/jira/contributionPreparation.ts');
const forge = loadTs('forge/src/api/contributionWorklogs.ts');
const { loadContributionWorklogs } = loadTs('src/lib/jira/contributionWorklogLoader.ts');
const { computeDashboardData, resolveMetricConfig } = loadTs('src/lib/jira/metricsEngine.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const item = (key, fields = {}) => ({ key, summary: key, podKey: 'ERP', podName: 'Finance', workType: 'Story',
  status: 'Accepted', quarter: 'CY26 PI.4', sprints: [], storyPoints: 5, team: 'Finance', ...fields });
const completion = () => ({ completionSprint: null, completionSprintLabel: 'No completion sprint', completionDateConfirmed: false });

test('child preparation preserves full-story children and distinguishes absent/canceled work', () => {
  const story = item('ERP-1', { subtaskKeys: ['ERP-2', 'ERP-3', 'ERP-4'] });
  const child = item('ERP-2', { workType: 'Sub-task', parentKey: 'ERP-1', sprints: [], originalEstimateSeconds: 21600 });
  const canceled = item('ERP-3', { workType: 'Sub-task', parentKey: 'ERP-1', status: 'Canceled' });
  const [result] = preparation.prepareContributionSources([story, story], [story, child, child, canceled], completion);
  assert.equal(result.subtasks.length, 1);
  assert.equal(result.subtasks[0].originalEstimateSeconds, 21600);
  assert.deepEqual(plain(result.missingSubtaskKeys), ['ERP-4']);
  assert.equal(result.childListKnown, true);
});

test('unknown child list is not silently reported as zero children', () => {
  const [unknown, empty] = preparation.prepareContributionSources([item('ERP-1'), item('ERP-2', { subtaskKeys: [] })], [], completion);
  assert.equal(unknown.childListKnown, false);
  assert.equal(empty.childListKnown, true);
  assert.equal(empty.subtasks.length, 0);
});

const old = 'ERP-2026-Q3-S6';
const current = 'ERP-2026-Q4-S0';
const metadata = {
  [old]: { name: old, state: 'closed', startDate: '2026-09-16T00:00:00Z', endDate: '2026-09-30T00:00:00Z' },
  [current]: { name: current, state: 'closed', startDate: '2026-09-30T00:00:00Z', endDate: '2026-10-07T00:00:00Z' },
};
const story = item('ERP-1', { sprints: [old, current], resolutionDate: '2026-10-03T12:00:00Z', subtaskKeys: ['ERP-2'] });
const child = item('ERP-2', { workType: 'Sub-task', parentKey: 'ERP-1', status: 'In Progress', originalEstimateSeconds: 3600 });
const config = { ...resolveMetricConfig(), doneStatuses: ['Accepted'], subtaskDoneStatuses: ['Completed'] };
const compute = (filters = {}) => computeDashboardData([story, child], { podId: 'all', quarterId: 'all', sprintId: 'all', sprintStatus: 'all', ...filters }, metadata, config);

test('completed story appears once, in its completion sprint and quarter', () => {
  const all = compute();
  assert.equal(all.diagnosis.contributionSources.length, 1);
  const source = all.diagnosis.contributionSources[0];
  assert.equal(source.completionDateConfirmed, true);
  assert.equal(source.subtasks.length, 1);
  assert.equal(compute({ sprintId: source.completionSprint }).diagnosis.contributionSources.length, 1);
  const previous = all.sprints.find((sprint) => sprint.id !== 'all' && sprint.id !== source.completionSprint);
  assert.ok(previous);
  assert.equal(compute({ sprintId: previous.id }).diagnosis.contributionSources.length, 0);
  assert.equal(compute({ quarterId: 'CY26 PI.3' }).diagnosis.contributionSources.length, 0);
  assert.equal(compute({ quarterId: 'CY26 PI.4' }).diagnosis.contributionSources.length, 1);
  assert.equal(compute({ podId: 'DTR' }).diagnosis.contributionSources.length, 0);
  assert.equal(compute({ sprintStatus: 'open' }).diagnosis.contributionSources.length, 0);
});

test('missing completion dates are visible as fallback, not falsely confirmed', () => {
  const result = computeDashboardData([{ ...story, resolutionDate: undefined }, child], { podId: 'all', quarterId: 'all', sprintId: 'all' }, metadata, config);
  assert.equal(result.diagnosis.contributionSources[0].completionDateConfirmed, false);
});

const rawLog = (id, seconds) => ({ id, author: { accountId: 'actual-author', displayName: 'Ahmed' },
  started: '2026-10-01T09:00:00.000+0530', timeSpentSeconds: seconds });
for (const [mode, implementation] of [['local', preparation], ['Forge', forge]]) {
  test(`${mode}: worklogs use the actual author and timestamp without borrowing an assignee`, () => {
    const result = implementation.normalizeContributionWorklogPage('ERP-2', { startAt: 0, total: 1, worklogs: [rawLog('1', 7200)] });
    assert.equal(result.worklogs[0].authorAccountId, 'actual-author');
    assert.equal(result.worklogs[0].authorName, 'Ahmed');
    assert.equal(result.worklogs[0].timeSpentSeconds, 7200);
    assert.equal(result.worklogs[0].started, rawLog('1', 7200).started);
    const missing = implementation.normalizeContributionWorklogPage('ERP-2', { startAt: 0, total: 1, worklogs: [{ id: '2', timeSpentSeconds: 3600 }] });
    assert.equal(missing.worklogs[0].authorAccountId, null);
    assert.equal(missing.worklogs[0].started, null);
  });
  test(`${mode}: rejects malformed pages, negative durations, and unsafe input`, () => {
    assert.throws(() => implementation.normalizeContributionWorklogPage('ERP-2', { startAt: 0, total: 1, worklogs: [] }));
    assert.throws(() => implementation.normalizeContributionWorklogPage('ERP-2', { startAt: 0, total: 1, worklogs: [rawLog('1', -1)] }));
    assert.throws(() => implementation.validateWorklogRequest('../field', 0));
    assert.throws(() => implementation.validateWorklogRequest('ERP-2', -1));
    implementation.validateWorklogRequest('ERP-2', 0);
  });
}

test('pagination loads all pages and does not attribute partial results after an error', async () => {
  const offsets = [];
  const result = await loadContributionWorklogs('ERP-2', async (key, offset) => {
    offsets.push(offset);
    return preparation.normalizeContributionWorklogPage(key, { startAt: offset, total: 2, worklogs: [rawLog(String(offset), 3600)] });
  });
  assert.deepEqual(offsets, [0, 1]);
  assert.equal(result.reduce((sum, row) => sum + row.timeSpentSeconds, 0), 7200);
  await assert.rejects(loadContributionWorklogs('ERP-2', async (key, offset) => {
    if (offset) throw new Error('403');
    return preparation.normalizeContributionWorklogPage(key, { startAt: 0, total: 2, worklogs: [rawLog('1', 3600)] });
  }), /403/);
});

test('pagination rejects duplicate entries, changed totals, and cancellation', async () => {
  await assert.rejects(loadContributionWorklogs('ERP-2', async (key, offset) => ({
    issueKey: key, startAt: offset, total: 2,
    worklogs: preparation.normalizeContributionWorklogPage(key, { startAt: 0, total: 1, worklogs: [rawLog('same-id', 3600)] }).worklogs,
  })), /duplicate/);
  await assert.rejects(loadContributionWorklogs('ERP-2', async (key, offset) => ({ issueKey: key, startAt: offset, total: offset ? 3 : 2, worklogs: [{ id: String(offset) }] })), /changed/);
  await assert.rejects(loadContributionWorklogs('ERP-2', async () => { throw new Error('must not fetch'); }, () => false), /stopped/);
});


test('browser transport keeps author identities after the server normalizes a page', async () => {
  const { fetchContributionWorklogPage } = loadTs('src/lib/api.ts');
  const normalized = preparation.normalizeContributionWorklogPage('ERP-2', { startAt: 0, total: 1, worklogs: [rawLog('1', 7200)] });
  fetchImpl = async () => ({ ok: true, json: async () => normalized });
  try {
    const page = await fetchContributionWorklogPage('ERP-2', 0);
    assert.equal(page.worklogs[0].authorAccountId, 'actual-author');
    assert.equal(page.worklogs[0].authorName, 'Ahmed');
    assert.equal(page.worklogs[0].timeSpentSeconds, 7200);
  } finally {
    fetchImpl = () => { throw new Error('Unexpected network request'); };
  }
});

test('readiness UI displays the scoped stories without fetching worklogs on render', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { ContributionReadiness } = loadTs('src/components/ContributionReadiness.tsx');
  const html = renderToStaticMarkup(React.createElement(ContributionReadiness, {
    sources: compute().diagnosis.contributionSources, scopeLabel: 'Finance · CY26 PI.4', jiraDomain: 'https://example.atlassian.net',
  }));
  assert.match(html, /Individual Contribution/);
  assert.match(html, /Check worklogs/);
  assert.match(html, /ERP-1/);
  assert.match(html, /ERP-2026-Q4-S0/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
