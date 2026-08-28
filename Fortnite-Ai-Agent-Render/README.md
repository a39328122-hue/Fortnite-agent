# Fortnite Ai Agent — Render + Groq

Text-only Fortnite AI assistant developed by YT @27lf.

## Features
- One fixed model: `openai/gpt-oss-120b` through Groq.
- Editable Fortnite-focused system prompt in `server.js`.
- No file upload, image upload, voice, microphone, or calls.
- Local chat history in the browser.
- Fortnite asset path shortcut.
- Groq API key stays server-side.

## Deploy on Render
1. Push this project to your GitHub repository.
2. In Render choose **New + → Web Service**.
3. Connect GitHub and select the repository.
4. Render should detect the included `render.yaml`, or use:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add an Environment Variable:
   - Key: `GROQ_API_KEY`
   - Value: your Groq key beginning with `gsk_`
6. Deploy.

Do not place the real API key in GitHub or in `public/app.js`.

## Change the AI behavior
Edit `SYSTEM_PROMPT` near the top of `server.js`, commit the change, and Render can redeploy automatically from GitHub.
