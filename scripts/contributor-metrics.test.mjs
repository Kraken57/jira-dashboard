import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();
function loadTs(file) {
  const path = resolve(file);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, process, console,
    require: (name) => {
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      const base = name.startsWith('@/') ? resolve(process.cwd(), 'src', name.slice(2)) : resolve(dirname(path), name);
      return loadTs(`${base}${existsSync(`${base}.ts`) ? '.ts' : '.tsx'}`);
    },
  }, { filename: path });
  return module.exports;
}
const item = (key, fields = {}) => ({ key, summary: key, workType: 'Story', status: 'Accepted',
  podKey: 'ERP', podName: 'Finance', quarter: 'CY26 PI.4', team: 'Finance', sprints: [], storyPoints: 5, ...fields });
const child = (key, name, estimate, logged) => item(key, { workType: 'Sub-task', parentKey: 'ERP-1',
  assignee: name, originalEstimateSeconds: estimate * 3600, timeSpentSeconds: logged * 3600, storyPoints: 0 });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const story = item('ERP-1', { assignee: 'BA', originalEstimateSeconds: 99 * 3600 });
const children = [child('ERP-2', 'BA', 6, 5), child('ERP-3', 'Dev 1', 12, 10), child('ERP-4', 'Dev 2', 8, 10),
  child('ERP-5', 'QA', 4, 3), child('ERP-6', 'QA', 6, 5), child('ERP-7', 'QA', 3, 2)];
const people = ['BA', 'Dev 1', 'Dev 2', 'QA'].map((name) => ({ name,
  assignedSubtasks: children.filter((item) => item.assignee === name).length,
  originalEstimateHours: children.filter((item) => item.assignee === name).reduce((sum, item) => sum + item.originalEstimateSeconds / 3600, 0),
  loggedHours: children.filter((item) => item.assignee === name).reduce((sum, item) => sum + item.timeSpentSeconds / 3600, 0),
}));
for (const path of ['src/lib/jira/contributorMetrics.ts', 'forge/src/contributorMetrics.ts']) {
  const { buildContributorMetrics } = loadTs(path);
  test(`${path}: reproduces the 5 SP example without counting the parent estimate`, () => {
    const result = buildContributorMetrics(people, [story], children);
    for (const [name, standard, actual] of [['BA', 6, 5], ['Dev 1', 12, 10], ['Dev 2', 8, 10], ['QA', 13, 10]]) {
      const person = result.people.find((person) => person.name === name);
      close(person.attributedStoryPoints, standard / 39 * 5);
      close(person.efficiency, standard / 39 * 5 / actual);
    }
    close(result.people.reduce((sum, person) => sum + person.attributedStoryPoints, 0), 5);
    assert.equal(result.people.find((person) => person.name === 'QA').subtaskCount, 3);
  });
  test(`${path}: sums story shares before dividing by the displayed logged total`, () => {
    const second = item('ERP-10', { storyPoints: 8 });
    const secondChild = { ...child('ERP-11', 'QA', 1, 2), parentKey: 'ERP-10' };
    const result = buildContributorMetrics([{ name: 'QA', assignedSubtasks: 4, originalEstimateHours: 14, loggedHours: 12 }], [story, second], [...children, secondChild]);
    const qa = result.people.find((person) => person.name === 'QA');
    close(qa.attributedStoryPoints, 13 / 39 * 5 + 8);
    close(qa.efficiency, (13 / 39 * 5 + 8) / 12);
  });
  test(`${path}: missing estimates and no subtasks do not receive arbitrary credit`, () => {
    const result = buildContributorMetrics(people, [story, item('ERP-10')], children.map((item) => ({ ...item, originalEstimateSeconds: 0 })));
    assert.equal(result.storiesWithoutSubtasks, 1);
    assert.equal(result.storiesWithoutEstimates, 1);
    assert.equal(result.subtasksWithoutEstimates, 6);
    assert.ok(result.people.every((person) => person.attributedStoryPoints === 0));
  });
  test(`${path}: zero logged effort yields N/A, unassigned shares stay unassigned, canceled children are excluded`, () => {
    const result = buildContributorMetrics([{ name: 'QA', assignedSubtasks: 1, originalEstimateHours: 1, loggedHours: 0 }], [story], [
      child('ERP-2', 'QA', 1, 0), child('ERP-3', undefined, 1, 1), { ...child('ERP-4', 'QA', 98, 0), status: 'Canceled' },
    ]);
    close(result.people[0].attributedStoryPoints, 2.5);
    assert.equal(result.people[0].efficiency, null);
    close(result.unassignedStoryPoints, 2.5);
  });
  test(`${path}: duplicate story/child records do not multiply attribution`, () => {
    const result = buildContributorMetrics(people, [story, story], [...children, ...children]);
    close(result.people.reduce((sum, person) => sum + person.attributedStoryPoints, 0), 5);
  });
}

