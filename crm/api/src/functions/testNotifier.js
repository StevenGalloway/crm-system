const { app } = require('@azure/functions');
const { runDigest } = require('../notifierCore');

// Manually fires the same digest the dailyNotifier timer sends, so the
// Slack integration (and SLACK_WEBHOOK_URL) can be tested on demand instead
// of waiting for the 8am weekday schedule. Posts to whatever webhook is
// currently configured, so point SLACK_WEBHOOK_URL at a test channel
// before using this against real pipeline data.
app.http('testNotifier', {
  methods: ['POST'],
  route: 'notify/test',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const result = await runDigest(context);
      return { jsonBody: result };
    } catch (err) {
      context.error('testNotifier failed', err);
      return { status: 500, jsonBody: { error: 'Failed to send test notification', detail: err.message } };
    }
  },
});
