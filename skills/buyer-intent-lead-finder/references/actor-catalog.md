# Owned Actor catalog

Publisher: `khadinakbar`. Verified through public Apify metadata and exact build OpenAPI schemas on 2026-10-11. These are existing owner-managed backends; the plugin makes no Actor source, pricing, permission, or publication changes.

| Source | Actor | Pinned build | Coverage |
| --- | --- | --- | --- |
| Reddit | [Reddit Search Scraper](https://apify.com/khadinakbar/reddit-search-scraper) | 1.0.5 | Public keyword results, optional subreddit, newest sort and creation cutoff |
| LinkedIn | [LinkedIn Post Search Scraper](https://apify.com/khadinakbar/linkedin-post-search-scraper) | 1.0.11 | Google-indexed public post search; recent posts may be missing |
| X | [X Twitter Search Scraper](https://apify.com/khadinakbar/x-twitter-search-scraper) | 1.1.4 | Public Latest post results using query text and a since operator |

Reddit and X result events were $0.003 each; LinkedIn post events were $0.005 each. All three also reported a $0.00005 startup event, with a one-event minimum at the pinned default memory. These prices are a dated snapshot. The platform cap is sent as `maxTotalChargeUsd`; plan record limits account for the snapshot startup/result prices. Refresh `catalog --live` and review Apify's current prices before collection. Result counts, match quality, and completeness are not guaranteed.

The official Apify CLI sends selected Actor input and authorization to Apify. Actor-managed providers observed in source documentation include ScrapeCreators and SociaVault. LinkedIn's current public search route uses ScrapeCreators/Google-indexed pages. Backend providers may change independently; review the Actor documentation when a recipient disclosure matters. The plugin does not request the owner's provider secrets or use them locally.

Live Actor execution for this new plugin has not been canary-tested during the initial local build. Public availability/schema verification and offline mocked integration tests are separate from successful live runs. A release should retain that distinction until a capped canary has verified terminal data, real rows, semantic outcome, charge, and later readback.
