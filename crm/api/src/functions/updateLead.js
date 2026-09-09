const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');

const EDITABLE_FIELDS = ['companyName', 'contactName', 'contactEmail', 'contactPhone', 'dealValue'];

app.http('updateLead', {
  methods: ['PATCH'],
  route: 'leads/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id } = request.params;
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

    let lead;
    try {
      const { resource } = await leadsContainer.item(id, id).read();
      lead = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Lead not found' } };
    }
    if (!lead) return { status: 404, jsonBody: { error: 'Lead not found' } };

    // Stage, archived, and history are only changed via their dedicated
    // endpoints -- this one is for the editable contact/value fields only.
    EDITABLE_FIELDS.forEach((field) => {
      if (body[field] !== undefined) {
        lead[field] = field === 'dealValue' ? Number(body[field]) || 0 : String(body[field]);
      }
    });
    lead.updatedAt = new Date().toISOString();

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { jsonBody: resource };
    } catch (err) {
      context.error('updateLead failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update lead' } };
    }
  },
});
