const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { leadsContainer } = require('../cosmosClient');

app.http('addCalendarEvent', {
  methods: ['POST'],
  route: 'leads/{id}/events',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id } = request.params;
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

    if (!body.title || !body.title.trim()) {
      return { status: 400, jsonBody: { error: 'title is required' } };
    }
    if (!body.eventDate) {
      return { status: 400, jsonBody: { error: 'eventDate is required' } };
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
    const event = {
      id: randomUUID(),
      title: body.title.trim(),
      eventDate: body.eventDate, // ISO datetime string
      notes: body.notes || '',
      createdAt: now,
    };
    lead.calendarEvents.push(event);
    lead.updatedAt = now;

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { status: 201, jsonBody: resource };
    } catch (err) {
      context.error('addCalendarEvent failed', err);
      return { status: 500, jsonBody: { error: 'Failed to add calendar event' } };
    }
  },
});
