const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');
const { addBusinessDays } = require('../dateUtils');

const LOOKAHEAD_DAYS = Number(process.env.NOTIFIER_LOOKAHEAD_DAYS) || 5;

app.timer('dailyNotifier', {
  // 13:00 UTC. Azure Function timer schedules run in UTC unless the
  // WEBSITE_TIME_ZONE app setting is set -- see README for setting this to
  // Central Time so this reliably fires at 8am local instead of 8am UTC.
  schedule: '0 0 13 * * 1-5',
  handler: async (myTimer, context) => {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      context.warn('SLACK_WEBHOOK_URL is not set -- skipping notification.');
      return;
    }

    const now = new Date();
    const cutoff = addBusinessDays(now, LOOKAHEAD_DAYS);
    const nowIso = now.toISOString();
    const cutoffIso = cutoff.toISOString();
    // Action items carry a date (not a time); a task due today isn't
    // "overdue" until tomorrow.
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
    try {
      const [actionResult, eventResult] = await Promise.all([
        leadsContainer.items.query(actionQuery).fetchAll(),
        leadsContainer.items.query(eventQuery).fetchAll(),
      ]);
      actionItems = actionResult.resources;
      events = eventResult.resources;
    } catch (err) {
      context.error('dailyNotifier query failed', err);
      return;
    }

    const overdue = actionItems.filter((a) => a.dueDate.slice(0, 10) < todayDateStr);
    const upcoming = actionItems.filter((a) => a.dueDate.slice(0, 10) >= todayDateStr);

    if (overdue.length === 0 && upcoming.length === 0 && events.length === 0) {
      context.log('Nothing overdue or upcoming -- skipping Slack post.');
      return;
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

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lines.join('\n') }),
      });
      if (!res.ok) {
        context.error(`Slack webhook returned ${res.status}`);
      }
    } catch (err) {
      context.error('Failed to post to Slack', err);
    }
  },
});
