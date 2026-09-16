const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { leadsContainer, configContainer } = require('../cosmosClient');

const CONTACTS_DOC_ID = 'contacts';
const LOST_STAGE = 'lost';
const FROZEN_STAGE = 'rfp';
// A lost deal isn't dead forever -- default the new contact's next outreach
// out a quarter so it resurfaces for a future check-in instead of showing
// up as immediately (and noisily) due.
const DEFAULT_REOUTREACH_DAYS = 90;

async function readContactsDoc() {
  try {
    const { resource } = await configContainer.item(CONTACTS_DOC_ID, CONTACTS_DOC_ID).read();
    return resource || { id: CONTACTS_DOC_ID, type: 'contacts', contacts: [] };
  } catch (err) {
    if (err.code === 404) return { id: CONTACTS_DOC_ID, type: 'contacts', contacts: [] };
    throw err;
  }
}

// The counterpart to convertContactToLead -- marks a lead Lost and carries
// its details over to the Contacts list as a future-outreach contact,
// instead of just losing that context once the lead is archived/forgotten.
app.http('convertLeadToContact', {
  methods: ['PATCH'],
  route: 'leads/{id}/convert-to-contact',
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

    if (lead.stage === FROZEN_STAGE) {
      return { status: 400, jsonBody: { error: 'RFP leads are frozen -- convert to a standard lead first' } };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const nextOutreach = new Date(now);
    nextOutreach.setDate(nextOutreach.getDate() + DEFAULT_REOUTREACH_DAYS);

    const contact = {
      id: randomUUID(),
      name: lead.contactName || lead.companyName,
      contactType: 'Contact',
      companyName: lead.companyName || '',
      nextOutreachDate: nextOutreach.toISOString().slice(0, 10),
      nextOutreachAction: `Re-check interest -- previously a lead${lead.dealName ? ` (${lead.dealName})` : ''} that moved to Lost`,
      contactOwner: lead.leadOwner || '',
      clientPartner: lead.clientPartner || '',
      outreachNotifiedFor: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    lead.stage = LOST_STAGE;
    lead.updatedAt = nowIso;
    lead.stageHistory.push({ stage: LOST_STAGE, enteredAt: nowIso });

    try {
      const doc = await readContactsDoc();
      doc.contacts.push(contact);
      await configContainer.items.upsert(doc);
      const { resource: updatedLead } = await leadsContainer.item(id, id).replace(lead);
      return { status: 201, jsonBody: { lead: updatedLead, contact } };
    } catch (err) {
      context.error('convertLeadToContact failed', err);
      return { status: 500, jsonBody: { error: 'Failed to convert lead to contact' } };
    }
  },
});
