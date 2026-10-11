import { createHash } from 'node:crypto';

export const VERSION = '1.0.0';
export const ACTORS = Object.freeze({
  reddit: Object.freeze({ actorId: 'j1gQL2JlzmGKxrPzJ', name: 'khadinakbar/reddit-search-scraper', build: '1.0.5', buildId: 'kDtqTaEphsfHAwdfH', pricePerResult: 0.003, memory: 1024 }),
  linkedin: Object.freeze({ actorId: 'yMNWUCINasvKFmMED', name: 'khadinakbar/linkedin-post-search-scraper', build: '1.0.11', buildId: 'aAGw0s76JbqJnDzJ7', pricePerResult: 0.005, memory: 512 }),
  x: Object.freeze({ actorId: '6xhgv9qnX0z36Btrv', name: 'khadinakbar/x-twitter-search-scraper', build: '1.1.4', buildId: 'pZ39e8acQKkBii6H5', pricePerResult: 0.003, memory: 512 }),
});

const safeText = value => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim() : '';
const clean = (value, name, max = 160) => {
  const text = safeText(value);
  if (!text || text.length > max) throw new Error(`${name} must contain 1–${max} characters`);
  return text;
};
const integer = (value, name, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
};
const list = (value, name, limit) => {
  if (!Array.isArray(value) || !value.length || value.length > limit) throw new Error(`${name} must contain 1–${limit} entries`);
  return [...new Set(value.map(v => clean(v, name, 80)))];
};
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

export function validateBrief(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Brief must be a JSON object');
  const product = clean(raw.product, 'product', 120);
  const keywords = list(raw.keywords, 'keywords', 10);
  const sources = raw.sources === undefined ? ['reddit'] : list(raw.sources, 'sources', 3);
  if (sources.some(source => !Object.hasOwn(ACTORS, source))) throw new Error('Sources must be reddit, linkedin, or x');
  const budgetUsd = raw.budgetUsd ?? 0.3;
  if (typeof budgetUsd !== 'number' || !Number.isFinite(budgetUsd) || budgetUsd < 0.01 || budgetUsd > 10) throw new Error('budgetUsd must be between 0.01 and 10');
  const maxResults = integer(raw.maxResults ?? 10, 'maxResults', 1, 100);
  const days = integer(raw.days ?? 30, 'days', 1, 90);
  const competitors = raw.competitors === undefined || (Array.isArray(raw.competitors) && !raw.competitors.length) ? [] : list(raw.competitors, 'competitors', 5);
  const excludeKeywords = raw.excludeKeywords === undefined || (Array.isArray(raw.excludeKeywords) && !raw.excludeKeywords.length) ? [] : list(raw.excludeKeywords, 'excludeKeywords', 20);
  const queries = raw.queries === undefined ? [`${keywords[0]} recommendations`, `looking for ${keywords[0]}`, competitors.length ? `alternative to ${competitors[0]}` : `best ${keywords[0]} for small business`] : list(raw.queries, 'queries', 4);
  const withinSubreddit = raw.withinSubreddit === undefined || raw.withinSubreddit === '' ? '' : clean(raw.withinSubreddit, 'withinSubreddit', 40).replace(/^r\//, '');
  if (withinSubreddit && !/^[a-zA-Z0-9_]{2,40}$/.test(withinSubreddit)) throw new Error('withinSubreddit must be a subreddit name');
  return { product, keywords, sources, budgetUsd, maxResults, days, competitors, excludeKeywords, queries, withinSubreddit };
}

export function createPlan(raw, now = new Date().toISOString()) {
  const brief = validateBrief(raw);
  const time = new Date(now);
  if (!Number.isFinite(time.getTime())) throw new Error('Plan date is invalid');
  const cap = Math.floor(brief.budgetUsd * 1e6 / (brief.queries.length * brief.sources.length)) / 1e6;
  const jobs = brief.sources.flatMap(source => brief.queries.map((query, index) => {
    const actor = ACTORS[source];
    const maxResults = Math.min(brief.maxResults, Math.floor((cap - 0.00005) / actor.pricePerResult));
    if (maxResults < 1) throw new Error('Budget is too small for one result per search; reduce queries or sources');
    const cutoff = new Date(time.getTime() - brief.days * 86400000).toISOString();
    const input = source === 'reddit'
      ? { searchQuery: query, maxResults, sortBy: 'new', timeFilter: brief.days <= 1 ? 'day' : brief.days <= 7 ? 'week' : brief.days <= 30 ? 'month' : 'year', postDateLimit: cutoff, includeNsfw: false, ...(brief.withinSubreddit ? { withinSubreddit: brief.withinSubreddit } : {}) }
      : source === 'linkedin'
        ? { query, maxResults, datePosted: brief.days <= 1 ? 'last-day' : brief.days <= 7 ? 'last-week' : brief.days <= 30 ? 'last-month' : 'last-year', maxProviderPages: 2, includeComments: false, outputMode: 'compact' }
        : { queries: [`${query} since:${cutoff.slice(0, 10)}`], searchType: 'Latest', maxResults, maxPagesPerQuery: 2, includeRaw: false, dedupeResults: true };
    return { id: `${source}-${index + 1}`, source, actorId: actor.actorId, actorName: actor.name, build: actor.build, buildId: actor.buildId, query, maxChargeUsd: cap, timeout: 120, memory: actor.memory, input };
  }));
  const plan = { schemaVersion: 1, pluginVersion: VERSION, createdAt: time.toISOString(), brief, jobs, maximumChargeUsd: Number((cap * jobs.length).toFixed(6)), approvalRequired: true };
  return { ...plan, hash: digest(plan) };
}

export function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('Plan must be an object');
  const canonical = createPlan(plan.brief, plan.createdAt);
  if (JSON.stringify(stable(plan)) !== JSON.stringify(stable(canonical))) throw new Error('Plan hash or job configuration does not match canonical plan; regenerate and approve it');
  return canonical;
}

