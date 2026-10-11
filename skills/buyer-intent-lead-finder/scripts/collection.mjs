import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ACTORS, validatePlan } from './domain.mjs';

const execute = promisify(execFile);
const idPattern = /^[a-zA-Z0-9]{3,64}$/;
const terminal = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);
const acceptable = new Set(['COMPLETE', 'PARTIAL', 'VALID_EMPTY', 'SUCCEEDED']);
const ownedActors = new Set(Object.values(ACTORS).map(a => a.actorId));

export function apiArguments(method, path, params = {}, body = null) {
  const segment = '[a-zA-Z0-9]{3,64}';
  const reads = new RegExp(`^/v2/(?:users/me|acts/${segment}|actor-runs/${segment}|actor-builds/${segment}/openapi\\.json|datasets/${segment}(?:/items)?|key-value-stores/${segment}/records/(?:OUTPUT|RUN_SUMMARY))$`);
  const start = path.match(/^\/v2\/acts\/([a-zA-Z0-9]{3,64})\/runs$/);
  if ((method !== 'GET' || !reads.test(path)) && !(method === 'POST' && start && ownedActors.has(start[1]))) throw new Error('Unsupported API method or endpoint');
  const args = ['api', method, path];
  if (Object.keys(params).length) args.push('--params', JSON.stringify(params));
  if (body !== null) args.push('--body', JSON.stringify(body));
  return args;
}

