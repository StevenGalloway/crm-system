const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');

app.http('deleteLead', {
  methods: ['DELETE'],
  route: 'leads/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id } = request.params;

    try {
      await leadsContainer.item(id, id).delete();
      return { status: 204 };
    } catch (err) {
      if (err.code === 404) {
        return { status: 404, jsonBody: { error: 'Lead not found' } };
      }
      context.error('deleteLead failed', err);
      return { status: 500, jsonBody: { error: 'Failed to delete lead' } };
    }
  },
});
