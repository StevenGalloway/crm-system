const { app } = require('@azure/functions');
const { runOutreachCheck } = require('../outreachNotifierCore');

// Fires the outreach-DM check. Called both for on-demand manual testing and,
// on a schedule, by .github/workflows/scheduled-jobs.yml -- Azure Static Web
// Apps' Managed Functions don't support Timer triggers, so an external
// scheduler hitting this HTTP endpoint stands in for one. Safe to call as
// often as the schedule likes: each contact's outreachNotifiedFor guard
// prevents re-DMing them about the same outreach date twice.
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
