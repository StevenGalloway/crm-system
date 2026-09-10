const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');

const DOC_ID = 'other-items';

app.http('deleteOtherItem', {
  methods: ['DELETE'],
  route: 'other-items/{itemId}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { itemId } = request.params;

    let doc;
    try {
      const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
      doc = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Item not found' } };
    }
    if (!doc) return { status: 404, jsonBody: { error: 'Item not found' } };

    const before = doc.items.length;
    doc.items = doc.items.filter((i) => i.id !== itemId);
    if (doc.items.length === before) {
      return { status: 404, jsonBody: { error: 'Item not found' } };
    }

    try {
      const { resource } = await configContainer.items.upsert(doc);
      return { jsonBody: resource.items };
    } catch (err) {
      context.error('deleteOtherItem failed', err);
      return { status: 500, jsonBody: { error: 'Failed to delete item' } };
    }
  },
});
