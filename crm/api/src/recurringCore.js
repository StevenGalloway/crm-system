const CADENCES = ['daily', 'weekly', 'monthly', 'quarterly', 'annually'];

// Note: monthly/quarterly/annually cadences anchored on the 29th-31st will
// drift in short months (JS Date rolls Feb 31 into Mar 2/3) -- acceptable
// for this POC's scale; worth a "clamp to last day of month" fix if that
// ever actually bites someone.
function addPeriod(dateStr, cadence) {
  const d = new Date(dateStr + 'T00:00:00');
  switch (cadence) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'annually':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      throw new Error(`Unknown cadence: ${cadence}`);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the most recent occurrence date (YYYY-MM-DD) that's due (<= today)
 * and hasn't been generated yet, or null if nothing is due right now.
 * Walks forward one period at a time from the last generated occurrence (or
 * the anchor date, if never generated) -- if the generator hasn't run in a
 * while, this catches up to a single current occurrence rather than queuing
 * a backlog of every missed one.
 */
function nextDueOccurrence(template, todayStr) {
  let occStr = template.lastGeneratedDate
    ? addPeriod(template.lastGeneratedDate, template.cadence)
    : template.anchorDate;

  let due = null;
  let guard = 0;
  while (occStr <= todayStr && guard < 1000) {
    due = occStr;
    occStr = addPeriod(occStr, template.cadence);
    guard++;
  }
  return due;
}

const { randomUUID } = require('crypto');
const { configContainer } = require('./cosmosClient');

const RECURRING_DOC_ID = 'recurring-tasks';
const OTHER_ITEMS_DOC_ID = 'other-items';

/**
 * Checks every active recurring task template against today's date and
 * generates a new "One Time BD Action Item" for any that are due, then
 * advances that template's lastGeneratedDate. Shared by the scheduled
 * generator timer and an on-demand test endpoint, same reasoning as
 * notifierCore's runDigest.
 */
async function generateDueTasks(context) {
  const todayStr = new Date().toISOString().slice(0, 10);

  let recurringDoc;
  try {
    const { resource } = await configContainer.item(RECURRING_DOC_ID, RECURRING_DOC_ID).read();
    recurringDoc = resource;
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  if (!recurringDoc || !recurringDoc.templates || !recurringDoc.templates.length) {
    return { generated: [] };
  }

  const generated = [];
  recurringDoc.templates
    .filter((t) => t.active)
    .forEach((template) => {
      const due = nextDueOccurrence(template, todayStr);
      if (!due) return;
      template.lastGeneratedDate = due;
      generated.push({
        id: randomUUID(),
        description: template.description,
        dueDate: due,
        completed: false,
        createdAt: new Date().toISOString(),
        completedAt: null,
        recurringTaskId: template.id,
      });
    });

  if (!generated.length) {
    return { generated: [] };
  }

  let otherItemsDoc;
  try {
    const { resource } = await configContainer.item(OTHER_ITEMS_DOC_ID, OTHER_ITEMS_DOC_ID).read();
    otherItemsDoc = resource;
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  if (!otherItemsDoc) {
    otherItemsDoc = { id: OTHER_ITEMS_DOC_ID, type: 'otherItems', items: [] };
  }
  otherItemsDoc.items.push(...generated);

  await Promise.all([
    configContainer.items.upsert(recurringDoc),
    configContainer.items.upsert(otherItemsDoc),
  ]);

  if (context) context.log(`Generated ${generated.length} recurring task instance(s).`);
  return { generated };
}

module.exports = { CADENCES, addPeriod, nextDueOccurrence, generateDueTasks };
