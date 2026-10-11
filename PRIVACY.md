# Privacy and data handling

Effective date: 2026-10-11. Publisher: Khadin Akbar Ventures LLC.

Buyer Intent Lead Finder is a local skills-only workflow. The publisher does not operate a new data collection server for this plugin. The contained helper has no telemetry, analytics, advertising, or automatic third-party export.

## Data used

Only a product brief and JSON records explicitly selected for the lead-discovery task are read. A brief may include product/category keywords, competitor names, search text, desired sources, recency, exclusions, record limits, and a spending cap. Public-source results may include post text, public pseudonyms or professional names, source links, original posting dates, and evidence of a stated need. Reports also record heuristic scores, review flags, and selected run receipts.

The plugin does not search unrelated files, conversation histories, memory, contacts, authentication files, or credential stores. It does not add private emails or phone numbers, infer sensitive personal traits, or attempt to identify anonymous people.

## Recipients and authentication

Offline planning, demonstration, and analysis do not send data to a remote service. When the user approves live collection, the separately installed official Apify CLI sends the selected queries and Actor inputs to [Apify](https://apify.com/privacy). Existing owner-managed Actors retrieve public-source results through their managed providers. Documented providers include [ScrapeCreators](https://scrapecreators.com/) and [SociaVault](https://sociavault.com/); current provider details belong to the Actor documentation and can change independently.

The official CLI manages its own authentication. The helper never reads credential values or stores them in plans, receipts, reports, or source. `doctor --live` reads only the authenticated username into its output. If the user supplies report contents to Claude, the processing and retention of that conversation are governed by their Claude account settings and Anthropic's applicable policies.

## Retention and deletion

Local files stay in the folder chosen by the user. New outputs have private file permissions and never overwrite existing files automatically. The user controls access, storage, copying, and deletion of these files. Cloud runs and datasets remain in the user's Apify account and follow its retention settings and Apify's policies; the plugin does not silently delete or expire them. The user manages cloud deletion in Apify.

Do not put actual lead records, private run identifiers, credentials, or customer data into public repository issues. Share a redacted or synthetic reproduction instead. Support is provided through the repository's [issue tracker](https://github.com/khadinakbarlabs/buyer-intent-lead-finder/issues).

This product is intended for adult professional research. It is not designed for collecting data about children or for targeting people based on health, personal debt, political/religious identity, or other sensitive personal circumstances.
