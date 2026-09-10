const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { configContainer } = require('../cosmosClient');

const DOC_ID = 'other-items';

async function readDoc() {
  try {
    const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
    return resource || { id: DOC_ID, type: 'otherItems', items: [] };
  } catch (err) {
    if (err.code === 404) {
      return { id: DOC_ID, type: 'otherItems', items: [] };
    }
    throw err;
  }
}

app.http('addOtherItem', {
  methods: ['POST'],
  route: 'other-items',
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
    if (!body.dueDate) {
      return { status: 400, jsonBody: { error: 'dueDate is required' } };
    }

    const now = new Date().toISOString();
    const item = {
      id: randomUUID(),
      description: body.description.trim(),
      dueDate: body.dueDate,
      completed: false,
      createdAt: now,
      completedAt: null,
    };

    try {
      const doc = await readDoc();
      doc.items.push(item);
      const { resource } = await configContainer.items.upsert(doc);
      return { status: 201, jsonBody: resource.items };
    } catch (err) {
      context.error('addOtherItem failed', err);
      return { status: 500, jsonBody: { error: 'Failed to add item' } };
    }
  },
});