const { computeDashboardData, resolveMetricConfig } = loadTs('src/lib/jira/metricsEngine.ts');
const old = 'ERP-2026-Q3-S6', current = 'ERP-2026-Q4-S0';
const metadata = {
  [old]: { name: old, state: 'closed', startDate: '2026-09-16T00:00:00Z', endDate: '2026-09-30T00:00:00Z' },
  [current]: { name: current, state: 'closed', startDate: '2026-09-30T00:00:00Z', endDate: '2026-10-07T00:00:00Z' },
};
const completed = { ...story, sprints: [old, current], resolutionDate: '2026-10-03T12:00:00Z' };
const config = { ...resolveMetricConfig(), doneStatuses: ['Accepted'] };
const compute = (filters = {}) => computeDashboardData([completed, ...children], { podId: 'all', quarterId: 'all', sprintId: 'all', ...filters }, metadata, config);
const points = (data) => data.diagnosis.individualContribution.people.reduce((sum, person) => sum + person.attributedStoryPoints, 0);

test('shared filters: completion sprint receives credit once; earlier sprint and quarter do not', () => {
  const all = compute();
  close(points(all), 5);
  const completion = all.issueList.find((item) => item.key === story.key).completionSprint;
  const previous = all.sprints.find((sprint) => sprint.id !== 'all' && sprint.id !== completion);
  close(points(compute({ sprintId: completion })), 5);
  close(points(compute({ sprintId: previous.id })), 0);
  close(points(compute({ quarterId: 'CY26 PI.3' })), 0);
  close(points(compute({ quarterId: 'CY26 PI.4' })), 5);
  assert.equal(compute({ podId: 'DTR' }).diagnosis.individualContribution.people.length, 0);
});

test('open stories can have estimates and logged hours but correctly earn zero points until completed', () => {
  const openStory = { ...completed, status: 'In Progress', sprints: [current], resolutionDate: undefined };
  const openChildren = children.map((row) => ({ ...row, sprints: [current] }));
  const data = computeDashboardData([openStory, ...openChildren], { podId: 'all', quarterId: 'all', sprintId: 'all' }, metadata, config);
  const qa = data.diagnosis.individualContribution.people.find((person) => person.name === 'QA');
  assert.ok(qa.originalEstimateHours > 0);
  assert.ok(qa.loggedEffortHours > 0);
  assert.equal(qa.attributedStoryPoints, 0);
  assert.equal(qa.efficiency, 0);
  assert.equal(qa.sprintDetails[0].allocations.length, 0);
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { IssuesModal } = loadTs('src/components/IssuesModal.tsx');
  const html = renderToStaticMarkup(React.createElement(IssuesModal, {
    title: 'Work items · QA', issues: data.developerIssueList, developerEffortColumns: true, onClose() {},
  }));
  assert.match(html, /N\/A/);
  assert.doesNotMatch(html, /0\s*÷\s*0\s*×\s*0 SP/);
});

test('counts and hour totals match Capacity View for the same filters', () => {
  const data = compute();
  for (const dev of data.developers) {
    const person = data.diagnosis.individualContribution.people.find((person) => person.name === dev.name);
    assert.equal(person.subtaskCount, dev.assignedSubtasks);
    assert.equal(person.originalEstimateHours, dev.originalEstimateHours);
    assert.equal(person.loggedEffortHours, dev.loggedHours);
  }
});

