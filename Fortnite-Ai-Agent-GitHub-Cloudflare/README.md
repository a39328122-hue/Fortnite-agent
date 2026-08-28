# Fortnite Ai Agent — GitHub Pages + Cloudflare Worker

Text-only Fortnite AI chat developed by YT @27lf.

## Architecture
- GitHub Pages hosts `index.html`, `style.css`, `app.js`, and `config.js`.
- Cloudflare Worker hosts the private backend and system prompt.
- Groq API key is stored only as a Cloudflare Worker secret.

## Important
Never put your `GROQ_API_KEY` in GitHub, `config.js`, `app.js`, or any browser file.

## Files
- `index.html` — website
- `style.css` — UI
- `app.js` — chat UI/local history
- `config.js` — public Worker URL only (safe to publish)
- `cloudflare-worker/worker.js` — backend + editable system prompt

## Setup order
1. Deploy `cloudflare-worker/worker.js` as a Cloudflare Worker.
2. Add Worker secret named `GROQ_API_KEY`.
3. Copy the Worker URL.
4. Paste that URL into `config.js`.
5. Commit the site files to GitHub.
6. Enable GitHub Pages from the repository root.
