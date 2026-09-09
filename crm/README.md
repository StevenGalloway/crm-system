# Fenway Group -- New Business Pipeline (POC)

A lightweight Kanban-style board for tracking leads and opportunities from
Qualification through Win (or Lost), with action items, calendar events,
a communications log, and a daily Slack digest of what's coming due.

**Stack:** Azure Static Web Apps (Free tier) + Azure Functions (Consumption
plan) + Azure Cosmos DB (Free tier) + a Slack Incoming Webhook. No login
system -- anyone with the URL can use it, by design, per the POC scope.

Estimated cost: **$0-2/month** (see the cost breakdown from earlier in this
conversation -- nothing here should generate a real bill at POC-scale usage).

---

## 0. What you're deploying

```
crm-poc/
├── staticwebapp.config.json     Routing config for the Static Web App
├── frontend/                    Static site (no build step -- plain HTML/CSS/JS)
│   ├── index.html               The board
│   ├── calendar.html            Agenda view of upcoming/overdue items
│   ├── styles.css               All styling; brand colors as CSS variables
│   ├── app.js / calendar.js     Page logic
│   ├── api-client.js            Fetch helpers + demo-mode fallback
│   ├── demoData.js              In-memory sample data (used only if /api is unreachable)
│   └── assets/                  Logos (see "Logos" section below)
├── api/                         Azure Functions (Node.js, v4 programming model)
│   └── src/functions/*.js       One file per endpoint
└── infra/
    ├── cosmos-setup.sh          az cli script to provision Cosmos DB
    ├── seed-config.json         Initial stage + brand config document
    └── seed-config.js           Script to load that document into Cosmos
```

**Try it before deploying anything:** open `frontend/index.html` directly in
a browser. It can't reach a real API, so it automatically falls back to
sample data (`demoData.js`) and shows a "Demo mode" banner. Click around --
move leads between stages, add action items, mark things Lost -- it all
works locally. This is just for reviewing the design; nothing you do here
is saved anywhere.

---

## 1. Prerequisites

