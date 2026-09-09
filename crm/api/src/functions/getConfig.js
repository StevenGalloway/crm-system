const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');

app.http('getConfig', {
  methods: ['GET'],
  route: 'config',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const { resource } = await configContainer.item('app-config', 'app-config').read();
      if (!resource) {
        return { status: 404, jsonBody: { error: 'Config not seeded yet -- see infra/seed-config.json' } };
      }
      return { jsonBody: resource };
    } catch (err) {
      context.error('getConfig failed', err);
      return { status: 500, jsonBody: { error: 'Failed to load config' } };
    }
  },
});
