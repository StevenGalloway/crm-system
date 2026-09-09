const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { leadsContainer } = require('../cosmosClient');

app.http('addCommunication', {
  methods: ['POST'],
  route: 'leads/{id}/communications',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id } = request.params;
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

    if (!body.type || !body.type.trim()) {
      return { status: 400, jsonBody: { error: 'type is required (e.g. Call, Email, Text)' } };
    }
    if (!body.description || !body.description.trim()) {
      return { status: 400, jsonBody: { error: 'description is required' } };
    }

    let lead;
    try {
      const { resource } = await leadsContainer.item(id, id).read();
      lead = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Lead not found' } };
    }
    if (!lead) return { status: 404, jsonBody: { error: 'Lead not found' } };

    const now = new Date().toISOString();
    // Communications are kept as a full history; the UI surfaces the most
    // recent entry as "Last communication" rather than overwriting a single
    // field, so nothing is lost when a new one is logged.
    const communication = {
      id: randomUUID(),
      type: body.type.trim(), // Call | Email | Text | Other
      description: body.description.trim(),
      occurredAt: body.occurredAt || now,
      createdAt: now,
    };
    lead.communications.push(communication);
    lead.updatedAt = now;

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { status: 201, jsonBody: resource };
    } catch (err) {
      context.error('addCommunication failed', err);
      return { status: 500, jsonBody: { error: 'Failed to log communication' } };
    }
  },
});