test('capacity popup rows receive each completed story point share on its subtasks', () => {
  const rows = compute().developerIssueList;
  const storyRow = rows.find((row) => row.key === 'ERP-1');
  assert.equal(storyRow.attributedStoryPoints, null);
  close(rows.find((row) => row.key === 'ERP-2').attributedStoryPoints, 6 / 39 * 5);
  close(rows.find((row) => row.key === 'ERP-3').attributedStoryPoints, 12 / 39 * 5);
  close(rows.find((row) => row.key === 'ERP-5').attributedStoryPoints, 4 / 39 * 5);
  close(rows.reduce((sum, row) => sum + (row.attributedStoryPoints || 0), 0), 5);

  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { IssuesModal } = loadTs('src/components/IssuesModal.tsx');
  const html = renderToStaticMarkup(React.createElement(IssuesModal, {
    title: 'Work items · QA', issues: rows, jiraDomain: 'https://example.atlassian.net',
    developerEffortColumns: true, onClose() {},
  }));
  assert.ok(html.indexOf('Attributed SP') < html.indexOf('>Sprint</th>'));
  assert.match(html, /4\s*÷\s*39\s*×\s*5 SP/);
  assert.match(html, /target="_blank"/);
});

test('summary renders only 20 of 81 names while totaling all 81 contributors', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { ContributorSummary } = loadTs('src/components/ContributorSummary.tsx');
  const data = { people: Array.from({ length: 81 }, (_, i) => ({ name: `Person ${i}`, subtaskCount: 1,
    originalEstimateHours: 2, loggedEffortHours: 1, attributedStoryPoints: 1, efficiency: 1 })),
    storiesWithoutSubtasks: 0, storiesWithoutEstimates: 0, subtasksWithoutEstimates: 0, unassignedStoryPoints: 0 };
  const html = renderToStaticMarkup(React.createElement(ContributorSummary, { data, scopeLabel: 'All work' }));
  const tbody = html.split('<tbody')[1].split('</tbody>')[0];
  assert.equal((tbody.match(/<tr\b/g) || []).length, 20);
  assert.match(html, /of 81 contributors/);
  assert.match(html, /Overall total/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});


test('summary defaults to alphabetical names and makes contributor rows keyboard accessible', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { ContributorSummary } = loadTs('src/components/ContributorSummary.tsx');
  const { buildContributorMetrics } = loadTs('src/lib/jira/contributorMetrics.ts');
  const data = buildContributorMetrics(people, [story], children);
  const html = renderToStaticMarkup(React.createElement(ContributorSummary, { data, scopeLabel: 'All work' }));
  const body = html.split('<tbody')[1].split('</tbody>')[0];
  assert.ok(body.indexOf('>BA</td>') < body.indexOf('>Dev 1</td>'));
  assert.ok(body.indexOf('>Dev 1</td>') < body.indexOf('>Dev 2</td>'));
  assert.ok(body.indexOf('>Dev 2</td>') < body.indexOf('>QA</td>'));
  assert.match(html, /Name: A–Z<\/option>/);
  assert.match(html, /View contribution details for QA/);
  assert.match(html, /role="button" tabindex="0" aria-haspopup="dialog" aria-label="View contribution details for BA"/);
  assert.doesNotMatch(html, /completed stories without subtasks/);
});

for (const path of ['src/lib/jira/contributorMetrics.ts', 'forge/src/contributorMetrics.ts']) {
  test(`${path}: detail cards preserve per-story formulas and list QA's subtasks`, () => {
    const { buildContributorMetrics } = loadTs(path);
    const s = { ...story, sprints: ['sprint-1'] };
    const subs = children.map((item) => ({ ...item, sprints: ['sprint-1'] }));
    const context = { scopedWork: subs, completionSprint: () => 'sprint-1', includeSprint: () => true,
      sprintInfo: () => ({ name: 'ERP-2026-Q4-S3', dateRanges: [{ startDate: '2026-11-04T00:00:00Z', endDate: '2026-11-18T00:00:00Z' }] }) };
    const result = buildContributorMetrics(people, [s], subs, context);
    const qa = result.people.find((person) => person.name === 'QA');
    const card = qa.sprintDetails[0];
    assert.equal(card.podName, 'Finance');
    assert.equal(card.subtaskCount, 3);
    assert.equal(card.contributorCount, 4);
    close(card.originalEstimateHours, 13);
    close(card.loggedEffortHours, 10);
    close(card.efficiency, 13 / 39 * 5 / 10);
    assert.equal(card.allocations[0].subtasks.length, 3);
    close(card.allocations[0].originalEstimateHours, 13);
    close(card.allocations[0].totalStoryEstimateHours, 39);
    close(card.allocations[0].share, 13 / 39);
    close(card.attributedStoryPoints, qa.attributedStoryPoints);
  });

  test(`${path}: card context does not change existing summary totals`, () => {
    const { buildContributorMetrics } = loadTs(path);
    const subs = children.map((item) => ({ ...item, sprints: ['old', 'new'] }));
    const before = buildContributorMetrics(people, [story], subs);
    const after = buildContributorMetrics(people, [story], subs, {
      scopedWork: subs, completionSprint: () => 'new', includeSprint: () => true,
      sprintInfo: (id) => ({ name: id, dateRanges: [{ startDate: id === 'old' ? '2026-10-01' : '2026-11-01', endDate: id === 'old' ? '2026-10-14' : '2026-11-14' }] }),
    });
    for (const person of after.people) {
      const previous = before.people.find((row) => row.name === person.name);
      assert.equal(person.originalEstimateHours, previous.originalEstimateHours);
      assert.equal(person.loggedEffortHours, previous.loggedEffortHours);
      assert.equal(person.attributedStoryPoints, previous.attributedStoryPoints);
      assert.equal(person.efficiency, previous.efficiency);
      assert.equal(person.sprintDetails[0].sprintId, 'old');
      assert.equal(person.sprintDetails[1].sprintId, 'new');
      close(person.sprintDetails[0].attributedStoryPoints, 0);
      close(person.sprintDetails[1].attributedStoryPoints, person.attributedStoryPoints);
    }
  });
}

