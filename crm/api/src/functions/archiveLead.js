const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');

app.http('archiveLead', {
  methods: ['PATCH'],
  route: 'leads/{id}/archive',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id } = request.params;
    let body = {};
    try {
      body = await request.json();
    } catch {
      // no body is fine -- defaults to archiving
    }

    let lead;
    try {
      const { resource } = await leadsContainer.item(id, id).read();
      lead = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Lead not found' } };
    }
    if (!lead) return { status: 404, jsonBody: { error: 'Lead not found' } };

    lead.archived = body.archived !== false; // default true (archive)
    lead.updatedAt = new Date().toISOString();

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { jsonBody: resource };
    } catch (err) {
      context.error('archiveLead failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update lead' } };
    }
  },
});
