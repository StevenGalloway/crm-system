const { leadsContainer, configContainer } = require('./cosmosClient');
const { addBusinessDays } = require('./dateUtils');

const LOOKAHEAD_DAYS = Number(process.env.NOTIFIER_LOOKAHEAD_DAYS) || 5;
const OTHER_ITEMS_DOC_ID = 'other-items';
// Items with neither a Client Partner nor a lead/contact owner (chiefly the
// company-less One Time BD Action Items) fall into this group so they still
// render somewhere instead of being silently dropped from the digest.
const GENERAL_GROUP = 'General';

async function fetchOtherItems() {
  try {
    const { resource } = await configContainer.item(OTHER_ITEMS_DOC_ID, OTHER_ITEMS_DOC_ID).read();
    return (resource && resource.items) || [];
  } catch {
    return [];
  }
}

function formatEventWhen(eventDate) {
  return new Date(eventDate).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Normalizes an action item, calendar event, or one-time item into a common
// shape so the three can be bucketed by due date and grouped by Client
// Partner/Owner + company uniformly, instead of staying siloed by type.
function normalizeActionItem(a) {
  return { group: a.clientPartner || a.leadOwner || GENERAL_GROUP, companyName: a.companyName, description: a.description, dateStr: a.dueDate.slice(0, 10), sortDate: a.dueDate, showsOwnDate: false };
}
function normalizeEvent(e) {
  return { group: e.clientPartner || e.leadOwner || GENERAL_GROUP, companyName: e.companyName, description: `${e.title} (${formatEventWhen(e.eventDate)})`, dateStr: e.eventDate.slice(0, 10), sortDate: e.eventDate, showsOwnDate: true };
}
function normalizeOtherItem(o) {
  return { group: GENERAL_GROUP, companyName: null, description: o.description, dateStr: o.dueDate.slice(0, 10), sortDate: o.dueDate, showsOwnDate: false };
}

// Renders one due-date bucket (Past Due / Due Today / Upcoming): grouped by
// Client Partner (or Owner, or "General" if neither), then by company, each
// group sorted alphabetically and its items sorted by due date ascending.
// showDueDate suppresses the redundant "(due today)" on the Due Today
// bucket while still showing it for Past Due and Upcoming.
function renderBucket(items, showDueDate) {
  const byKey = {};
  items.forEach((i) => {
    const key = `${i.group}::${i.companyName || ''}`;
    (byKey[key] = byKey[key] || { group: i.group, companyName: i.companyName, items: [] }).items.push(i);
  });
  const groups = Object.values(byKey).sort((a, b) => {
    const byGroup = a.group.localeCompare(b.group);
    return byGroup !== 0 ? byGroup : (a.companyName || '').localeCompare(b.companyName || '');
  });

  const lines = [];
  groups.forEach((g) => {
    lines.push(`*${g.companyName ? `${g.group} - ${g.companyName}` : g.group}*`);
    [...g.items]
      .sort((a, b) => a.sortDate.localeCompare(b.sortDate))
      .forEach((i) => lines.push(`- ${i.description}${showDueDate && !i.showsOwnDate ? ` (due ${i.dateStr})` : ''}`));
  });
  return lines.join('\n');
}

/**
 * Builds the pipeline digest from current lead + other-item data and posts
 * it to Slack. Shared by the scheduled dailyNotifier timer and the
 * on-demand test endpoint so both exercise the exact same query +
 * formatting + webhook call, instead of testing a re-implementation of it.
 */
async function runDigest(context) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return { posted: false, reason: 'SLACK_WEBHOOK_URL is not set' };
  }

  const now = new Date();
  const cutoff = addBusinessDays(now, LOOKAHEAD_DAYS);
  const nowIso = now.toISOString();
  const cutoffIso = cutoff.toISOString();
  const todayDateStr = nowIso.slice(0, 10);
  const cutoffDateStr = cutoffIso.slice(0, 10);

  const actionQuery = {
    query: `SELECT c.companyName, c.clientPartner, c.leadOwner, ai.description, ai.dueDate
            FROM c JOIN ai IN c.actionItems
            WHERE ai.completed = false AND ai.dueDate <= @cutoff AND c.archived = false`,
    parameters: [{ name: '@cutoff', value: cutoffDateStr }],
  };
  const eventQuery = {
    query: `SELECT c.companyName, c.clientPartner, c.leadOwner, ev.title, ev.eventDate
            FROM c JOIN ev IN c.calendarEvents
            WHERE ev.eventDate >= @now AND ev.eventDate <= @cutoff AND c.archived = false`,
    parameters: [
      { name: '@now', value: nowIso },
      { name: '@cutoff', value: cutoffIso },
    ],
  };

  const [actionResult, eventResult, allOtherItems] = await Promise.all([
    leadsContainer.items.query(actionQuery).fetchAll(),
    leadsContainer.items.query(eventQuery).fetchAll(),
    fetchOtherItems(),
  ]);

  const actionItems = actionResult.resources;
  const events = eventResult.resources;
  const otherItems = allOtherItems.filter((i) => !i.completed && i.dueDate <= cutoffDateStr);

  // Gated on action items specifically -- calendar events and other items
  // alone don't trigger a post, even if either has entries due.
  if (actionItems.length === 0) {
    return { posted: false, reason: 'No action items due -- nothing to post' };
  }

  // Bucketed by due date first (Past Due, Due Today, Upcoming), not by item
  // type -- a company's action items, calendar events, and one-time items
  // all land in the same bucket and group once their due date qualifies.
  const items = [
    ...actionItems.map(normalizeActionItem),
    ...events.map(normalizeEvent),
    ...otherItems.map(normalizeOtherItem),
  ];
  const pastDue = items.filter((i) => i.dateStr < todayDateStr);
  const dueToday = items.filter((i) => i.dateStr === todayDateStr);
  const upcoming = items.filter((i) => i.dateStr > todayDateStr);

  const sections = [];
  if (pastDue.length) sections.push([':red_circle: *Past Due:*', renderBucket(pastDue, true)].join('\n'));
  if (dueToday.length) sections.push([':dart: *Due today:*', renderBucket(dueToday, false)].join('\n'));
  if (upcoming.length) sections.push([`:calendar: *Upcoming Action Items - Next ${LOOKAHEAD_DAYS} Business Days:*`, renderBucket(upcoming, true)].join('\n'));

  const message = sections.join('\n\n');
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook returned ${res.status}`);
  }

  return { posted: true, message };
}

module.exports = { runDigest };
