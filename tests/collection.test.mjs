import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlan } from '../skills/buyer-intent-lead-finder/scripts/domain.mjs';
import { startCollection, readResults, apiArguments } from '../skills/buyer-intent-lead-finder/scripts/collection.mjs';

const brief = { product: 'Demo CRM', keywords: ['CRM'], sources: ['reddit'], queries: ['CRM recommendations'], budgetUsd: 0.1, maxResults: 2, days: 30 };

async function workspace(fn) {
  const folder = await mkdtemp(join(tmpdir(), 'buyer-intent-test-'));
  try { await fn(join(folder, 'state.json')); } finally { await rm(folder, { recursive: true, force: true }); }
}

test('approval mismatch makes no external call', async () => workspace(async path => {
  let calls = 0;
  await assert.rejects(startCollection(createPlan(brief), path, 'wrong', async () => { calls++; }), /approval/i);
  assert.equal(calls, 0);
}));

test('reserved state prevents repeated or concurrent paid starts', async () => workspace(async path => {
  const plan = createPlan(brief);
  let calls = 0;
  const api = async () => { calls++; return { data: { id: 'syntheticRun123', actId: plan.jobs[0].actorId, buildNumber: plan.jobs[0].build, status: 'RUNNING' } }; };
  await startCollection(plan, path, plan.hash, api);
  await assert.rejects(startCollection(plan, path, plan.hash, api), /exists|already|state/i);
  assert.equal(calls, 1);
}));

test('unknown external start is saved and never silently retried', async () => workspace(async path => {
  const plan = createPlan(brief);
  await assert.rejects(startCollection(plan, path, plan.hash, async () => { throw new Error('network timeout'); }), /unknown/i);
  const state = JSON.parse(await readFile(path));
  assert.equal(state.jobs[0].status, 'UNKNOWN');
  assert.equal(state.status, 'NEEDS_REVIEW');
}));

test('API calls use argument arrays, bounded endpoints and cap/restart parameters', () => {
  const args = apiArguments('POST', '/v2/acts/j1gQL2JlzmGKxrPzJ/runs', { maxTotalChargeUsd: 0.1, restartOnError: false }, { searchQuery: 'CRM $(touch bad)' });
  assert.equal(args[0], 'api');
  assert.ok(args.includes('--body'));
  assert.throws(() => apiArguments('GET', 'https://attacker.example/', {}, null));
  assert.throws(() => apiArguments('DELETE', '/v2/acts/j1gQL2JlzmGKxrPzJ', {}, null));
});

test('results require matching Actor/build, terminal output and summary before ranking', async () => {
  const plan = createPlan(brief);
  const state = { plan, jobs: [{ ...plan.jobs[0], runId: 'syntheticRun123', status: 'RUNNING' }] };
  const run = { id: 'syntheticRun123', actId: plan.jobs[0].actorId, buildNumber: plan.jobs[0].build, status: 'SUCCEEDED', defaultDatasetId: 'syntheticDataset1', defaultKeyValueStoreId: 'syntheticStore1', usageTotalUsd: 0.00605 };
  const api = async (method, path) => {
    if (path.includes('/actor-runs/')) return { data: run };
    if (path.endsWith('/OUTPUT')) return { status: 'SUCCEEDED', itemCount: 1 };
    if (path.endsWith('/RUN_SUMMARY')) return { status: 'SUCCEEDED', resultCount: 1 };
    if (path.endsWith('/items')) return [{ title: 'Looking for CRM recommendations', body: 'Need a CRM for our sales team.', url: 'https://reddit.com/r/sales/comments/test123/', createdAt: new Date().toISOString() }];
    throw new Error('unexpected path');
  };
  const corpus = await readResults(state, api);
  assert.equal(corpus.records.length, 1);
  assert.equal(corpus.receipts[0].build, plan.jobs[0].build);
  assert.equal(corpus.receipts[0].reportedChargeUsd, 0.00605);
  const badApi = async (method, path, params) => path.endsWith('/RUN_SUMMARY') ? { status: 'UPSTREAM_FAILED' } : api(method, path, params);
  const bad = await readResults(state, badApi);
  assert.equal(bad.records.length, 0);
  assert.equal(bad.receipts[0].status, 'SEMANTIC_FAILURE');
});

