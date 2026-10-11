# Release verification — 1.0.0

Checked on 2026-10-11. This record describes observed release checks, not a guarantee of ongoing source availability or complete buyer coverage.

## Local checks

- 25 offline behavior tests passed, with no failures.
- The plugin and marketplace manifests passed native Claude strict validation.
- Source/archive preflight checked contained resources, public metadata, file sizes, credential patterns, unsafe local paths, and unexpected install/runtime surfaces.
- The packaged synthetic demo produced three ranked conversations, removed one duplicate, excluded three unsuitable posts, and exported CSV, JSON, and Markdown. Its posts are fictional.

## Live backend check

The owner-approved release check used one “CRM recommendations” search on each source, a 30-day window, and at most two records per source. Each run used a 120-second timeout, no platform restart, and a $0.033333 maximum charge; combined caps were $0.099999.

| Source | Exact build | Dataset rows | OUTPUT / RUN_SUMMARY | Terminal readback |
| --- | --- | --- | --- | --- |
| Reddit | 1.0.5 | 2 | COMPLETE; both counts 2 | Passed |
| LinkedIn | 1.0.11 | 2 | COMPLETE; both counts 2 | Passed |
| X | 1.1.4 | 2 | COMPLETE; both counts 2 | Passed |

The helper confirmed the expected Actor/build identity before reading data. Analysis of the six collected records produced two ranked conversations and four exclusions; all three export formats were generated. These are research candidates, not verified buyers.

The testing account's reported usage snapshot totaled approximately $0.00142. Owner-account usage is not a customer price quote. Published event prices, customer status, and later platform billing adjustments can produce different charges. Refresh metadata and review each plan before spending.

Private receipts and actual post records are intentionally excluded from this public source. This small test does not measure recall, uptime, downstream customer conversion, or performance at scale. No real Claude model invocation of the installed skill was evaluated in this check. Portal validation, Anthropic automated security review, reviewer approval, and live directory availability are separate states.
