# WCC Relay Server — Vercel Deploy

## Deploy steps (Mac)

1. Go to vercel.com — sign up free with GitHub or email
2. Click "Add New Project" → "Deploy from existing files"
   OR use Vercel CLI:
   - Open Terminal
   - Run: npm i -g vercel
   - cd into this folder
   - Run: vercel
   - Follow the prompts (all defaults are fine)

3. After deploy, go to your project dashboard on vercel.com
4. Click Settings → Environment Variables
5. Add:
   Name:  OPENAI_API_KEY
   Value: your sk-... key
   Environment: Production + Preview + Development
6. Click Save, then go to Deployments → Redeploy

7. Your relay URL will be:
   https://your-project-name.vercel.app/api/transcribe

8. Copy that URL into popup.js line 4 where it says:
   const RELAY_URL = 'https://your-relay.vercel.app/api/transcribe';

## Test the relay is working

Open Terminal and run:
curl -X POST https://your-project-name.vercel.app/api/transcribe

You should get: {"error":"..."} or {"text":""} — either means the server is up.
