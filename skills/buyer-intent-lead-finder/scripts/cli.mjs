import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTORS, VERSION, createPlan, rankRecords, toCsv, toReport } from './domain.mjs';
import { cliApi, doctor, startCollection, loadState, readStatus, readResults } from './collection.mjs';

const help = `Buyer Intent Lead Finder ${VERSION}
Node 22+; live operations require the official Apify CLI 1.8.0+ and its user-managed login.

  doctor [--live]                         Check local prerequisites or authenticated account
  catalog [--live]                        Show owned Actors; optionally refresh public metadata
  demo --out DIRECTORY                   Produce synthetic, offline example outputs
  plan --brief FILE --out FILE            Create a bounded plan and display its approval hash
  start --plan FILE --state FILE --approve HASH
                                         Start the exactly approved plan once (paid operation)
  status --state FILE                     Inspect known runs without starting new ones
  results --state FILE --out FILE         Retrieve checked results and sanitized run receipts
  analyze --brief FILE --input FILE --out DIRECTORY [--source reddit|linkedin|x] [--now ISO]
                                         Rank local records and export JSON, CSV and Markdown

Files are private and never overwritten automatically. No command sends messages or schedules runs.
`;

function flags(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!/^--[a-z-]+$/.test(key) || Object.hasOwn(result, key)) throw new Error('Use unique named flags; see --help');
    if (key === '--live') result[key] = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`);
      result[key] = value;
    }
  }
  return result;
}

const requireFlag = (options, key) => {
  if (typeof options[key] !== 'string' || !options[key]) throw new Error(`Missing ${key}; see --help`);
  return options[key];
};

async function json(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 5 * 1024 * 1024) throw new Error('Input must be a JSON file under 5 MiB');
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('Input is not valid JSON'); }
}

async function writeNew(path, text) {
  const full = resolve(path);
  await mkdir(dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, text, { flag: 'wx', mode: 0o600 });
  return full;
}

async function exportResult(result, path) {
  const out = resolve(path);
  await mkdir(out, { mode: 0o700 });
  const prefix = result.demo ? '# Synthetic demo — no live collection\n\n' : '';
  const paths = {};
  paths.json = await writeNew(join(out, 'leads.json'), JSON.stringify(result, null, 2) + '\n');
  paths.csv = await writeNew(join(out, 'leads.csv'), toCsv(result));
  paths.report = await writeNew(join(out, 'report.md'), prefix + toReport(result));
  return { status: result.status, demo: Boolean(result.demo), leads: result.leads.length, excluded: result.excluded.length, duplicates: result.duplicates, files: paths };
}

async function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === 'help') { process.stdout.write(help); return; }
  const options = flags(args);
  const allowed = { doctor: ['--live'], catalog: ['--live'], demo: ['--out'], plan: ['--brief', '--out'], start: ['--plan', '--state', '--approve'], status: ['--state'], results: ['--state', '--out'], analyze: ['--brief', '--input', '--out', '--source', '--now'] };
  if (!Object.hasOwn(allowed, command) || Object.keys(options).some(flag => !allowed[command].includes(flag))) throw new Error('Unknown command or flag; see --help');
  let result;
  if (command === 'doctor') result = await doctor(Boolean(options['--live']));
  if (command === 'catalog') {
    result = { verifiedAt: '2026-10-11', actors: [] };
    for (const [source, actor] of Object.entries(ACTORS)) {
      const item = { source, ...actor, actorUrl: `https://apify.com/${actor.name}`, runtimeCanary: 'Not run for this plugin' };
      if (options['--live']) {
        const response = await cliApi('GET', `/v2/acts/${actor.actorId}`);
        const a = response?.data;
        if (a?.id !== actor.actorId || a?.username !== 'khadinakbar' || !a?.isPublic) throw new Error('Actor publisher or availability changed; review the catalog');
        item.currentBuild = a.taggedBuilds?.latest?.buildNumber ?? null;
        item.pinnedBuildIsCurrent = item.currentBuild === actor.build;
        const active = a.pricingInfos?.filter(p => !p.startedAt || new Date(p.startedAt).getTime() <= Date.now()).at(-1);
        item.currentPricingModel = active?.pricingModel ?? null;
        item.currentEventPrices = Object.fromEntries(Object.entries(active?.pricingPerEvent?.actorChargeEvents ?? {}).map(([key, value]) => [key, value.eventPriceUsd]));
      }
      result.actors.push(item);
    }
  }
  if (command === 'plan') {
    const plan = createPlan(await json(requireFlag(options, '--brief')));
    const path = await writeNew(requireFlag(options, '--out'), JSON.stringify(plan, null, 2) + '\n');
    result = { status: 'AWAITING_APPROVAL', planPath: path, approvalHash: plan.hash, maximumChargeUsd: plan.maximumChargeUsd, jobs: plan.jobs.map(j => ({ source: j.source, actor: j.actorName, build: j.build, query: j.query, maxResults: j.input.maxResults, capUsd: j.maxChargeUsd })), nextAction: 'Show this exact plan and cap to the user; start only after they explicitly approve this collection.' };
  }
  if (command === 'start') {
    const state = await startCollection(await json(requireFlag(options, '--plan')), resolve(requireFlag(options, '--state')), requireFlag(options, '--approve'));
    result = { status: state.status, planHash: state.plan.hash, jobs: state.jobs.map(j => ({ source: j.source, runId: j.runId, status: j.status })) };
  }
  if (command === 'status') result = await readStatus(await loadState(requireFlag(options, '--state')));
  if (command === 'results') {
    const corpus = await readResults(await loadState(requireFlag(options, '--state')));
    const path = await writeNew(requireFlag(options, '--out'), JSON.stringify(corpus, null, 2) + '\n');
    result = { records: corpus.records.length, receipts: corpus.receipts, corpusPath: path };
  }
  if (command === 'analyze') {
    const ranked = rankRecords(await json(requireFlag(options, '--input')), await json(requireFlag(options, '--brief')), { source: options['--source'], ...(options['--now'] ? { now: options['--now'] } : {}) });
    result = await exportResult(ranked, requireFlag(options, '--out'));
  }
  if (command === 'demo') {
    const example = await json(fileURLToPath(new URL('../examples/synthetic-demo.json', import.meta.url)));
    const ranked = rankRecords(example.records, example.brief, { source: 'reddit', now: example.referenceDate });
    result = await exportResult({ ...ranked, demo: true }, requireFlag(options, '--out'));
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (Number(process.versions.node.split('.')[0]) < 22) {
  process.stderr.write('Node.js 22 or newer is required.\n');
  process.exitCode = 1;
} else {
  main(process.argv.slice(2)).catch(error => {
    const message = error.code === 'EEXIST' ? 'Output already exists; choose a new path to preserve earlier work.' : error.code === 'ENOENT' ? 'Input file or parent folder is missing; check the supplied path.' : error.message;
    process.stderr.write(JSON.stringify({ status: 'BLOCKED', message }) + '\n');
    process.exitCode = 1;
  });
}