test('shared filters: details show only the selected pod/sprint and preserve exact Jira dates', () => {
  const all = compute();
  const completion = all.issueList.find((item) => item.key === story.key).completionSprint;
  const data = compute({ sprintId: completion, quarterId: 'CY26 PI.4', podId: 'ERP' });
  const qa = data.diagnosis.individualContribution.people.find((person) => person.name === 'QA');
  assert.equal(qa.sprintDetails.length, 1);
  assert.equal(qa.sprintDetails[0].sprintName, current);
  assert.equal(qa.sprintDetails[0].podKey, 'ERP');
  assert.equal(qa.sprintDetails[0].dateRanges[0].startDate, metadata[current].startDate);
  assert.equal(qa.sprintDetails[0].workItems.length, 3);
});

test('popup renders formula, pod, dates, work-item summaries and real browse links', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { ContributorDetailsModal } = loadTs('src/components/ContributorDetailsModal.tsx');
  const data = compute();
  const person = data.diagnosis.individualContribution.people.find((person) => person.name === 'QA');
  const html = renderToStaticMarkup(React.createElement(ContributorDetailsModal, {
    person, scopeLabel: 'All work', jiraDomain: 'https://example.atlassian.net', onClose() {},
  }));
  assert.match(html, /Finance/);
  assert.match(html, /SEP 16, 2026/);
  assert.match(html, /ERP-5/);
  assert.match(html, /https:\/\/example.atlassian.net\/browse\/ERP-5/);
  assert.match(html, /Original Estimates/);
  assert.match(html, /Next sprint card/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('popup efficiency tile uses amber-red below 0.125 including N/A, and green at or above it', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { ContributorDetailsModal } = loadTs('src/components/ContributorDetailsModal.tsx');
  const person = compute().diagnosis.individualContribution.people.find((person) => person.name === 'QA');
  const renderBand = (efficiency) => {
    const adjusted = { ...person, sprintDetails: person.sprintDetails.map((card, index) => index === 0 ? { ...card, efficiency } : card) };
    return renderToStaticMarkup(React.createElement(ContributorDetailsModal, { person: adjusted, scopeLabel: 'Selected filters', onClose() {} }));
  };
  assert.match(renderBand(0.1249), /data-efficiency-band="low" class="rounded-lg border px-3 py-3 border-orange-200 bg-orange-50 text-orange-900"/);
  assert.match(renderBand(0.125), /data-efficiency-band="good" class="rounded-lg border px-3 py-3 border-emerald-200 bg-emerald-50 text-emerald-900"/);
  assert.match(renderBand(null), /data-efficiency-band="low" class="rounded-lg border px-3 py-3 border-orange-200 bg-orange-50 text-orange-900"/);
});

test('main contributor efficiency values are red below 0.125 or N/A and green from 0.125', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { ContributorSummary } = loadTs('src/components/ContributorSummary.tsx');
  const data = { people: [
    { name: 'Low', subtaskCount: 1, originalEstimateHours: 1, loggedEffortHours: 1, attributedStoryPoints: 0.12, efficiency: 0.12 },
    { name: 'At threshold', subtaskCount: 1, originalEstimateHours: 1, loggedEffortHours: 8, attributedStoryPoints: 1, efficiency: 0.125 },
    { name: 'Unavailable', subtaskCount: 1, originalEstimateHours: 1, loggedEffortHours: 0, attributedStoryPoints: 0, efficiency: null },
  ], storiesWithoutSubtasks: 0, storiesWithoutEstimates: 0, subtasksWithoutEstimates: 0, unassignedStoryPoints: 0 };
  const html = renderToStaticMarkup(React.createElement(ContributorSummary, { data, scopeLabel: 'Selected filters' }));
  assert.match(html, /text-red-700[^>]*title="Attributed Story Points divided by Logged Effort">0\.120/);
  assert.match(html, /text-green-700[^>]*title="Attributed Story Points divided by Logged Effort">0\.125/);
  assert.match(html, /text-red-700[^>]*title="No logged effort in the selected scope">N\/A/);
});

