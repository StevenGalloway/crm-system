const { app } = require('@azure/functions');
const { runOutreachCheck } = require('../outreachNotifierCore');

// Separate schedule from the pipeline digest -- outreach reminders are
// personal DMs on a 48-hour rolling window, not tied to the configurable
// digest schedule. Fixed daily run; the per-contact outreachNotifiedFor
// guard prevents re-DMing the same person about the same date.
app.timer('outreachNotifier', {
  schedule: '0 30 12 * * *',
  handler: async (myTimer, context) => {
    try {
      const result = await runOutreachCheck(context);
      if (!result.sent.length) {
        context.warn(result.reason || 'Nothing sent');
      }
      if (result.skipped && result.skipped.length) {
        context.warn(`Skipped: ${JSON.stringify(result.skipped)}`);
      }
    } catch (err) {
      context.error('outreachNotifier failed', err);
    }
  },
});
