const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { leadsContainer } = require('../cosmosClient');

// New leads always enter here, regardless of what a client sends -- this is
// enforced server-side so "new leads can only be added at Qualification"
// can't be bypassed by a crafted request.
const FIRST_STAGE = 'qualification';

app.http('createLead', {
  methods: ['POST'],
  route: 'leads',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

    if (!body.companyName || !body.companyName.trim()) {
      return { status: 400, jsonBody: { error: 'companyName is required' } };
    }

    const now = new Date().toISOString();
    const lead = {
      id: randomUUID(),
      type: 'lead',
      companyName: body.companyName.trim(),
      contactName: body.contactName || '',
      contactEmail: body.contactEmail || '',
      contactPhone: body.contactPhone || '',
      dealValue: Number(body.dealValue) || 0,
      stage: FIRST_STAGE,
      archived: false,
      createdAt: now,
      updatedAt: now,
      stageHistory: [{ stage: FIRST_STAGE, enteredAt: now }],
      actionItems: [],
      calendarEvents: [],
      communications: [],
    };

    try {
      const { resource } = await leadsContainer.items.create(lead);
      return { status: 201, jsonBody: resource };
    } catch (err) {
      context.error('createLead failed', err);
      return { status: 500, jsonBody: { error: 'Failed to create lead' } };
    }
  },
});
