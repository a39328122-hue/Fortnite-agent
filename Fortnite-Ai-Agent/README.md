# Fortnite Ai Agent

A text-only Fortnite-focused AI chat built for Fortnite asset researchers, modders, FModel users, UEFN creators and Verse developers.

**Developed by YT @27lf**

## What is included

- One fixed AI model: `openai/gpt-oss-120b` through Groq
- Editable Fortnite-specific system prompt in `api/chat.js`
- No file uploads
- No image uploads
- No microphone / voice mode
- No calls
- No model selector
- Responsive mobile + desktop UI
- Chat history stored locally in the browser
- New Chat
- Copy button on code/asset-path blocks
- Fortnite asset path shortcut in the sidebar
- Discord button for `@its.swag`
- Groq API key stays server-side and is never exposed in frontend code

## GitHub + Vercel setup

You can upload this entire project to GitHub, but GitHub Pages by itself cannot safely run the private Groq API key.

Recommended setup:

1. Upload this project to a GitHub repository.
2. Import that repository into Vercel.
3. Open Vercel → Project → Settings → Environment Variables.
4. Add:

```text
Name: GROQ_API_KEY
Value: gsk_...your key...
```

5. Apply it to Production, Preview and Development if you want it available in all deployments.
6. Redeploy the project.

Never paste the Groq key into `public/app.js`, `index.html`, or any public GitHub file.

## Local setup

Install dependencies:

```bash
npm install
```

Create `.env.local` in the project root:

```env
GROQ_API_KEY=gsk_your_key_here
```

Then run:

```bash
npx vercel dev
```

## Edit the AI prompt

Open:

```text
api/chat.js
```

Find:

```js
const SYSTEM_PROMPT = `
...
`;
```

Everything inside that block controls Fortnite Ai Agent's behavior and can be edited.

## Fixed model

The model is hard-coded in `api/chat.js`:

```js
const MODEL = "openai/gpt-oss-120b";
```

There is intentionally no model selector in the UI.

## Groq connection

The backend uses Groq's OpenAI-compatible endpoint:

```text
https://api.groq.com/openai/v1
```

The browser never sees your API key. `public/app.js` talks only to your own `/api/chat` backend.

## Fortnite Asset Path button

The sidebar button opens:

```text
https://a39328122-hue.github.io/fortniteTools.web/index.html
```

## Discord button

Discord currently requires a numeric Discord User ID for a reliable direct profile URL. A username such as `@its.swag` is not enough to create a guaranteed direct Discord profile link.

Open:

```text
public/app.js
```

Replace:

```js
const DISCORD_PROFILE_URL = null;
```

with:

```js
const DISCORD_PROFILE_URL = "https://discord.com/users/YOUR_NUMERIC_USER_ID";
```

Until you add the numeric ID, clicking the Discord button copies `@its.swag` instead of sending visitors to a broken URL.

## Main files

```text
Fortnite-Ai-Agent/
├── api/
│   └── chat.js          # Groq model + editable Fortnite system prompt
├── public/
│   ├── index.html       # UI
│   ├── style.css        # Design
│   └── app.js           # Chat history + frontend behavior
├── .env.example
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```
