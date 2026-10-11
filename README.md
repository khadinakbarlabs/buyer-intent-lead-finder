# Buyer Intent Lead Finder

![Buyer Intent Lead Finder](assets/icon.svg)

**Find public conversations that signal a need for what you sell.**

Buyer Intent Lead Finder helps founders, agencies, and sales teams discover recommendation requests, competitor alternatives, product evaluations, and other buying signals on Reddit, LinkedIn, and X. Turn relevant posts into an evidence-linked lead shortlist instead of a list of keyword mentions.

This is a skills-only plugin for Claude, with a contained command-line helper. Live collection targets **Claude Code**, using Khadin Akbar's existing Apify Actors through the separately installed official Apify CLI. Local planning, synthetic examples, and analysis of explicitly supplied exports need no Apify account or new search spend. All reply drafts stay ready for your review.

## What you get

- Focused search plans with named sources, pinned Actor builds, record limits, and a spending cap.
- Recommendation requests, alternative searches, and purchase/evaluation signals separated from promotions, completed requests, unrelated posts, and stale results.
- Ranked conversations with source URLs, supporting quotes, original posting dates, score components, and review flags.
- Deduplicated CSV and JSON lead lists plus a readable Markdown report.
- Private local run receipts and recovery of known runs without repeating a paid start.
- Helpful reply drafts that use the actual conversation and your offer.

An intent score is a research priority, not proof that the author is a qualified buyer. Keyword fit does not verify company size, role, buying authority, or identity. The initial scoring phrases are English. Review the strongest candidates against your product and ideal customer.

## Example prompts

> Find recent Reddit posts asking for CRM recommendations for small sales teams. Show me the query plan and spending cap before collecting anything.

> Find conversations comparing alternatives to our competitor on LinkedIn and X. Explain each buying signal and provide the original source link.

> Rank this supplied social-post export for my invoicing app. Remove promotions and stale requests, then export a CSV and a short report without starting any searches.

> Resume this saved collection, inspect its results, and draft helpful replies to the best three opportunities for my review.

## Install and try

Once the repository is published, add its marketplace and install:

```text
/plugin marketplace add khadinakbarlabs/buyer-intent-lead-finder
/plugin install buyer-intent-lead-finder@khadin-buyer-intent
```

For a source checkout, load it for one Claude Code session:

```bash
claude --plugin-dir .
```

Then use a natural lead-discovery request or `/buyer-intent-lead-finder:buyer-intent-lead-finder`.

The contained helper requires Node.js 22+. Run these from the plugin root:

```bash
node skills/buyer-intent-lead-finder/scripts/cli.mjs doctor
node skills/buyer-intent-lead-finder/scripts/cli.mjs demo --out ./demo-output
```

The demo uses seven clearly synthetic posts and a fixed reference date. It produces three ranked conversations, removes one duplicate, and excludes three unsuitable posts. Its source URLs are illustrative and do not establish that those posts exist.

Live commands require the **official Apify CLI 1.8.0+**, already installed on your machine, and your own Apify account. The user authenticates directly with the official CLI. The plugin does not install or upgrade tools, read auth files, print tokens, or ask for credentials in chat. The currently validated local host is macOS with Node 22 and Apify CLI 1.8.0; other host execution has not been tested.

## Run a search

Create a product brief in your chosen working folder:

```json
{
  "product": "A CRM for small sales teams",
  "keywords": ["CRM"],
  "sources": ["reddit"],
  "queries": ["CRM recommendations"],
  "budgetUsd": 0.10,
  "maxResults": 10,
  "days": 30
}
```

Create the plan:

```bash
node skills/buyer-intent-lead-finder/scripts/cli.mjs plan --brief ./brief.json --out ./search-plan.json
```

Review its queries, exact builds, maximum charge, and approval hash. **A plan proposes spending; it does not approve it.** After you explicitly approve that search, Claude can start it using the contained helper's `start` command with the displayed hash and a new state file. See the [CLI guide](skills/buyer-intent-lead-finder/references/cli-guide.md) for status, results, analysis, and recovery.

Each job is capped with Apify's `maxTotalChargeUsd`, a 120-second runtime, and no platform restart. The sum of job caps never exceeds the plan cap. Plans expire after 24 hours. A local ledger is reserved before any chargeable start; a timeout or unknown response is preserved for inspection and never retried automatically.

To analyze a supplied raw Reddit export locally:

```bash
node skills/buyer-intent-lead-finder/scripts/cli.mjs analyze --brief ./brief.json --input ./posts.json --source reddit --out ./lead-report
```

Use a fresh output folder. Existing outputs are preserved. Only user-selected JSON files are read; no unrelated project files or conversation histories are searched.

## Sources, charges, and coverage

The backends are the owner's [Reddit Search Scraper](https://apify.com/khadinakbar/reddit-search-scraper), [LinkedIn Post Search Scraper](https://apify.com/khadinakbar/linkedin-post-search-scraper), and [X Twitter Search Scraper](https://apify.com/khadinakbar/x-twitter-search-scraper). See the [versioned Actor catalog](skills/buyer-intent-lead-finder/references/actor-catalog.md).

Live searches use your Apify account and incur Actor usage charges. Current prices can change. `catalog --live` refreshes metadata before a collection decision. Low-volume or empty searches can still incur startup charges. LinkedIn covers Google-indexed public posts, so new or unindexed posts can be absent. Query filters and result counts do not guarantee completeness or relevant leads.

The helper checks exact Actor/build identity, terminal run status, OUTPUT and RUN_SUMMARY, bounded dataset pages, and a second terminal readback before exporting collected rows. Missing records, failed sources, partial results, truncation, and genuine empty searches remain distinct. Reported charges are the platform's snapshot; later adjustments are possible.

## Data and execution disclosure

One skill and three readable JavaScript helper files run on demand. There is no MCP server, hook, bundled subagent, downloaded package, background scheduler, or telemetry. Node's standard library is the only helper dependency. No program runs on installation.

Live operations invoke the separately installed official Apify CLI with subprocess argument arrays. Selected queries and Actor inputs are sent through it to Apify; the Actors may use their managed upstream public-data providers, including ScrapeCreators and SociaVault. See [privacy](PRIVACY.md) and the Actor documentation. Ordinary chat does not gain access to the CLI on your computer. Planning remains available there; local analysis requires an execution environment.

Reports can contain public post text and pseudonyms. They are stored in your chosen folder with restrictive file permissions. Apify stores cloud runs/results under your account's retention settings. The plugin has no outreach sender, private-contact enrichment, CRM upload, private-source access, or active monitor.

## Validation and support

From the source checkout, run `node --test tests/*.test.mjs` for offline tests and `claude plugin validate .claude-plugin/plugin.json --strict` for native manifest validation. Tests and development tools are not included in the install archive. The initial release verification passed 25 offline tests and one bounded live search on each of the three pinned Actor builds. See the [release verification record](skills/buyer-intent-lead-finder/references/release-verification.md) for evidence and limits. Anthropic security approval and directory publication remain separate.

See [support](SUPPORT.md), [security](SECURITY.md), [privacy](PRIVACY.md), and [terms](TERMS.md). Licensed under MIT. This plugin is developed by Khadin Akbar Ventures LLC and is not affiliated with Anthropic, Reddit, LinkedIn, X, or Apify.
