# Architecture Decisions

This is a companion to the [README](README.md)'s setup instructions: the
handful of decisions in this app that involved a real tradeoff, why they
were made, and what they cost. Written for a reviewer skimming for
engineering judgment, not just working code.

---

## 1. Scheduling on a platform with no Timer trigger

**Context.** The pipeline digest, outreach reminders, and recurring task
generator all need to run on a schedule. Azure Static Web Apps' "Managed
Functions" hosting -- the tier this app targets -- only supports
HTTP-triggered functions; Timer, Queue, and Blob triggers aren't a
supported configuration. An in-process timer, the obvious first choice,
wasn't available at all.

**Decision.** Each scheduled job became a plain HTTP endpoint
(`POST /api/notify/tick`, `/api/notify/outreach-test`,
`/api/recurring-tasks/test`), and a GitHub Actions workflow
(`.github/workflows/scheduled-jobs.yml`) plays the role of the external
scheduler, hitting all three on a `*/15 * * * *` cron.

**Tradeoff.** GitHub's scheduled workflows are explicitly best-effort --
they can be delayed arbitrarily under load, and in practice this app has
seen gaps of several hours between ticks rather than the configured 15
minutes. A naive exact-time-match gate (`shouldSendNow`) would silently
skip an entire day whenever a tick landed outside its 15-minute window --
which is exactly what happened once in production. The fix
(`api/src/scheduleCore.js`) turns the gate into a bounded catch-up window:
fire on the first check at or after the scheduled time, up to
`CATCH_UP_WINDOW_MINUTES` (3 hours) late, then give up for that period.
Wider would risk a send late enough to look unrelated to its schedule (as
happened once, coinciding with an unrelated deploy); narrower reintroduces
the original silent-miss risk. Idempotency (`lastSentPeriodKey` for the
digest, `outreachNotifiedFor` per contact) makes it safe to over-call every
endpoint on every tick regardless.

## 2. A client-side fallback that mirrors the real API, not a mock of it

**Context.** The app needs to be reviewable without provisioning Cosmos DB
or deploying an API -- opening the HTML directly should still work.

**Decision.** `demoData.js` implements the same operations as the Azure
Functions (`createLead`, `updateContact`, `convertContactToLead`, etc.)
against an in-memory store, and `api-client.js` transparently routes every
`apiGet`/`apiPost`/`apiPatch`/`apiDelete` call to either the real
`/api/*` endpoint or this local implementation, decided once via a single
probe request. A `Proxy` around the demo implementation persists to
`localStorage` after every call, so state survives navigation between
pages the same way Cosmos DB would.

**Tradeoff.** This duplicates business logic (there are effectively two
implementations of "convert a contact to a lead") instead of one API the
frontend always calls. That's a real maintenance cost -- a change to one
needs the same change made to the other, with nothing enforcing it stays
in sync besides discipline. Accepted because the payoff (a reviewer can
open `index.html` with no setup and see a fully working app) outweighs it
at this app's size, and the two implementations are small enough that
drift is easy to catch by inspection.

## 3. Two Slack credential types, two independent failure domains

**Context.** The pipeline digest posts to a channel; per-contact outreach
reminders are personal DMs. Slack requires different credential types for
each -- an Incoming Webhook URL for the former, a bot token with
`chat:write`/`im:write` scopes for the latter.

**Decision.** Each notifier checks for its own credential
(`SLACK_WEBHOOK_URL`, `SLACK_BOT_TOKEN`) independently and returns a
structured "not configured" result rather than throwing when it's absent.

**Tradeoff.** Neither notification path can accidentally take the other
down, and either can be set up (or left unset) independently during
incremental rollout. The cost is that a missing credential fails
*silently* rather than loudly -- discovered in practice when outreach DMs
turned out to have never been configured at all, with no error anywhere to
surface it. The Configuration page's manual "Send notifications now"
buttons (added after that gap) exist specifically to make that failure
mode self-diagnosing on demand instead of waiting for a scheduled miss.

## 4. No framework, no bundler, one file per page

**Context.** Each page (Board, Calendar, Contacts, NQLs & Partnerships,
Configuration, ...) is a static HTML file plus a matching plain JS file,
sharing small hand-rolled helpers (`api-client.js`) -- no React/Vue, no
build step.

**Decision.** Keep it that way rather than introducing a framework or
bundler.

**Tradeoff.** There's real duplication as a result -- `contacts.js` and
`nqls.js` share the majority of their filtering/rendering logic with no
shared module system to de-duplicate through, and the nav bar's markup is
copy-pasted identically across all seven pages. Traded deliberately for
zero build tooling: any file can be edited and refreshed with no compile
step, and the whole app deploys as static files. Worth revisiting if the
page count or shared-logic surface grows much further -- the duplication
cost scales with both.

## 5. No authentication, by explicit scope

**Context.** Every API endpoint runs with `authLevel: 'anonymous'`.

**Decision.** Ship without auth for this phase rather than build it in
from the start.

**Tradeoff.** Anyone with the URL can read and modify all data. Acceptable
for the current usage level (documented explicitly in the README rather
than left implicit), with Azure Static Web Apps' built-in auth (Easy Auth)
identified as a config-only addition when it's needed -- deliberately not
designed around from day one, since that would have added complexity this
phase didn't need.
