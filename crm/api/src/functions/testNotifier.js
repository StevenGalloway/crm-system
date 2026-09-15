const { app } = require('@azure/functions');
const { runDigest } = require('../notifierCore');

// Manually fires the same digest dailyNotifier (POST /notify/tick) sends,
// bypassing its schedule gating entirely -- so the Slack integration (and
// SLACK_WEBHOOK_URL) can be tested on demand regardless of the configured
// schedule. Posts to whatever webhook is currently configured, so point
// SLACK_WEBHOOK_URL at a test channel before using this against real
// pipeline data.
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
