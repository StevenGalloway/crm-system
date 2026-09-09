const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');

app.http('updateActionItem', {
  methods: ['PATCH'],
  route: 'leads/{id}/actions/{actionId}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id, actionId } = request.params;
    let body = {};
    try {
      body = await request.json();
    } catch {
      // no body is fine -- defaults to marking complete
    }

    let lead;
    try {
      const { resource } = await leadsContainer.item(id, id).read();
      lead = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Lead not found' } };
    }
    if (!lead) return { status: 404, jsonBody: { error: 'Lead not found' } };

    const item = lead.actionItems.find((a) => a.id === actionId);
    if (!item) return { status: 404, jsonBody: { error: 'Action item not found' } };

    if (body.description !== undefined) {
      if (!body.description.trim()) {
        return { status: 400, jsonBody: { error: 'description cannot be empty' } };
      }
      item.description = body.description.trim();
    }
    if (body.dueDate !== undefined) {
      if (!body.dueDate) {
        return { status: 400, jsonBody: { error: 'dueDate cannot be empty' } };
      }
      item.dueDate = body.dueDate;
    }
    if (body.completed !== undefined) {
      item.completed = body.completed !== false;
      item.completedAt = item.completed ? new Date().toISOString() : null;
    }
    lead.updatedAt = new Date().toISOString();

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { jsonBody: resource };
    } catch (err) {
      context.error('updateActionItem failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update action item' } };
    }
  },
});
