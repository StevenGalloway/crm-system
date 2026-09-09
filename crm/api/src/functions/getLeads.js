const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');

app.http('getLeads', {
  methods: ['GET'],
  route: 'leads',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const showArchived = request.query.get('archived') === 'true';

    const query = {
      query: 'SELECT * FROM c WHERE c.archived = @archived ORDER BY c.updatedAt DESC',
      parameters: [{ name: '@archived', value: showArchived }],
    };

    try {
      const { resources } = await leadsContainer.items.query(query).fetchAll();
      return { jsonBody: resources };
    } catch (err) {
      context.error('getLeads failed', err);
      return { status: 500, jsonBody: { error: 'Failed to load leads' } };
    }
  },
});
