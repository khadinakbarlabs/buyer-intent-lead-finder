# CLI and recovery guide

Run the contained `scripts/cli.mjs` with Node.js 22+. Live commands invoke the official `apify api` CLI, tested with Apify CLI 1.8.0. The local machine needs its own official CLI installation and login. The plugin does not install it or acquire authentication. If login is missing, the user performs `apify login` directly; do not ask them to paste credentials into Claude or run commands that print the token.

## Commands

Use the same contained helper path for each operation. File arguments are user-selected paths, and all writes fail if the output exists.

| Operation | Arguments | External effect |
| --- | --- | --- |
| `doctor` | optional `--live` | Local inspection; `--live` reads authenticated username |
| `catalog` | optional `--live` | Local catalog; `--live` reads owned Actor metadata |
| `demo` | `--out DIRECTORY` | Local synthetic CSV/JSON/report |
| `plan` | `--brief FILE --out FILE` | Local bounded plan; no collection |
| `start` | `--plan FILE --state FILE --approve HASH` | Paid Actor runs; exact human approval required |
| `status` | `--state FILE` | Read known run statuses |
| `results` | `--state FILE --out FILE` | Read terminal data and sanitize receipts |
| `analyze` | `--brief FILE --input FILE --out DIRECTORY` | Local CSV/JSON/report |

Raw-array analysis also needs `--source reddit`, `--source linkedin`, or `--source x`. `--now ISO` is for an explicitly historical analysis or reproducible test; normally use current time. An exported corpus is a JSON object with `records` containing `{source, runId, record}` wrappers and optional sanitized receipts.

The CLI returns concise JSON and a nonzero exit on a blocked operation. The report output folder must be new. Choose a different path when one already exists. Plans and ledgers are small JSON files; do not store them in the installed plugin directory. The runtime accepts input JSON files up to 5 MiB and at most 10,000 analysis records.

## Recovery

- **Missing CLI or login:** offline demo and analysis still work. The user installs the official CLI through its official distribution and authenticates directly. Rerun doctor; do not read CLI authentication files.
- **Paid start unknown:** the ledger keeps STARTING/UNKNOWN and any returned run ID. Inspect Apify for the source query at the recorded start time. Do not issue another start. If Apify confirms the exact run, the user or assistant may insert that known ID into the corresponding ledger job; leave its approved source, input, cap, and build unchanged. `status`/`results` validate the ledger and remote build. Never invent a run ID or remove an unresolved ledger to retry.
- **Some jobs were never started:** inspect the known runs first. A separate new plan for the missing searches needs new scope/cap approval. The helper intentionally does not auto-resume paid starts.
- **Still running:** status only; a helper timeout does not stop the remote job. Remote jobs retain their approved timeout/cap. Abort a known run in Apify if the user asks; this plugin has no abort command.
- **Failed, missing terminal data, mismatch:** preserve the receipt and inspect the specific run. Never silently label it empty or automatically change providers. A newly approved corrected run uses a new plan and state file.
- **Partial or truncated results:** deliver the observed rows with that status. Deeper collection needs a new approved plan. Returned `usageTotalUsd` is a platform snapshot and may receive later adjustments.

Requests use subprocess argument arrays, no shell evaluation, only bounded Apify endpoint paths, and no helper-level retry. `apify api` 1.8.0 uses one fetch per request. Do not replace this with `apify call` or a synchronous client that retries a chargeable start. No input URL is fetched by the helper.
