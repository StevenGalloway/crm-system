const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');

const DOC_ID = 'other-items';

app.http('getOtherItems', {
  methods: ['GET'],
  route: 'other-items',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
      return { jsonBody: (resource && resource.items) || [] };
    } catch (err) {
      if (err.code === 404) {
        return { jsonBody: [] };
      }
      context.error('getOtherItems failed', err);
      return { status: 500, jsonBody: { error: 'Failed to load other items' } };
    }
  },
});
