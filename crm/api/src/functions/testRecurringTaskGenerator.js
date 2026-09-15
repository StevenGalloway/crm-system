const { app } = require('@azure/functions');
const { generateDueTasks } = require('../recurringCore');

// Fires the recurring-task generator. Called both for on-demand manual
// testing and, on a schedule, by .github/workflows/scheduled-jobs.yml --
// Azure Static Web Apps' Managed Functions don't support Timer triggers, so
// an external scheduler hitting this HTTP endpoint stands in for one. Safe
// to call as often as the schedule likes: each template's lastGeneratedDate
// guard prevents generating the same occurrence twice.
app.http('testRecurringTaskGenerator', {
  methods: ['POST'],
  route: 'recurring-tasks/test',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const result = await generateDueTasks(context);
      return { jsonBody: result };
    } catch (err) {
      context.error('testRecurringTaskGenerator failed', err);
      return { status: 500, jsonBody: { error: 'Failed to run generator', detail: err.message } };
    }
  },
});
