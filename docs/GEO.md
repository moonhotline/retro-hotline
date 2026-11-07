# Search and GEO maintenance

Reviewed: 2026-11-08 (Asia/Shanghai).

The goal is accurate discovery of Retro Hotline by people, search engines and assistants. Structured facts and clear sources are useful; indexing, traffic and AI citations are not guaranteed.

## Repository content

- Use **Retro Hotline** consistently; explain **NEON BAY** and **Bay Bridge Shooter** as aliases.
- Link directly to https://retro.oodai.space/.
- Keep a concise English and Chinese description, controls and answer-first FAQ in README.
- Keep [FACTS.md](FACTS.md) tied to source evidence. Separate current implementation, live observations and plans.
- Give images descriptive alt text and a visible concept-art caption.
- Keep [llms.txt](../llms.txt) short and link to substantive text. It is an optional discovery aid, not an indexing requirement.
- Do not invent rankings, reviews, awards, user counts or performance figures.

## Website integration patch

Website changes are supplied separately on a branch based on `feat/game-evolution`, because `main` does not yet contain the application. Repository documentation updates do not themselves update the production website.

The patch provides:

- `frontend/index.html`: title, description, canonical URL, Open Graph, Twitter card, JSON-LD and a useful no-JavaScript fallback.
- `frontend/public/about.html`: a static, visible English/Chinese description, controls and FAQ available without executing the game.
- `frontend/public/media/retro-hotline-cover.jpg`: social preview artwork.
- `frontend/public/robots.txt`, `sitemap.xml`, `llms.txt`: discovery files copied by Vite.
- A visible menu link to the about page.

The VideoGame structured data describes the current game. It does not claim reviews, offers, awards or a release date. The concept image is described as artwork, not a screenshot. The about page contains the same factual descriptions as the metadata.

## Release verification

After integrating and deploying the website patch:

1. Confirm the homepage and `/about.html` return HTTP 200 and contain the correct text in raw HTML.
2. Confirm their canonical URLs use `https://retro.oodai.space/`, with `/about.html` canonicalized to itself.
3. Check the actual Content-Type and contents of `/robots.txt`, `/sitemap.xml` and `/llms.txt`; a fallback HTML page is not a valid result.
4. Confirm the social image returns an image and Open Graph/Twitter metadata reference it.
5. Validate JSON-LD syntax and ensure its claims match the visible page.
6. Check hosting headers and crawler access for accidental `noindex` or access blocks.
7. Where the owner has access, inspect the URLs and sitemap in Search Console and monitor genuine search impressions and referral visits.

Preview environments may intentionally be non-indexable. Production indexing depends on the deployed response and crawler access, not this repository alone.

## Official references

Google says its normal SEO fundamentals apply to AI Overviews and AI Mode; no additional AI file or special schema is required. Important content should be available as text, and structured data should agree with visible content.

- [Google Search: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google Search: structured data introduction](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Schema.org: VideoGame](https://schema.org/VideoGame)
- [llms.txt proposal](https://llmstxt.org/)

Keep future feature changes synchronized across README, FACTS.md, the about page, structured data and llms.txt. Remove source-branch setup instructions when the game source lands on main.
