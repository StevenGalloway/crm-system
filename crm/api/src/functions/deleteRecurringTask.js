const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');

const DOC_ID = 'recurring-tasks';

app.http('deleteRecurringTask', {
  methods: ['DELETE'],
  route: 'recurring-tasks/{taskId}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { taskId } = request.params;

    let doc;
    try {
      const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
      doc = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Recurring task not found' } };
    }
    if (!doc) return { status: 404, jsonBody: { error: 'Recurring task not found' } };

    const before = doc.templates.length;
    doc.templates = doc.templates.filter((t) => t.id !== taskId);
    if (doc.templates.length === before) {
      return { status: 404, jsonBody: { error: 'Recurring task not found' } };
    }

    try {
      const { resource } = await configContainer.items.upsert(doc);
      return { jsonBody: resource.templates };
    } catch (err) {
      context.error('deleteRecurringTask failed', err);
      return { status: 500, jsonBody: { error: 'Failed to delete recurring task' } };
    }
  },
});
