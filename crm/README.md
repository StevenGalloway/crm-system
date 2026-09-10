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
│   ├── otheritems.html          "One Time BD Action Items" -- BD tasks not tied to a lead
│   ├── recurringtasks.html      Recurring task templates (daily/weekly/monthly/quarterly/annually)
│   ├── contacts.html            Contacts + next outreach date
│   ├── config.html              Client Partners, Contact Owners, notification schedule
│   ├── styles.css               All styling; brand colors as CSS variables
│   ├── app.js / calendar.js / otheritems.js / recurringtasks.js / contacts.js / config.js   Page logic
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
  --resource-group fenway-crm-poc-rg \
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
reject it outright (`InvalidAppSettings`). The pipeline digest's timer
ticks every 15 minutes and computes Central time fresh via `Intl` on every
run (see `api/src/scheduleCore.js`), checking it against whatever schedule
is set on the **Configuration** page (frequency, time of day, and day of
week/month) -- so DST and the schedule itself are both handled in code, no
app setting needed. Defaults to daily at 8am Central until you change it.

### Optional: SLACK_BOT_TOKEN (for per-contact-owner outreach DMs)

Only needed if you're using the Contacts tab's 48-hour outreach reminders
(these are real private Slack DMs, not a channel post, so they need a
different kind of Slack credential than `SLACK_WEBHOOK_URL`):

1. In your Slack app (the one you created in step 3) go to **OAuth &
   Permissions** → **Bot Token Scopes** → add `chat:write` and `im:write`.
2. **Install to Workspace** (or reinstall, if it was already installed
   before you added those scopes).
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`).

```bash
az staticwebapp appsettings set \
  --name fenway-crm-poc \
  --resource-group fenway-crm-poc-rg \
  --setting-names SLACK_BOT_TOKEN="<your-bot-token>"
