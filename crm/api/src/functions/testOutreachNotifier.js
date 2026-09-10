const { app } = require('@azure/functions');
const { runOutreachCheck } = require('../outreachNotifierCore');

// Manually fires the outreach-DM check on demand, so it can be tested
// without waiting for its daily schedule.
app.http('testOutreachNotifier', {
  methods: ['POST'],
  route: 'notify/outreach-test',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const result = await runOutreachCheck(context);
      return { jsonBody: result };
    } catch (err) {
      context.error('testOutreachNotifier failed', err);
      return { status: 500, jsonBody: { error: 'Failed to run outreach check', detail: err.message } };
    }
  },
});