export function sourceUrl(raw, source) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (source === 'reddit' && /^(?:www\.|old\.|new\.|m\.)?reddit\.com$/.test(host)) {
      const match = url.pathname.match(/^\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9]+)(?:\/|$)/);
      return match ? `https://www.reddit.com/r/${match[1].toLowerCase()}/comments/${match[2].toLowerCase()}/` : null;
    }
    if (source === 'linkedin' && /^(?:www\.)?linkedin\.com$/.test(host)) {
      const path = decodeURIComponent(url.pathname);
      if (/^\/(?:posts\/[\p{L}\p{N}_-]+|feed\/update\/urn:li:(?:activity|share|ugcPost):\d+)\/?$/u.test(path)) return `https://www.linkedin.com${url.pathname.replace(/\/+$/, '')}/`;
    }
    if (source === 'x' && /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/.test(host)) {
      const match = url.pathname.match(/^\/([a-zA-Z0-9_]+)\/status\/(\d+)(?:\/|$)/);
      return match ? `https://x.com/${match[1].toLowerCase()}/status/${match[2]}` : null;
    }
  } catch { return null; }
  return null;
}

function postingDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalize(record, source, runId, index) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const url = sourceUrl(record.postUrl ?? record.tweetUrl ?? record.url ?? record.permalink, source);
  if (!url || record.isNsfw === true || record.recordType === 'user') return null;
  const title = safeText(record.title).slice(0, 1000);
  const text = safeText(record.body ?? record.description ?? record.text ?? record.full_text).slice(0, 12000);
  const author = safeText(record.authorUsername ?? record.authorName ?? (typeof record.author === 'string' ? record.author : record.author?.username ?? record.author?.name)).slice(0, 200) || null;
  const createdAt = postingDate(record.createdAt ?? record.publishedAt ?? record.postedAt ?? record.created_at ?? record.created_utc);
  return { source, sourceUrl: url, title, text, author, createdAt, runId: runId ?? null, originalIndex: index };
}

