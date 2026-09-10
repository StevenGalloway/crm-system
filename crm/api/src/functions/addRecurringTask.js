const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { configContainer } = require('../cosmosClient');
const { CADENCES } = require('../recurringCore');

const DOC_ID = 'recurring-tasks';

async function readDoc() {
  try {
    const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
    return resource || { id: DOC_ID, type: 'recurringTasks', templates: [] };
  } catch (err) {
    if (err.code === 404) {
      return { id: DOC_ID, type: 'recurringTasks', templates: [] };
    }
    throw err;
  }
}

app.http('addRecurringTask', {
  methods: ['POST'],
  route: 'recurring-tasks',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

    if (!body.description || !body.description.trim()) {
      return { status: 400, jsonBody: { error: 'description is required' } };
    }
    if (!CADENCES.includes(body.cadence)) {
      return { status: 400, jsonBody: { error: `cadence must be one of: ${CADENCES.join(', ')}` } };
    }
    if (!body.anchorDate) {
      return { status: 400, jsonBody: { error: 'anchorDate is required' } };
    }

    const now = new Date().toISOString();
    const template = {
      id: randomUUID(),
      description: body.description.trim(),
      cadence: body.cadence,
      anchorDate: body.anchorDate,
      active: true,
      lastGeneratedDate: null,
      createdAt: now,
    };

    try {
      const doc = await readDoc();
      doc.templates.push(template);
      const { resource } = await configContainer.items.upsert(doc);
      return { status: 201, jsonBody: resource.templates };
    } catch (err) {
      context.error('addRecurringTask failed', err);
      return { status: 500, jsonBody: { error: 'Failed to add recurring task' } };
    }
  },
});
