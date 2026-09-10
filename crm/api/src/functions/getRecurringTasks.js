const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');

const DOC_ID = 'recurring-tasks';

app.http('getRecurringTasks', {
  methods: ['GET'],
  route: 'recurring-tasks',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
      return { jsonBody: (resource && resource.templates) || [] };
    } catch (err) {
      if (err.code === 404) {
        return { jsonBody: [] };
      }
      context.error('getRecurringTasks failed', err);
      return { status: 500, jsonBody: { error: 'Failed to load recurring tasks' } };
    }
  },
});
