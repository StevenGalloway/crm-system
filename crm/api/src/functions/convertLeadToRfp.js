const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');

// The counterpart to convertRfpToLead -- pulls an existing standard lead
// into the frozen RFP lane, regardless of its current stage.
const RFP_STAGE = 'rfp';

app.http('convertLeadToRfp', {
  methods: ['PATCH'],
  route: 'leads/{id}/convert-to-rfp',
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

    if (lead.isRFP) {
      return { status: 400, jsonBody: { error: 'Lead is already an RFP' } };
    }

    const now = new Date().toISOString();
    lead.isRFP = true;
    lead.stage = RFP_STAGE;
    lead.updatedAt = now;
    lead.stageHistory.push({ stage: RFP_STAGE, enteredAt: now });

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { jsonBody: resource };
    } catch (err) {
      context.error('convertLeadToRfp failed', err);
      return { status: 500, jsonBody: { error: 'Failed to convert lead' } };
    }
  },
});
