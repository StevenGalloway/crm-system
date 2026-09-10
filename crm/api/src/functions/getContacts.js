const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');

const DOC_ID = 'contacts';

app.http('getContacts', {
  methods: ['GET'],
  route: 'contacts',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
      return { jsonBody: (resource && resource.contacts) || [] };
    } catch (err) {
      if (err.code === 404) {
        return { jsonBody: [] };
      }
      context.error('getContacts failed', err);
      return { status: 500, jsonBody: { error: 'Failed to load contacts' } };
    }
  },
});
