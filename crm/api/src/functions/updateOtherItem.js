const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');

const DOC_ID = 'other-items';

app.http('updateOtherItem', {
  methods: ['PATCH'],
  route: 'other-items/{itemId}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { itemId } = request.params;
    let body = {};
    try {
      body = await request.json();
    } catch {
      // no body is fine -- defaults to marking complete
    }

    let doc;
    try {
      const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
      doc = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Item not found' } };
    }
    if (!doc) return { status: 404, jsonBody: { error: 'Item not found' } };

    const item = doc.items.find((i) => i.id === itemId);
    if (!item) return { status: 404, jsonBody: { error: 'Item not found' } };

    if (body.description !== undefined) {
      if (!body.description.trim()) {
        return { status: 400, jsonBody: { error: 'description cannot be empty' } };
      }
      item.description = body.description.trim();
    }
    if (body.dueDate !== undefined) {
      if (!body.dueDate) {
        return { status: 400, jsonBody: { error: 'dueDate cannot be empty' } };
      }
      item.dueDate = body.dueDate;
    }
    if (body.completed !== undefined) {
      item.completed = body.completed !== false;
      item.completedAt = item.completed ? new Date().toISOString() : null;
    }

    try {
      const { resource } = await configContainer.items.upsert(doc);
      return { jsonBody: resource.items };
    } catch (err) {
      context.error('updateOtherItem failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update item' } };
    }
  },
});
