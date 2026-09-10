const { app } = require('@azure/functions');
const { runDigest } = require('../notifierCore');
const { configContainer } = require('../cosmosClient');
const { DEFAULT_SCHEDULE, shouldSendNow, periodKey } = require('../scheduleCore');

const CONFIG_DOC_ID = 'app-config';

// Ticks every 15 minutes so the configured schedule (frequency + time, set
// on the Configuration page) can be checked at that resolution, rather than
// being locked to a single fixed hour in code.
app.timer('dailyNotifier', {
  schedule: '0 */15 * * * *',
  handler: async (myTimer, context) => {
    let configDoc;
    try {
      const { resource } = await configContainer.item(CONFIG_DOC_ID, CONFIG_DOC_ID).read();
      configDoc = resource;
    } catch (err) {
      context.error('dailyNotifier: failed to load config', err);
      return;
    }

    const schedule = { ...DEFAULT_SCHEDULE, ...(configDoc.notificationSchedule || {}) };
    const now = new Date();
    if (!shouldSendNow(schedule, now)) return;

    const key = periodKey(schedule, now);
    if (schedule.lastSentPeriodKey === key) return;

    try {
      const result = await runDigest(context);
      if (!result.posted) {
        context.warn(result.reason);
      }
    } catch (err) {
      context.error('dailyNotifier failed', err);
      return; // don't record the period as handled if the run itself failed
    }

    configDoc.notificationSchedule = { ...schedule, lastSentPeriodKey: key };
    try {
      await configContainer.items.upsert(configDoc);
    } catch (err) {
      context.error('dailyNotifier: failed to persist lastSentPeriodKey', err);
    }
  },
});
