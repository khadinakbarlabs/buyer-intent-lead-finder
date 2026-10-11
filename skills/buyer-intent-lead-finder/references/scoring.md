# Buyer intent scoring

The score is a deterministic research priority from 0 to 100, not a model confidence or buying probability. Review the original conversation and actual product fit before treating it as a prospect.

| Component | Maximum | Basis |
| --- | ---: | --- |
| Intent | 60 | Highest matched signal: purchase/evaluation 45, competitor alternative 40, recommendation request 35, active search 30, pain point 25; add 5 for stated budget/pricing and 10 for timing language, capped at 60 |
| Keyword fit | 25 | At least one supplied product/category/competitor keyword matches at word boundaries; this is not verified ICP fit |
| Freshness | 15 | Posted within 7 days: 15; within 14: 10; older within chosen window: 5; unknown date: 0 |

High is 75+, Medium 60–74, and Review below 60. Every retained row requires an allowed public post URL, keyword match, and supported intent phrase. Promotional phrases, completed/negated needs, sensitive personal circumstances, explicitly excluded keywords, NSFW posts, unrecognized account rows, out-of-window dates, and invalid source URLs are excluded. Unknown dates remain flagged; scrape times are never substituted.

The quote is taken verbatim from source title/body text and provides evidence for the signal. Heuristics can miss sarcasm, negation scope, multilingual intent, or promotion without obvious phrases. The initial rubric handles English language phrases. Claude must inspect the best results, exclude false positives, and explain uncertainty. Locale terms and customer attributes supplied in search queries are not independently verified.

Canonical URLs remove Reddit tracking, host variations, and changing title slugs, and normalize X/Twitter hosts. This deduplicates conversations, not people or companies. Repeated posts by one person can remain separate; merge them manually only with public evidence. CSV exports escape formula-leading cells; the report escapes source text. No emails, telephone numbers, or inferred demographic traits are added.