```

Then add each contact owner's Slack member ID on the Configuration page
(find it via their Slack profile → **More** → **Copy member ID**). Without
this token set, `outreachNotifier` silently does nothing (same "not
configured, skip" pattern as `SLACK_WEBHOOK_URL`) -- it doesn't error.

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

### Test on demand, without waiting for a schedule

Three background jobs run on their own timers -- each has a matching
on-demand HTTP endpoint that runs the exact same logic immediately, so you
can verify each is wired up correctly without waiting:

**Pipeline digest** (normally runs per the Configuration page's schedule):
```bash
curl -X POST https://<your-swa-hostname>/api/notify/test
```
- `{"posted": true, "message": "..."}` -- posted to Slack; `message` is the
  exact text that went out, handy for checking formatting without leaving
  the terminal.
- `{"posted": false, "reason": "..."}` -- nothing sent. The digest is
  gated on **action items specifically**: if there are no lead action items
  due or overdue, it won't post even if calendar events or Other Items are
  pending. Add an action item due today (or in the past) to any lead and
  try again -- or if the reason says `SLACK_WEBHOOK_URL is not set`, that
  app setting is missing (see step 5 above).

**Recurring task generator** (normally runs daily at 11:00 UTC):
```bash
curl -X POST https://<your-swa-hostname>/api/recurring-tasks/test
```
Returns `{"generated": [...]}` -- any recurring task whose anchor date has
arrived gets a new instance pushed onto "One Time BD Action Items"
immediately, instead of waiting for tomorrow's run.

**Outreach DMs** (normally runs daily at 12:30 UTC; needs `SLACK_BOT_TOKEN`
set, see above):
```bash
curl -X POST https://<your-swa-hostname>/api/notify/outreach-test
```
Returns `{"sent": [...], "skipped": [...]}` -- `sent` lists each contact
owner DMed and how many contacts were in it; `skipped` lists owners who had
contacts due but no Slack ID configured (or whose DM failed), with why.

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
4. Move it forward, then backward using the arrow buttons, or drag it between columns. Drag a different lead onto "Lost" (confirms first), then Reopen it.
5. Add an action item with yesterday's date -- confirm it shows an "Overdue" badge on the card and in the Calendar tab.
6. Add a calendar event and a communication; confirm the communication shows as "Last communication" on the card.
7. Archive a lead, then check "Show archived" to confirm it's hidden/shown correctly.
8. Run the Slack digest on demand (see "Test on demand, without waiting for a schedule" under step 5) -- confirm it posts and the message reads correctly.
9. Add an item on "One Time BD Action Items" with yesterday's date, then re-run the digest -- confirm it shows up under ":dart: Due today" AND, separately, under "One Time BD Action Items" marked overdue -- it should NOT show up twice for the same day (today's items only appear in the Due Today section, not duplicated below).
10. On the Configuration page, add a Client Partner, then assign it to a lead via Edit details -- confirm it shows on the card. Remove that partner from the config list and confirm the lead's Client Partner clears.
11. Add a recurring task on "Recurring BD Tasks" with today as the start date, run its test endpoint -- confirm a new item appears on "One Time BD Action Items" with today's date.
12. Add a Contact Owner + their Slack ID on the Configuration page, add a contact due tomorrow on the Contacts tab with that owner, then run the outreach test endpoint -- confirm they get a Slack DM (needs `SLACK_BOT_TOKEN` set).
13. On the Configuration page, add a Sales Artifact tied to a stage -- confirm it shows up as a checklist item (with that stage named next to it) on every lead, and that checking it off persists after closing and reopening the lead.
14. On the Contacts tab, add one contact of each type (Contact, Partnership, Non-Qualified Lead) -- confirm they land in three separately-labeled sections, each sorted by next outreach date.

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
  definitions, brand colors, `clientPartners`, `contactOwners` (name + Slack
  ID), and `notificationSchedule` as data. The frontend fetches it once per
  page load and applies colors as CSS variables -- so "configurable brand
  colors" (and now Client Partners, Contact Owners, and the digest schedule)
  means editing that document via the Configuration page, not editing code
  or redeploying.
- **Three more single-document lists, same pattern, all in the `config`
  container:** `other-items` (One Time BD Action Items), `recurring-tasks`
  (the templates that generate those), and `contacts`. Same read-modify-
  write approach as `app-config`, no new containers needed. Fine at this
  volume; if any of these ever grow into the hundreds, it'd be worth
  splitting into one document per item like leads are.
- **`SLACK_BOT_TOKEN` is an app setting, never config data.** Contact
  owners' Slack *IDs* live in `app-config` (not secret, just an identifier),
  but the bot token that actually authenticates DM sends is an Application
  Setting only -- `GET /api/config` returns the whole `app-config` document
  to the browser, so anything secret can never live in it.
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
- **Hard-delete a lead, a One Time BD Action Item, or a Recurring BD
  Task:** each has a delete button gated behind typing the item's exact
  text (company name, or description) to confirm -- with no login system,
  a one-click permanent delete would be an easy accident. Archiving
  (leads) is still there too, for anything short of "get rid of this
  entirely." Contacts also have a delete button, but with a plain
  confirm() rather than the type-to-confirm ceremony -- lower stakes than
  the others.
- **One Time BD Action Items and Recurring BD Tasks are both editable**
  (description/due date, or description/cadence/start date) via an inline
  Edit button on each row, and both show "Past due" / "Due in 48h" tags
  matching the lead-card badge style -- for a recurring task, the tag
  reflects its *next* computed occurrence, not any single generated
  instance. Completed One Time items roll off the default list 10 days
  after their due date (still there, just hidden -- toggle "Show
  completed" to see them); incomplete ones never auto-hide, no matter how
  overdue.
- **Change Client Partners, Contact Owners, Sales Artifacts, or the
  notification schedule:** all editable from the Configuration page now --
  no more raw API calls or Data Explorer needed for day-to-day changes.
- **Add/rename/reorder stages, change probabilities, or edit the lane
  description shown under each column header:** still needs a direct edit
  to the `app-config` document's `stages` array (Cosmos Data Explorer, or
  `PUT /api/config`) -- there's no stage-editing UI yet. To set the lane
  descriptions to match the ones this POC ships with by default:
  ```bash
  curl -X PUT https://<your-swa-hostname>/api/config \
    -H "Content-Type: application/json" \
    -d '{"stages":[
      {"key":"qualification","label":"Qualification","probability":10,"order":1,"description":"Intro to FG and ICP"},
      {"key":"discovery","label":"Discovery","probability":20,"order":2,"description":"Discovery and Ideation Sessions"},
      {"key":"validation","label":"Validation","probability":50,"order":3,"description":"Playbook Delivered"},
      {"key":"decision_due","label":"Decision Due","probability":75,"order":4,"description":"Pre-proposal Review, MSA, SOW"},
      {"key":"pending_sale","label":"Pending Sale","probability":90,"order":5,"description":"Signature Loop, Dev Team Staging"},
      {"key":"win","label":"Win","probability":100,"order":6,"description":"Schedule Welcome to Fenway Group"},
      {"key":"lost","label":"Lost","probability":0,"order":99,"terminal":true}
    ]}'
  ```
  This replaces the whole `stages` array, so only run it as-is if your live
  stages still match this POC's defaults (key/label/probability/order
  unchanged) -- if you've customized any of those, merge the `description`
  fields into your current array instead of overwriting it.

## Known POC limitations worth knowing about

- **No authentication.** Anyone with the URL can view, add, and modify
  leads. That was explicit in scope, but flagging it: this API has
  `authLevel: 'anonymous'` on every endpoint, and Azure Static Web Apps'
  built-in auth (Easy Auth) is a config-only bolt-on if/when you need it --
  it doesn't require rebuilding anything above.
- **No optimistic concurrency control.** Two people editing the same lead
  (or the same shared config/other-items/contacts document) at the same
  instant can overwrite each other's change (last write wins). Not a real
  risk at POC usage levels; worth a look if this gets busier.
- **Business-day calculations don't account for holidays**, only weekends
  (`api/src/dateUtils.js`). Easy to extend with a holiday list if it matters.
- **Recurring tasks anchored on the 29th-31st drift in short months** (JS
  Date rolls e.g. Feb 31 into Mar 2/3) -- fine for most cadences/anchor
  dates, just avoid anchoring a monthly/quarterly/annual task on those days
  if exact-day-of-month matters. See `api/src/recurringCore.js`.
- **Outreach DMs need one-time Slack app setup** (Bot Token Scopes +
  reinstall) beyond the Incoming Webhook already used for the pipeline
  digest -- see "Optional: SLACK_BOT_TOKEN" under step 5. Without it,
  `outreachNotifier` just no-ops rather than failing loudly.