test('Jira link opens through the Forge router in Forge and the browser locally', async () => {
  const { openJiraWorkLink } = loadTs('src/components/JiraWorkLink.tsx');
  const calls = [];
  const href = 'https://example.atlassian.net/browse/ERP-5';
  await openJiraWorkLink(href, 'ERP-5', true, (url) => calls.push(['browser', url]), async (key) => { calls.push(['forge', key]); });
  await openJiraWorkLink(href, 'ERP-5', false, (url) => calls.push(['browser', url]), async (key) => { calls.push(['forge', key]); });
  assert.deepEqual(calls, [['forge', 'ERP-5'], ['browser', href]]);
});

test('multiple pods get separate cards with exact timelines, and pod filters remove other cards', () => {
  const dtrSprint = 'DTR-2026-Q4-S0';
  const financeChildren = children.map((row) => ({ ...row, sprints: [current] }));
  const dtrStory = item('DTR-1', { podKey: 'DTR', podName: 'Deal to Revenue', sprints: [dtrSprint], resolutionDate: '2026-10-05T12:00:00Z' });
  const dtrChild = { ...child('DTR-2', 'QA', 2, 1), parentKey: 'DTR-1', podKey: 'DTR', podName: 'Deal to Revenue', sprints: [dtrSprint] };
  const meta = { ...metadata, [dtrSprint]: { name: dtrSprint, state: 'closed', startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-15T00:00:00Z' } };
  const source = [completed, ...financeChildren, dtrStory, dtrChild];
  const run = (podId) => computeDashboardData(source, { podId, quarterId: 'CY26 PI.4', sprintId: 'all', sprintStatus: 'closed' }, meta, config);
  const both = run(['ERP', 'DTR']).diagnosis.individualContribution.people.find((person) => person.name === 'QA');
  assert.equal(both.sprintDetails.length, 2);
  assert.equal(both.sprintDetails[0].podKey, 'ERP');
  assert.equal(both.sprintDetails[0].sprintName, current);
  assert.equal(both.sprintDetails[1].podKey, 'DTR');
  assert.equal(both.sprintDetails[1].dateRanges[0].endDate, meta[dtrSprint].endDate);
  assert.equal(both.sprintDetails[1].subtaskCount, 1);
  const onlyDtr = run('DTR').diagnosis.individualContribution.people.find((person) => person.name === 'QA');
  assert.equal(onlyDtr.sprintDetails.length, 1);
  assert.equal(onlyDtr.sprintDetails[0].podKey, 'DTR');
});

test('no-sprint work has an explicit undated card without invented dates or point allocation', () => {
  const { buildContributorMetrics } = loadTs('src/lib/jira/contributorMetrics.ts');
  const zero = child('ERP-2', 'QA', 0, 0);
  const result = buildContributorMetrics([{ name: 'QA', assignedSubtasks: 1, originalEstimateHours: 0, loggedHours: 0 }], [], [zero], {
    scopedWork: [zero], completionSprint: () => null, includeSprint: () => true,
    sprintInfo: () => ({ name: 'No sprint assigned', dateRanges: [] }),
  });
  const card = result.people[0].sprintDetails[0];
  assert.equal(card.sprintId, '');
  assert.equal(card.dateRanges.length, 0);
  assert.equal(card.efficiency, null);
  assert.equal(card.workItems[0].key, 'ERP-2');
});