const SIGNALS = [
  ['recommendation_request', 35, /\b(?:recommendations?\b|(?:can|could) (?:anyone|someone|you) recommend\b|what (?:is|are|would be) the best\b|which .{0,45} should (?:i|we) (?:buy|use|choose)\b)/i],
  ['active_search', 30, /\b(?:looking for|in search of|we need|i need|our (?:team|company|sales team) needs)\b/i],
  ['competitor_alternative', 40, /\b(?:alternative(?:s)? to|switch(?:ing)? (?:from|to)|replace (?:our|my)|moving (?:away )?from)\b/i],
  ['purchase_request', 45, /\b(?:ready to buy|want to buy|need to purchase|evaluating|comparing|request for proposal|rfp)\b/i],
  ['pain_point', 25, /\b(?:struggling with|frustrated with|tired of|too expensive|doesn.t work|not working)\b/i],
];
const PROMOTION = /\b(?:try our|our (?:new )?(?:product|tool|app|platform)|sign up|free trial|book a demo|affiliate link|sponsored|use my code)\b/i;
const NEGATED = /\b(?:not looking for|do(?:n.t| not) need|no longer (?:need|looking)|already (?:found|bought|purchased)|not interested in)\b/i;
const SENSITIVE = /\b(?:medical diagnosis|my (?:illness|diagnosis|debt)|personal debt|sexual orientation|religious beliefs|mental health crisis)\b/i;
const contains = (text, phrase) => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(text);
};

export function rankRecords(input, rawBrief, { source, now = new Date().toISOString() } = {}) {
  const brief = validateBrief(rawBrief);
  const time = new Date(now).getTime();
  if (!Number.isFinite(time)) throw new Error('Analysis date is invalid');
  const rows = Array.isArray(input) ? input.map(record => ({ record, source })) : input?.records;
  if (!Array.isArray(rows) || rows.length > 10000) throw new Error('Input must be an array or records envelope with at most 10000 rows');
  const excluded = [];
  const candidates = new Map();
  let duplicates = 0;
  for (const [index, row] of rows.entries()) {
    const platform = row?.source;
    if (!Object.hasOwn(ACTORS, platform ?? '')) throw new Error('Raw imports require a known --source; envelopes require source per row');
    const item = normalize(row.record, platform, row.runId, index);
    const drop = reason => excluded.push({ originalIndex: index, source: platform, reason });
    if (!item) { drop('Missing safe public post URL or unsupported record'); continue; }
    const text = [item.title, item.text].filter(Boolean).join('\n');
    if (PROMOTION.test(text) || NEGATED.test(text) || SENSITIVE.test(text)) { drop('Promotional, negated, completed, or sensitive personal circumstance'); continue; }
    if (brief.excludeKeywords.some(k => contains(text, k))) { drop('Matches excluded keyword'); continue; }
    const matches = [...brief.keywords, ...brief.competitors].filter(k => contains(text, k));
    if (!matches.length) { drop('No supplied product-fit keyword'); continue; }
    const ageDays = item.createdAt === null ? null : (time - new Date(item.createdAt).getTime()) / 86400000;
    if (ageDays !== null && (ageDays < -1 || ageDays > brief.days)) { drop('Posting date outside selected window'); continue; }
    const evidence = SIGNALS.flatMap(([signal, weight, pattern]) => {
      const match = pattern.exec(text);
      if (!match) return [];
      const start = Math.max(0, text.lastIndexOf('\n', match.index) + 1);
      return [{ signal, weight, quote: text.slice(start, Math.min(text.length, start + 400)) }];
    });
    if (!evidence.length) { drop('Product mention without a supported intent signal'); continue; }
    const intent = Math.min(60, Math.max(...evidence.map(e => e.weight)) + (/(?:\bbudget\b|\bpricing\b|\$\s*\d+)/i.test(text) ? 5 : 0) + (/\b(?:this week|today|urgent|asap|this month)\b/i.test(text) ? 10 : 0));
    const fit = 25;
    const freshness = ageDays === null ? 0 : ageDays <= 7 ? 15 : ageDays <= 14 ? 10 : 5;
    const score = intent + fit + freshness;
    const lead = { ...item, score, priority: score >= 75 ? 'High' : score >= 60 ? 'Medium' : 'Review', breakdown: { intent, fit, freshness }, matchedKeywords: [...new Set(matches)], evidence: evidence.map(({ signal, quote }) => ({ signal, quote })), warnings: [ageDays === null ? 'Posting date unavailable' : null, item.author === '[deleted]' || item.author === null ? 'Author identity unavailable' : null].filter(Boolean) };
    if (candidates.has(item.sourceUrl)) {
      duplicates++;
      if (score > candidates.get(item.sourceUrl).score) candidates.set(item.sourceUrl, lead);
    } else candidates.set(item.sourceUrl, lead);
  }
  const leads = [...candidates.values()].sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));
  const receipts = Array.isArray(input?.receipts) ? input.receipts : [];
  const incomplete = receipts.some(receipt => !['COMPLETE', 'EMPTY'].includes(receipt?.status));
  const status = incomplete ? leads.length ? 'PARTIAL' : 'NEEDS_REVIEW' : leads.length ? 'COMPLETE' : 'EMPTY';
  return { schemaVersion: 1, pluginVersion: VERSION, product: brief.product, analyzedAt: new Date(time).toISOString(), status, meaning: 'Research priority; intent and identity require human review. Scores are heuristic, not buying probabilities.', totalRecords: rows.length, duplicates, excluded, leads, receipts };
}

