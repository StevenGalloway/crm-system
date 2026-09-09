const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { leadsContainer } = require('../cosmosClient');

app.http('addActionItem', {
  methods: ['POST'],
  route: 'leads/{id}/actions',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id } = request.params;
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

    if (!body.description || !body.description.trim()) {
      return { status: 400, jsonBody: { error: 'description is required' } };
    }
    if (!body.dueDate) {
      return { status: 400, jsonBody: { error: 'dueDate is required' } };
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
    const actionItem = {
      id: randomUUID(),
      description: body.description.trim(),
      dueDate: body.dueDate, // ISO date/datetime string
      completed: false,
      createdAt: now,
      completedAt: null,
    };
    lead.actionItems.push(actionItem);
    lead.updatedAt = now;

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { status: 201, jsonBody: resource };
    } catch (err) {
      context.error('addActionItem failed', err);
      return { status: 500, jsonBody: { error: 'Failed to add action item' } };
    }
  },
});