test('missing terminal records produce a visible blocked receipt', async () => {
  const plan = createPlan(brief);
  const state = { plan, jobs: [{ ...plan.jobs[0], runId: 'syntheticRun123' }] };
  const api = async (method, path) => path.includes('/actor-runs/') ? { data: { status: 'SUCCEEDED', actId: plan.jobs[0].actorId, buildNumber: plan.jobs[0].build, defaultDatasetId: 'syntheticDataset1', defaultKeyValueStoreId: 'syntheticStore1' } } : Promise.reject(new Error('not found'));
  const result = await readResults(state, api);
  assert.equal(result.records.length, 0);
  assert.equal(result.receipts[0].status, 'MISSING_TERMINAL_RECORDS');
});

test('an apparently successful empty dataset is blocked when terminal counts equal the search limit', async () => {
  const plan = createPlan(brief);
  const state = { plan, jobs: [{ ...plan.jobs[0], runId: 'syntheticRun123' }] };
  const api = async (method, path) => {
    if (path.includes('/actor-runs/')) return { data: { status: 'SUCCEEDED', actId: plan.jobs[0].actorId, buildNumber: plan.jobs[0].build, defaultDatasetId: 'syntheticDataset1', defaultKeyValueStoreId: 'syntheticStore1' } };
    if (path.endsWith('/OUTPUT') || path.endsWith('/RUN_SUMMARY')) return { outcome: 'COMPLETE', itemsPushed: 2 };
    if (path.endsWith('/items')) return [];
    throw new Error('unexpected path');
  };
  const result = await readResults(state, api);
  assert.equal(result.records.length, 0);
  assert.equal(result.receipts[0].status, 'COUNT_MISMATCH');
});

test('known run from a foreign build cannot enter lead results', async () => {
  const plan = createPlan(brief);
  const state = { plan, jobs: [{ ...plan.jobs[0], runId: 'syntheticRun123' }] };
  const result = await readResults(state, async () => ({ data: { status: 'SUCCEEDED', actId: plan.jobs[0].actorId, buildNumber: '9.9.9' } }));
  assert.equal(result.receipts[0].status, 'IDENTITY_MISMATCH');
  assert.equal(result.records.length, 0);
});

test('tampered ledger actor is rejected before status/result queries', async () => {
  const plan = createPlan(brief);
  const state = { plan, jobs: [{ ...plan.jobs[0], actorId: 'foreignActor', runId: 'syntheticRun123' }] };
  let calls = 0;
  await assert.rejects(readResults(state, async () => { calls++; }), /ledger/i);
  assert.equal(calls, 0);
});

test('a different exact build on terminal readback blocks result export', async () => {
  const plan = createPlan(brief);
  const state = { plan, jobs: [{ ...plan.jobs[0], runId: 'syntheticRun123' }] };
  let runReads = 0;
  const api = async (method, path) => {
    if (path.includes('/actor-runs/')) return { data: { status: 'SUCCEEDED', actId: plan.jobs[0].actorId, buildNumber: plan.jobs[0].build, buildId: ++runReads === 1 ? plan.jobs[0].buildId : 'differentBuild123', defaultDatasetId: 'syntheticDataset1', defaultKeyValueStoreId: 'syntheticStore1' } };
    if (path.endsWith('/OUTPUT') || path.endsWith('/RUN_SUMMARY')) return { outcome: 'VALID_EMPTY', itemsPushed: 0 };
    if (path.endsWith('/items')) return [];
    throw new Error('unexpected path');
  };
  const result = await readResults(state, api);
  assert.equal(result.receipts[0].status, 'READBACK_MISMATCH');
  assert.equal(result.records.length, 0);
});
