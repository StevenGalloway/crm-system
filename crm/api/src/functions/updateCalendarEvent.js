const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');

app.http('updateCalendarEvent', {
  methods: ['PATCH'],
  route: 'leads/{id}/events/{eventId}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id, eventId } = request.params;
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

    const event = lead.calendarEvents.find((e) => e.id === eventId);
    if (!event) return { status: 404, jsonBody: { error: 'Calendar event not found' } };

    if (body.title !== undefined) {
      if (!body.title.trim()) {
        return { status: 400, jsonBody: { error: 'title cannot be empty' } };
      }
      event.title = body.title.trim();
    }
    if (body.eventDate !== undefined) {
      if (!body.eventDate) {
        return { status: 400, jsonBody: { error: 'eventDate cannot be empty' } };
      }
      event.eventDate = body.eventDate;
    }
    if (body.notes !== undefined) {
      event.notes = body.notes;
    }
    lead.updatedAt = new Date().toISOString();

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { jsonBody: resource };
    } catch (err) {
      context.error('updateCalendarEvent failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update calendar event' } };
    }
  },
});
