const { app } = require('@azure/functions');
const { runDigest } = require('../notifierCore');
const { configContainer } = require('../cosmosClient');
const { DEFAULT_SCHEDULE, shouldSendNow, periodKey } = require('../scheduleCore');

const CONFIG_DOC_ID = 'app-config';

// HTTP-triggered, not a Timer trigger -- Azure Static Web Apps' "Managed
// Functions" only support HTTP triggers (Timer/Queue/Blob etc. are not a
// supported configuration: https://learn.microsoft.com/azure/static-web-apps/apis-functions#constraints).
// An external scheduler (see .github/workflows/scheduled-jobs.yml) calls
// this every 15 minutes instead, so the configured schedule (frequency +
// time, set on the Configuration page) can still be checked at that
// resolution -- the gating logic below is unchanged from when this ran on
// an in-process timer.
app.http('dailyNotifier', {
  methods: ['POST'],
  route: 'notify/tick',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let configDoc;
    try {
      const { resource } = await configContainer.item(CONFIG_DOC_ID, CONFIG_DOC_ID).read();
      configDoc = resource;
    } catch (err) {
      context.error('dailyNotifier: failed to load config', err);
      return { status: 500, jsonBody: { error: 'Failed to load config' } };
    }

    const schedule = { ...DEFAULT_SCHEDULE, ...(configDoc.notificationSchedule || {}) };
    const now = new Date();
    if (!shouldSendNow(schedule, now)) {
      return { jsonBody: { posted: false, reason: 'Not the configured send time' } };
    }

    const key = periodKey(schedule, now);
    if (schedule.lastSentPeriodKey === key) {
      return { jsonBody: { posted: false, reason: 'Already sent for this period' } };
    }

    let result;
    try {
      result = await runDigest(context);
      if (!result.posted) {
        context.warn(result.reason);
      }
    } catch (err) {
      context.error('dailyNotifier failed', err);
      return { status: 500, jsonBody: { error: 'Digest run failed', detail: err.message } };
    }

    configDoc.notificationSchedule = { ...schedule, lastSentPeriodKey: key };
    try {
      await configContainer.items.upsert(configDoc);
    } catch (err) {
      context.error('dailyNotifier: failed to persist lastSentPeriodKey', err);
    }

    return { jsonBody: result };
  },
});
