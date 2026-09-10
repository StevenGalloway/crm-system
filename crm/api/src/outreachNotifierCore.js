const { configContainer } = require('./cosmosClient');

const CONTACTS_DOC_ID = 'contacts';
const CONFIG_DOC_ID = 'app-config';
const WINDOW_DAYS = 2;

/**
 * Checks every contact's next outreach date against a rolling 48-hour
 * window (also catching anything already overdue) and DMs each contact
 * owner a summary of theirs via the Slack Web API -- a real private
 * message, not a channel post, since outreach reminders are personal to
 * whoever owns that relationship. Requires SLACK_BOT_TOKEN (chat:write
 * scope), separate from the SLACK_WEBHOOK_URL used by the pipeline digest.
 * Shared by the scheduled timer and the on-demand test endpoint.
 */
async function runOutreachCheck(context) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) {
    return { sent: [], skipped: [], reason: 'SLACK_BOT_TOKEN is not set' };
  }

  let contactsDoc;
  try {
    const { resource } = await configContainer.item(CONTACTS_DOC_ID, CONTACTS_DOC_ID).read();
    contactsDoc = resource;
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  if (!contactsDoc || !contactsDoc.contacts || !contactsDoc.contacts.length) {
    return { sent: [], skipped: [], reason: 'No contacts configured' };
  }

  let configDoc;
  try {
    const { resource } = await configContainer.item(CONFIG_DOC_ID, CONFIG_DOC_ID).read();
    configDoc = resource;
  } catch {
    configDoc = {};
  }
  const contactOwners = configDoc.contactOwners || [];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // "Due" = overdue, due today, or due within the window -- not just a
  // future-only slice, so nothing silently falls through the gap between
  // runs the way it would with a strictly-forward window.
  const due = contactsDoc.contacts.filter(
    (c) => c.nextOutreachDate && c.nextOutreachDate <= cutoffStr && c.outreachNotifiedFor !== c.nextOutreachDate
  );
  if (!due.length) {
    return { sent: [], skipped: [], reason: 'Nothing due in the outreach window' };
  }

  const groups = {};
  due.forEach((c) => {
    const owner = c.contactOwner || '(unassigned)';
    (groups[owner] = groups[owner] || []).push(c);
  });

  const sent = [];
  const skipped = [];

  for (const [ownerName, contactsForOwner] of Object.entries(groups)) {
    const ownerConfig = contactOwners.find((o) => o.name === ownerName);
    if (!ownerConfig || !ownerConfig.slackUserId) {
      skipped.push({ owner: ownerName, count: contactsForOwner.length, reason: 'No Slack ID configured for this owner' });
      continue;
    }

    const lines = ['*Outreach due in the next 48 hours*', ''];
    contactsForOwner
      .sort((a, b) => a.nextOutreachDate.localeCompare(b.nextOutreachDate))
      .forEach((c) => {
        const overdue = c.nextOutreachDate < todayStr;
        const action = c.nextOutreachAction ? ` -- ${c.nextOutreachAction}` : '';
        lines.push(`- ${overdue ? ':red_circle: ' : ''}${c.name} -- ${overdue ? 'was due' : 'due'} ${c.nextOutreachDate}${action}`);
      });

    let data;
    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({ channel: ownerConfig.slackUserId, text: lines.join('\n') }),
      });
      data = await res.json();
    } catch (err) {
      skipped.push({ owner: ownerName, count: contactsForOwner.length, reason: `Request failed: ${err.message}` });
      continue;
    }

    if (!data.ok) {
      if (context) context.error(`Slack DM to ${ownerName} failed: ${data.error}`);
      skipped.push({ owner: ownerName, count: contactsForOwner.length, reason: `Slack error: ${data.error}` });
      continue;
    }

    contactsForOwner.forEach((c) => {
      c.outreachNotifiedFor = c.nextOutreachDate;
    });
    sent.push({ owner: ownerName, count: contactsForOwner.length });
  }

  if (sent.length) {
    await configContainer.items.upsert(contactsDoc);
  }

  return { sent, skipped };
}

module.exports = { runOutreachCheck };
