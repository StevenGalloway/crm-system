const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');
const { CADENCES } = require('../recurringCore');

const DOC_ID = 'recurring-tasks';

app.http('updateRecurringTask', {
  methods: ['PATCH'],
  route: 'recurring-tasks/{taskId}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { taskId } = request.params;
    let body = {};
    try {
      body = await request.json();
    } catch {
      // no body is fine -- defaults to toggling active
    }

    let doc;
    try {
      const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
      doc = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Recurring task not found' } };
    }
    if (!doc) return { status: 404, jsonBody: { error: 'Recurring task not found' } };

    const template = doc.templates.find((t) => t.id === taskId);
    if (!template) return { status: 404, jsonBody: { error: 'Recurring task not found' } };

    if (body.description !== undefined) {
      if (!body.description.trim()) {
        return { status: 400, jsonBody: { error: 'description cannot be empty' } };
      }
      template.description = body.description.trim();
    }
    if (body.cadence !== undefined) {
      if (!CADENCES.includes(body.cadence)) {
        return { status: 400, jsonBody: { error: `cadence must be one of: ${CADENCES.join(', ')}` } };
      }
      template.cadence = body.cadence;
    }
    if (body.anchorDate !== undefined) {
      if (!body.anchorDate) {
        return { status: 400, jsonBody: { error: 'anchorDate cannot be empty' } };
      }
      template.anchorDate = body.anchorDate;
    }
    if (body.active !== undefined) {
      template.active = body.active !== false;
    }

    try {
      const { resource } = await configContainer.items.upsert(doc);
      return { jsonBody: resource.templates };
    } catch (err) {
      context.error('updateRecurringTask failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update recurring task' } };
    }
  },
});