export function toCsv(result) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const columns = ['priority', 'score', 'source', 'author', 'source_url', 'created_at', 'intent_signals', 'evidence', 'matched_keywords', 'warnings', 'run_id'];
  const rows = result.leads.map(l => [l.priority, l.score, l.source, l.author, l.sourceUrl, l.createdAt, l.evidence.map(e => e.signal).join('; '), l.evidence.map(e => e.quote).join('\n'), l.matchedKeywords.join('; '), l.warnings.join('; '), l.runId]);
  return [columns, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

const md = value => String(value ?? '').replace(/[<>]/g, '').replace(/[\\`*_[\]|]/g, '\\$&').replace(/\r?\n/g, ' ');
export function toReport(result) {
  const lines = [`# Buyer Intent Lead Finder — ${md(result.product)}`, '', `Research priority report · ${result.analyzedAt}`, '', `${result.leads.length} conversations from ${result.totalRecords} records; ${result.duplicates} duplicates; ${result.excluded.length} excluded.`, '', result.meaning, ''];
  if (result.receipts.length) lines.push(`Collection status: ${result.status}`, '', ...(['PARTIAL', 'NEEDS_REVIEW'].includes(result.status) ? ['Some collection jobs are incomplete or need review. Available rows do not establish complete source coverage.', ''] : []));
  for (const [index, lead] of result.leads.entries()) {
    lines.push(`## ${index + 1}. ${md(lead.title || lead.text.slice(0, 100))}`, '', `**${lead.priority} · ${lead.score}/100** | ${lead.source} | ${md(lead.author || 'Unknown author')}`, '', `[Read source post](${lead.sourceUrl}) · Posted: ${lead.createdAt || 'unknown'}`, '', `Score: intent ${lead.breakdown.intent}/60, keyword fit ${lead.breakdown.fit}/25, freshness ${lead.breakdown.freshness}/15.`, '', ...lead.evidence.map(e => `- ${e.signal}: “${md(e.quote)}”`), '', ...(lead.warnings.length ? [`Review flags: ${lead.warnings.map(md).join('; ')}`, ''] : []));
  }
  if (!result.leads.length) lines.push('No supported buyer-intent conversations met this brief. Review the exclusions or revise the query plan; no prospects were invented.', '');
  if (result.receipts.length) lines.push('## Collection receipts', '', ...result.receipts.map(r => `- ${md(r.source)}: ${md(r.status)}; ${r.itemCount ?? 0} rows; reported charge ${r.reportedChargeUsd ?? 'unavailable'} USD.`), '', 'Charges are the platform-reported snapshot; inspect Apify for later adjustments.', '');
  return lines.join('\n');
}
