const { app } = require('@azure/functions');
const { generateDueTasks } = require('../recurringCore');

// Manually fires the recurring-task generator on demand, so a newly-created
// template can be checked without waiting for the daily schedule.
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
