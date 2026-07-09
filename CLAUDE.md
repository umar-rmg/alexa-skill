# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The runtime endpoint for the **"Algo One" Alexa custom skill** — one Vercel serverless function
that turns voice commands into grocery shopping-list items. The Alexa **interaction model**
(invocation name, intents, slots) lives in a separate repo, `../algo-1-shopping-list-skill`; this
repo is only the webhook Alexa calls at runtime.

## Commands

No build/lint/test scripts exist (`package.json` has `dependencies` only). It's a Vercel Function:
- `npm install` — install deps.
- `vercel dev` — run locally; the skill is served at `POST /api/alexa`.
- Deploy is zero-config (`api/alexa.js` is the function); there is no test suite. To exercise it,
  POST an Alexa request envelope (JSON) as the body to `/api/alexa`.

## Architecture

`api/alexa.js` is the entry (`module.exports = async (req, res)`). Per request it builds an
`ask-sdk-core` skill, calls `skill.invoke(req.body)`, and returns the JSON. Handlers: `LaunchRequest`,
`Add_item_intent` (the only custom intent — a multi-value `item` slot), the standard `AMAZON.*`
intents, and an `IntentReflector` catch-all.

**Auth is Alexa account-linking (OAuth), and tokens are NOT minted here.** Each request carries
`context.System.user.accessToken`. `services/db.js` `getUserByAlexaAccessToken` sha256-hashes it and
looks it up in `alexa_oauth_tokens` (type `access`, not revoked/expired) → `app_users`; with no
linked user, handlers reply `.withLinkAccountCard()`. Those tokens are issued by **`algo1-webhook`**
(`alexa_oauth_service`) — this repo only reads them, so **both repos must point at the same Supabase
project or linking silently fails.**

**Add-item flow:** `Add_item_intent` → `storeItems()` → `services/categorize.js` (OpenAI
`gpt-4o-mini` sorts each item into one of 6 fixed categories, default `produce`) → insert into
`shopping_list_items` (`source: 'alexa'`) → fire-and-forget `POST {ALGO1_WEBHOOK_URL}/notifications/
items-added` so the webhook can fan out to other channels (e.g. WhatsApp).

## Data & integration

- **Supabase (service-role client):** the shared **`list-app`** project. Reads `alexa_oauth_tokens`
  + `app_users`, writes `shopping_list_items`. Schema is owned by `../list-apps/database` — don't
  alter it here.
- `getOrCreateUser` (by phone) inserts `app_users` with only `phone_number`, relying on the
  `public_id` DB default — the project needs it (list-app migration `0012`) or the insert fails.
- **Env:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `ALGO1_WEBHOOK_URL`.
- **Known state:** `.env` still points at the *old* Supabase project — repoint it (and the Vercel
  env) to `list-app` to match the apps + webhook. `twilio` is a dependency but currently unused.
