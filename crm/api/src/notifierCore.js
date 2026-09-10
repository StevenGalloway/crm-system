const { leadsContainer, configContainer } = require('./cosmosClient');
const { addBusinessDays } = require('./dateUtils');

const LOOKAHEAD_DAYS = Number(process.env.NOTIFIER_LOOKAHEAD_DAYS) || 5;
const OTHER_ITEMS_DOC_ID = 'other-items';
const CONFIG_DOC_ID = 'app-config';

async function fetchOtherItems() {
  try {
    const { resource } = await configContainer.item(OTHER_ITEMS_DOC_ID, OTHER_ITEMS_DOC_ID).read();
    return (resource && resource.items) || [];
  } catch {
    return [];
  }
}

async function fetchStages() {
  try {
    const { resource } = await configContainer.item(CONFIG_DOC_ID, CONFIG_DOC_ID).read();
    return (resource && resource.stages) || [];
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

  const activeLeadsQuery = {
    query: `SELECT c.companyName, c.stage, c.dealValue
            FROM c WHERE c.archived = false AND c.stage != 'win' AND c.stage != 'lost'`,
  };

  const [actionResult, eventResult, allOtherItems, stages, activeLeadsResult] = await Promise.all([
    leadsContainer.items.query(actionQuery).fetchAll(),
    leadsContainer.items.query(eventQuery).fetchAll(),
    fetchOtherItems(),
    fetchStages(),
    leadsContainer.items.query(activeLeadsQuery).fetchAll(),
  ]);

  const actionItems = [...actionResult.resources].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const events = [...eventResult.resources].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const otherItems = allOtherItems
    .filter((i) => !i.completed && i.dueDate <= cutoffDateStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // Gated on action items specifically -- calendar events and other items
  // alone don't trigger a post, even if either has entries due.
  if (actionItems.length === 0) {
    return { posted: false, reason: 'No action items due -- nothing to post' };
  }

  const isToday = (dateStr) => dateStr.slice(0, 10) === todayDateStr;
  const todayEvents = events.filter((e) => isToday(e.eventDate));
  const todayActions = actionItems.filter((a) => isToday(a.dueDate));
  const todayOther = otherItems.filter((o) => isToday(o.dueDate));

  const lines = [`*Pipeline digest -- next ${LOOKAHEAD_DAYS} business days*`];

  // "Due today" surfaces everything happening today up front, regardless of
  // type -- items listed here also still appear below in their normal
  // type-categorized section.
  if (todayEvents.length || todayActions.length || todayOther.length) {
    lines.push('', '*Due today:*');
    todayEvents.forEach((e) => lines.push(`- :calendar: ${e.companyName} -- ${e.title} (${formatEventWhen(e.eventDate)})`));
    todayActions.forEach((a) => lines.push(`- :white_check_mark: ${a.companyName} -- ${a.description}`));
    todayOther.forEach((o) => lines.push(`- :round_pushpin: ${o.description}`));
  }

  // Below: categorized by type (Calendar, then Action items, then Other),
  // each internally ordered by due date. Overdue action/other items are
  // flagged inline rather than split into a separate section -- sorting by
  // due date already puts them first within their category.
  if (events.length) {
    lines.push('', '*Calendar events:*');
    events.forEach((e) => lines.push(`- ${e.companyName} -- ${e.title} (${formatEventWhen(e.eventDate)})`));
  }

  if (actionItems.length) {
    lines.push('', '*Action items:*');
    actionItems.forEach((a) => {
      const overdue = a.dueDate.slice(0, 10) < todayDateStr;
      lines.push(`- ${overdue ? ':red_circle: ' : ''}${a.companyName} -- ${a.description} (due ${a.dueDate.slice(0, 10)})`);
    });
  }

  if (otherItems.length) {
    lines.push('', '*One Time BD Action Items:*');
    otherItems.forEach((o) => {
      const overdue = o.dueDate.slice(0, 10) < todayDateStr;
      lines.push(`- ${overdue ? ':red_circle: ' : ''}${o.description} (due ${o.dueDate.slice(0, 10)})`);
    });
  }

  // Full pipeline overview, broken down by stage (excluding Won/Lost --
  // those are closed out, not "active"), each stage's leads sorted by deal
  // size so the biggest opportunities in that stage surface first.
  const activeLeads = activeLeadsResult.resources;
  if (activeLeads.length) {
    const stageOrder = [...stages].sort((a, b) => a.order - b.order);
    const byStage = {};
    activeLeads.forEach((l) => {
      (byStage[l.stage] = byStage[l.stage] || []).push(l);
    });

    lines.push('', '*Active pipeline (by stage):*');
    stageOrder.forEach((stage) => {
      const leadsInStage = byStage[stage.key];
      if (!leadsInStage || !leadsInStage.length) return;
      lines.push(`_${stage.label}_`);
      leadsInStage
        .sort((a, b) => (b.dealValue || 0) - (a.dealValue || 0))
        .forEach((l) => lines.push(`- ${l.companyName} -- $${(l.dealValue || 0).toLocaleString('en-US')}`));
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
