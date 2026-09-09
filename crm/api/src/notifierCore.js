const { leadsContainer } = require('./cosmosClient');
const { addBusinessDays } = require('./dateUtils');

const LOOKAHEAD_DAYS = Number(process.env.NOTIFIER_LOOKAHEAD_DAYS) || 5;

/**
 * Builds the pipeline digest from current lead data and posts it to Slack.
 * Shared by the scheduled dailyNotifier timer and the on-demand test
 * endpoint so both exercise the exact same query + formatting + webhook
 * call, instead of testing a re-implementation of it.
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
    query: `SELECT c.companyName, ai.description, ai.dueDate
            FROM c JOIN ai IN c.actionItems
            WHERE ai.completed = false AND ai.dueDate <= @cutoff AND c.archived = false`,
    parameters: [{ name: '@cutoff', value: cutoffDateStr }],
  };
  const eventQuery = {
    query: `SELECT c.companyName, ev.title, ev.eventDate
            FROM c JOIN ev IN c.calendarEvents
            WHERE ev.eventDate >= @now AND ev.eventDate <= @cutoff AND c.archived = false`,
    parameters: [
      { name: '@now', value: nowIso },
      { name: '@cutoff', value: cutoffIso },
    ],
  };

  let actionItems = [];
  let events = [];
  const [actionResult, eventResult] = await Promise.all([
    leadsContainer.items.query(actionQuery).fetchAll(),
    leadsContainer.items.query(eventQuery).fetchAll(),
  ]);
  actionItems = actionResult.resources;
  events = eventResult.resources;

  const overdue = actionItems.filter((a) => a.dueDate.slice(0, 10) < todayDateStr);
  const upcoming = actionItems.filter((a) => a.dueDate.slice(0, 10) >= todayDateStr);

  if (overdue.length === 0 && upcoming.length === 0 && events.length === 0) {
    return { posted: false, reason: 'Nothing overdue or upcoming -- nothing to post' };
  }

  const lines = [`*Pipeline digest -- next ${LOOKAHEAD_DAYS} business days*`];

  if (overdue.length) {
    lines.push('', '*Overdue:*');
    overdue.forEach((a) =>
      lines.push(`- :red_circle: ${a.companyName} -- ${a.description} (was due ${a.dueDate.slice(0, 10)})`)
    );
  }
  if (upcoming.length) {
    lines.push('', '*Action items due:*');
    upcoming.forEach((a) =>
      lines.push(`- ${a.companyName} -- ${a.description} (due ${a.dueDate.slice(0, 10)})`)
    );
  }
  if (events.length) {
    lines.push('', '*Calendar events:*');
    events.forEach((e) => {
      const when = new Date(e.eventDate).toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      lines.push(`- ${e.companyName} -- ${e.title} (${when})`);
    });
  }

  const message = lines.join('\n');
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