export async function cliApi(method, path, params = {}, body = null) {
  const args = apiArguments(method, path, params, body);
  let response;
  try {
    const { stdout } = await execute('apify', args, { timeout: 45000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    response = JSON.parse(stdout);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('APIFY_CLI_MISSING: Install the official Apify CLI, then run doctor. Offline analysis remains available.');
    throw new Error('APIFY_REQUEST_FAILED: Check the official CLI login, platform limits, and the specific run in Apify. No automatic retry was attempted.');
  }
  if (response?.error) throw new Error('APIFY_REQUEST_FAILED: The official API reported an error. Inspect Apify before retrying.');
  return response;
}

export async function doctor(live = false) {
  let cliAvailable = false;
  let cliVersion = null;
  let apiCommandAvailable = false;
  try {
    const info = await execute('apify', ['--version'], { timeout: 15000, maxBuffer: 100000 });
    cliVersion = info.stdout.trim();
    await execute('apify', ['api', '--help'], { timeout: 15000, maxBuffer: 100000 });
    cliAvailable = true;
    apiCommandAvailable = true;
  } catch { /* Missing CLI is an explicit doctor result, not a successful live check. */ }
  const result = { pluginVersion: '1.0.0', nodeVersion: process.version, offlineAvailable: true, cliAvailable, apiCommandAvailable, cliVersion, liveChecked: false };
  if (live) {
    const response = await cliApi('GET', '/v2/users/me');
    const user = response?.data;
    if (!user?.username) throw new Error('The official CLI did not return an authenticated Apify username');
    result.liveChecked = true;
    result.apifyUsername = user.username;
  }
  return result;
}

const unwrap = response => response && typeof response === 'object' && Object.hasOwn(response, 'data') ? response.data : response;
const validId = value => typeof value === 'string' && idPattern.test(value);

export async function startCollection(rawPlan, statePath, approval, api = cliApi) {
  const plan = validatePlan(rawPlan);
  if (approval !== plan.hash) throw new Error('Approval hash must match the exact displayed plan');
  const age = Date.now() - new Date(plan.createdAt).getTime();
  if (age > 24 * 3600000 || age < -60000) throw new Error('Plan is stale or dated in the future; regenerate and obtain new approval');
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  let handle;
  try { handle = await open(statePath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Collection state already exists. Use status/results; do not repeat a paid start.');
    throw new Error('Could not reserve the collection state file. No Actor was started.');
  }
  const state = { schemaVersion: 1, plan, startedAt: new Date().toISOString(), status: 'STARTING', jobs: plan.jobs.map(j => ({ ...j, status: 'NOT_STARTED', runId: null })) };
  await handle.writeFile(JSON.stringify(state, null, 2) + '\n');
  await handle.close();
  const save = () => writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  for (const job of state.jobs) {
    job.status = 'STARTING';
    await save();
    try {
      const run = unwrap(await api('POST', `/v2/acts/${job.actorId}/runs`, { build: job.build, timeout: job.timeout, memory: job.memory, maxTotalChargeUsd: job.maxChargeUsd, restartOnError: false }, job.input));
      if (!validId(run?.id)) throw new Error('Start response omitted the run ID');
      job.runId = run.id;
      if (run.actId && run.actId !== job.actorId) throw new Error('Actor identity mismatch');
      job.status = run.status ?? 'READY';
      await save();
    } catch {
      job.status = 'UNKNOWN';
      state.status = 'NEEDS_REVIEW';
      await save();
      throw new Error('External start outcome is unknown. Inspect Apify and this ledger before approving any new collection; never replay this start.');
    }
  }
  state.status = 'STARTED';
  await save();
  return state;
}

export function validateState(state) {
  const plan = validatePlan(state?.plan);
  if (!Array.isArray(state.jobs) || state.jobs.length !== plan.jobs.length) throw new Error('Invalid collection ledger');
  for (const [index, job] of state.jobs.entries()) {
    const original = plan.jobs[index];
    for (const key of Object.keys(original)) {
      if (JSON.stringify(job[key]) !== JSON.stringify(original[key])) throw new Error('Ledger job differs from the approved plan');
    }
    if (job.runId !== null && job.runId !== undefined && !validId(job.runId)) throw new Error('Invalid run ID in ledger');
  }
  return state;
}

export async function loadState(path) { return validateState(JSON.parse(await readFile(path, 'utf8'))); }

export async function readStatus(rawState, api = cliApi) {
  const state = validateState(rawState);
  const jobs = [];
  for (const job of state.jobs) {
    if (!job.runId) { jobs.push({ source: job.source, status: job.status, runId: null }); continue; }
    const run = unwrap(await api('GET', `/v2/actor-runs/${job.runId}`));
    jobs.push({ source: job.source, runId: job.runId, status: run?.status, build: run?.buildNumber, reportedChargeUsd: run?.usageTotalUsd ?? null });
  }
  return { planHash: state.plan.hash, maximumChargeUsd: state.plan.maximumChargeUsd, jobs };
}

function briefTerminal(record) {
  return { outcome: record?.outcome ?? record?.status ?? null, itemsPushed: record?.itemsPushed ?? record?.itemCount ?? record?.savedCount ?? record?.resultCount ?? null, warningsCount: Array.isArray(record?.warnings) ? record.warnings.length : 0 };
}

export async function readResults(rawState, api = cliApi) {
  const state = validateState(rawState);
  const records = [];
  const receipts = [];
  for (const job of state.jobs) {
    const receipt = { source: job.source, runId: job.runId ?? null, actorId: job.actorId, build: job.build, status: job.status ?? 'UNKNOWN', maxChargeUsd: job.maxChargeUsd, itemCount: 0, reportedChargeUsd: null };
    receipts.push(receipt);
    if (!job.runId) continue;
    const run = unwrap(await api('GET', `/v2/actor-runs/${job.runId}`));
    if (run?.actId !== job.actorId || run?.buildNumber !== job.build || (run?.buildId && run.buildId !== job.buildId)) { receipt.status = 'IDENTITY_MISMATCH'; continue; }
    receipt.status = run.status;
    receipt.reportedChargeUsd = typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null;
    if (!terminal.has(run.status)) continue;
    if (run.status !== 'SUCCEEDED') continue;
    if (!validId(run.defaultDatasetId) || !validId(run.defaultKeyValueStoreId)) { receipt.status = 'MISSING_STORAGE_IDS'; continue; }
    let output;
    let summary;
    try {
      output = await api('GET', `/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/OUTPUT`);
      summary = await api('GET', `/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/RUN_SUMMARY`);
    } catch { receipt.status = 'MISSING_TERMINAL_RECORDS'; continue; }
    receipt.output = briefTerminal(output);
    receipt.runSummary = briefTerminal(summary);
    if (!acceptable.has(receipt.output.outcome) || !acceptable.has(receipt.runSummary.outcome)) { receipt.status = 'SEMANTIC_FAILURE'; continue; }
    const pulled = [];
    const maximum = job.input.maxResults;
    let offset = 0;
    let truncated = false;
    while (offset < maximum) {
      const limit = Math.min(100, maximum - offset);
      const page = await api('GET', `/v2/datasets/${run.defaultDatasetId}/items`, { format: 'json', clean: true, offset, limit });
      if (!Array.isArray(page) || page.length > limit) throw new Error('Dataset API returned an invalid or oversized page');
      pulled.push(...page);
      offset += page.length;
      if (page.length < limit) break;
      if (offset === maximum) {
        const next = await api('GET', `/v2/datasets/${run.defaultDatasetId}/items`, { format: 'json', clean: true, offset, limit: 1 });
        truncated = Array.isArray(next) && next.length > 0;
      }
    }
    const readback = unwrap(await api('GET', `/v2/actor-runs/${job.runId}`));
    if (readback?.status !== run.status || readback?.actId !== job.actorId || readback?.buildNumber !== job.build || (readback?.buildId && readback.buildId !== job.buildId)) { receipt.status = 'READBACK_MISMATCH'; continue; }
    receipt.reportedChargeUsd = typeof readback.usageTotalUsd === 'number' ? readback.usageTotalUsd : receipt.reportedChargeUsd;
    const counts = [receipt.output.itemsPushed, receipt.runSummary.itemsPushed];
    if (counts.some(count => !Number.isInteger(count) || count < 0)) { receipt.status = 'MISSING_TERMINAL_COUNTS'; continue; }
    if (counts[0] !== counts[1] || counts.some(count => count > maximum ? !truncated || pulled.length !== maximum : count !== pulled.length)) { receipt.status = 'COUNT_MISMATCH'; continue; }
    receipt.itemCount = pulled.length;
    receipt.status = truncated ? 'TRUNCATED' : receipt.output.outcome === 'PARTIAL' || receipt.runSummary.outcome === 'PARTIAL' ? 'PARTIAL' : pulled.length ? 'COMPLETE' : 'EMPTY';
    receipt.readbackAt = new Date().toISOString();
    records.push(...pulled.map(record => ({ source: job.source, actorId: job.actorId, build: job.build, runId: job.runId, record })));
  }
  return { schemaVersion: 1, planHash: state.plan.hash, fetchedAt: new Date().toISOString(), billingStatus: 'Platform-reported snapshot; later adjustments are possible', records, receipts };
}
