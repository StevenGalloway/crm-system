const { app } = require('@azure/functions');
const { runDigest } = require('../notifierCore');

app.timer('dailyNotifier', {
  // 13:00 UTC. Azure Function timer schedules run in UTC unless the
  // WEBSITE_TIME_ZONE app setting is set -- see README for setting this to
  // Central Time so this reliably fires at 8am local instead of 8am UTC.
  schedule: '0 0 13 * * 1-5',
  handler: async (myTimer, context) => {
    try {
      const result = await runDigest(context);
      if (!result.posted) {
        context.warn(result.reason);
      }
    } catch (err) {
      context.error('dailyNotifier failed', err);
    }
  },
});
