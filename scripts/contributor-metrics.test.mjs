import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
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
    require: (name) => name.startsWith('.') ? loadTs(resolve(dirname(path), `${name}.ts`)) : require(name),
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

test('counts and hour totals match Capacity View for the same filters', () => {
  const data = compute();
  for (const dev of data.developers) {
    const person = data.diagnosis.individualContribution.people.find((person) => person.name === dev.name);
    assert.equal(person.subtaskCount, dev.assignedSubtasks);
    assert.equal(person.originalEstimateHours, dev.originalEstimateHours);
    assert.equal(person.loggedEffortHours, dev.loggedHours);
  }
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
