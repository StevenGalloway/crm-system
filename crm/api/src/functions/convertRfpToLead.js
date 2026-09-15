const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');

// The only sanctioned way out of the frozen "RFP" lane -- always lands the
// lead in Pending Sale as a standard lead, regardless of stage adjacency.
const TARGET_STAGE = 'pending_sale';

app.http('convertRfpToLead', {
  methods: ['PATCH'],
  route: 'leads/{id}/convert-to-lead',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id } = request.params;

    let lead;
    try {
      const { resource } = await leadsContainer.item(id, id).read();
      lead = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Lead not found' } };
    }
    if (!lead) return { status: 404, jsonBody: { error: 'Lead not found' } };

    if (!lead.isRFP) {
      return { status: 400, jsonBody: { error: 'Only an RFP lead can be converted' } };
    }

    const now = new Date().toISOString();
    lead.isRFP = false;
    lead.stage = TARGET_STAGE;
    lead.updatedAt = now;
    lead.stageHistory.push({ stage: TARGET_STAGE, enteredAt: now });

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { jsonBody: resource };
    } catch (err) {
      context.error('convertRfpToLead failed', err);
      return { status: 500, jsonBody: { error: 'Failed to convert lead' } };
    }
  },
});
