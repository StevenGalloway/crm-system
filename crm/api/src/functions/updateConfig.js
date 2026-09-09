const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');

app.http('updateConfig', {
  methods: ['PUT'],
  route: 'config',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

    try {
      const { resource: existing } = await configContainer.item('app-config', 'app-config').read();
      const updated = {
        ...existing,
        ...body,
        id: 'app-config',
        type: 'config',
      };
      const { resource } = await configContainer.item('app-config', 'app-config').replace(updated);
      return { jsonBody: resource };
    } catch (err) {
      context.error('updateConfig failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update config' } };
    }
  },
});