- An Azure subscription (a payment method is required even to use free tiers, but nothing here should charge it)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed and logged in (`az login`)
- Node.js 20+ and the [Azure Static Web Apps CLI](https://azure.github.io/static-web-apps-cli/) (`npm install -g @azure/static-web-apps-cli`)
- A Slack workspace (free plan is fine)
- Optionally, a GitHub repo if you want CI/CD instead of CLI deploys -- push this whole `crm-poc/` folder to it first

---

## 2. Provision Cosmos DB

```bash
cd crm-poc
bash infra/cosmos-setup.sh
```

Edit the variables at the top of that script first (`COSMOS_ACCOUNT` must be
globally unique). It creates:
- A resource group
- A Cosmos DB account with the **free tier enabled** (1000 RU/s + 25 GB, free
  for the life of the account -- one per subscription)
- A `crm` database
- Two containers: `leads` and `config`, both partitioned on `/id`

Grab your connection values:
```bash
az cosmosdb show --name <your-cosmos-account> --resource-group fenway-crm-poc-rg --query documentEndpoint -o tsv
az cosmosdb keys list --name <your-cosmos-account> --resource-group fenway-crm-poc-rg --query primaryMasterKey -o tsv
```

### Seed the config document
This document holds your stage definitions and brand colors -- see "Making
changes later" below for why it's kept as data instead of hardcoded.

```bash
cd infra
npm init -y && npm install @azure/cosmos
COSMOS_ENDPOINT="<paste endpoint>" COSMOS_KEY="<paste key>" COSMOS_DATABASE="crm" node seed-config.js
```

You should see `Seeded app-config document: app-config`.

---

## 3. Set up the Slack webhook

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → From scratch.
2. Name it (e.g. "Pipeline Digest"), pick your workspace.
3. Under **Incoming Webhooks**, toggle it on, then **Add New Webhook to Workspace** and pick the channel.
4. Copy the webhook URL (`https://hooks.slack.com/services/...`) -- you'll paste it into the Function App settings in step 5.

This is a modern Slack App with the Incoming Webhooks feature, not the
legacy custom-integration flow Slack is deprecating -- it'll keep working.

---

## 4. Deploy the Static Web App + API together

From the `crm/` folder:

```bash
az staticwebapp create \
  --name fenway-crm-poc \
  --resource-group fenway-crm-poc-rg \
  --location centralus \
  --sku Free

swa deploy ./frontend --api-location ./api --deployment-token $(az staticwebapp secrets list --name fenway-crm-poc --resource-group fenway-crm-poc-rg --query "properties.apiKey" -o tsv)
```

(If you linked a GitHub repo when creating the Static Web App instead, Azure
generates a GitHub Actions workflow for you automatically and every push
deploys both `frontend/` and `api/` -- use whichever fits your workflow.)

---

## 5. Configure the Function App's application settings

The API needs these set as Application Settings (Static Web Apps' linked
Function App, found under your Static Web App resource → **Configuration**
in the Azure portal, or via CLI):

```bash
az staticwebapp appsettings set \
  --name fenway-crm-poc \
  --setting-names \
    COSMOS_ENDPOINT="<your-cosmos-endpoint>" \
    COSMOS_KEY="<your-cosmos-key>" \
    COSMOS_DATABASE="crm" \
    SLACK_WEBHOOK_URL="<your-slack-webhook>" \
    NOTIFIER_LOOKAHEAD_DAYS="5" \
    AzureWebJobsFeatureFlags="EnableWorkerIndexing"
```

`AzureWebJobsFeatureFlags=EnableWorkerIndexing` is required for this API's
Node v4 programming model (no `function.json` files) to be recognized at
all -- without it the Functions host finds zero functions and every
`/api/*` route 404s.

Do **not** add `WEBSITE_TIME_ZONE` -- Static Web Apps' managed Functions
reject it outright (`InvalidAppSettings`). The daily Slack post's timer
schedule in `dailyNotifier.js` runs in UTC and already compensates for this
in code: it fires at both UTC hours 8am Central can land on across the DST
change, and checks the actual Chicago-local hour before sending, so it
posts exactly once a day regardless of season.

### Where to find these values again

None of these are "shown once" secrets -- Azure and Slack both let you
pull them up again any time, so there's no need to stash them anywhere
outside of Cosmos/Slack/Azure themselves.

- **Cosmos DB account name** (the `<your-cosmos-account>` used when
  grabbing the endpoint/key in step 2) -- whatever you set `COSMOS_ACCOUNT`
  to in `infra/cosmos-setup.sh` when you provisioned it. If you've
  forgotten it: `az cosmosdb list --resource-group fenway-crm-poc-rg -o table`
- **`COSMOS_ENDPOINT`** --
  `az cosmosdb show --name <your-cosmos-account> --resource-group fenway-crm-poc-rg --query documentEndpoint -o tsv`,
  or Azure Portal → your Cosmos DB account → **Overview** (labeled "URI").
- **`COSMOS_KEY`** --
  `az cosmosdb keys list --name <your-cosmos-account> --resource-group fenway-crm-poc-rg --query primaryMasterKey -o tsv`,
  or Azure Portal → your Cosmos DB account → **Settings → Keys** (also
  where you'd rotate it if it ever leaked -- e.g. got pasted into a commit).
- **`SLACK_WEBHOOK_URL`** -- [api.slack.com/apps](https://api.slack.com/apps)
  → select the app you created in step 3 (e.g. "Pipeline Digest") →
  **Incoming Webhooks**. Every webhook you've created is listed there in
  full, per channel -- that's also where you'd add a new one when swapping
  a test channel for a live one.
- **Whatever is currently live**, without re-deriving anything -- Azure
  will hand back every app setting already applied to this Static Web App,
  Cosmos key included:
  `az staticwebapp appsettings list --name fenway-crm-poc --resource-group fenway-crm-poc-rg`

---

## 6. Logos

Your two logo formats (extracted from the brand guide you shared) are
already placed at:
- `frontend/assets/fenway-logo-full.png` -- icon + wordmark, used in the header on both pages
- `frontend/assets/fenway-logo-icon.png` -- icon only, used as the browser tab favicon

Both are referenced through the config document (`brand.logos.full` /
`brand.logos.icon` in `infra/seed-config.json`), not hardcoded in the HTML --
so swapping in higher-resolution originals later is a matter of replacing
those two files (same filenames) or pointing the config at new filenames,
no code change needed. If you get vector/SVG originals, dropping them in
under those same names works too.

---

## 7. Test end to end

1. Open your Static Web App's URL (e.g. `https://fenway-crm-poc.azurestaticapps.net`).
2. The "Demo mode" banner should be gone -- you're hitting the real API now.
3. Add a lead -- confirm it lands in Qualification only.
4. Move it forward, then backward. Mark a different lead Lost, then Reopen it.
5. Add an action item with yesterday's date -- confirm it shows an "Overdue" badge on the card and in the Calendar tab.
6. Add a calendar event and a communication; confirm the communication shows as "Last communication" on the card.
7. Archive a lead, then check "Show archived" to confirm it's hidden/shown correctly.
8. Fire the Slack digest on demand instead of waiting for its 8am schedule: `curl -X POST https://<your-swa-hostname>/api/notify/test`. It runs the exact same query-and-post logic as the scheduled job and returns `{"posted": false, "reason": "..."}` if there's nothing overdue/upcoming to send -- add an action item due today first if you want to force a real Slack post.

---

## Data model, in short

Cosmos DB free tier's cap (1000 RU/s + 25 GB) is nowhere close to being
tested at this scale, so the model favors simplicity over cleverness:

- **One document per lead** in the `leads` container, partitioned on its own
  `id`. Action items, calendar events, and communications are embedded
  arrays inside that document, not separate documents -- so reading a lead's
  full activity is one point-read, and moving a lead between stages never
  means moving it between partitions (partition keys are immutable in
  Cosmos DB, so this was worth getting right from the start).
- **One document (`app-config`)** in the `config` container holds the stage
  definitions and brand colors as data. The frontend fetches it once per
  page load and applies colors as CSS variables -- so "configurable brand
  colors" means editing that document, not editing CSS or redeploying.
- **Communications are a full history, not a single field.** The UI surfaces
  the most recent entry as "Last communication" and lets you expand the
  rest, so nothing is overwritten when a new one is logged.
- **Stage transitions are logged with timestamps** in each lead's
  `stageHistory` array as they happen -- this isn't used by the UI yet
  beyond a simple list in the lead detail view, but it's what you'd build
  "days in stage" / pipeline velocity reporting on top of later, and it's
  the kind of thing that's cheap to capture now and impossible to
  reconstruct retroactively.

## Making changes later

- **Add/rename/reorder stages, change probabilities, or change brand
  colors:** edit the `app-config` document directly in Cosmos DB's Data
  Explorer (Azure Portal), or `PUT /api/config` with a partial update. No
  redeploy needed either way.
- **Change the Slack digest window:** update `NOTIFIER_LOOKAHEAD_DAYS` in
  the Function App's settings (also read by the Calendar page's subhead).
- **Hard-delete a lead:** exposed via the "Delete lead" button in the lead
  detail modal, gated behind typing the lead's exact company name to
  confirm -- with no login system, a one-click permanent delete would be an
  easy accident. Archiving (reversible) is still there too, for anything
  short of "get rid of this entirely."

## Known POC limitations worth knowing about

- **No authentication.** Anyone with the URL can view, add, and modify
  leads. That was explicit in scope, but flagging it: this API has
  `authLevel: 'anonymous'` on every endpoint, and Azure Static Web Apps'
  built-in auth (Easy Auth) is a config-only bolt-on if/when you need it --
  it doesn't require rebuilding anything above.
- **No optimistic concurrency control.** Two people editing the same lead
  at the same instant can overwrite each other's change (last write wins).
  Not a real risk at POC usage levels; worth a look if this gets busier.
- **Business-day calculations don't account for holidays**, only weekends
  (`api/src/dateUtils.js`). Easy to extend with a holiday list if it matters.
- **No config-editing UI.** Stage/brand changes go through Cosmos DB Data
  Explorer or a raw API call for now, not a settings screen in the app.
