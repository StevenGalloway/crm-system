const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { configContainer, leadsContainer } = require('../cosmosClient');

const DOC_ID = 'contacts';
const NQL_TYPE = 'Non-Qualified Lead';
const TARGET_STAGE = 'qualification';
const FALLBACK_COMPANY_NAME = 'Unknown Company';

app.http('convertContactToLead', {
  methods: ['POST'],
  route: 'contacts/{contactId}/convert-to-lead',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { contactId } = request.params;

    let doc;
    try {
      const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
      doc = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Contact not found' } };
    }
    if (!doc) return { status: 404, jsonBody: { error: 'Contact not found' } };

    const contact = doc.contacts.find((c) => c.id === contactId);
    if (!contact) return { status: 404, jsonBody: { error: 'Contact not found' } };
    if (contact.contactType !== NQL_TYPE) {
      return { status: 400, jsonBody: { error: 'Only a Non-Qualified Lead can be converted to a lead' } };
    }

    const now = new Date().toISOString();
    const lead = {
      id: randomUUID(),
      type: 'lead',
      companyName: (contact.companyName && contact.companyName.trim()) || FALLBACK_COMPANY_NAME,
      dealName: '',
      contactName: contact.name,
      contactEmail: '',
      contactPhone: '',
      clientPartner: contact.clientPartner || '',
      dealValue: 0,
      isRFP: false,
      stage: TARGET_STAGE,
      archived: false,
      createdAt: now,
      updatedAt: now,
      stageHistory: [{ stage: TARGET_STAGE, enteredAt: now }],
      actionItems: [],
      calendarEvents: [],
      communications: [],
      completedArtifactIds: [],
    };

    try {
      const { resource: createdLead } = await leadsContainer.items.create(lead);
      doc.contacts = doc.contacts.filter((c) => c.id !== contactId);
      await configContainer.items.upsert(doc);
      return { status: 201, jsonBody: createdLead };
    } catch (err) {
      context.error('convertContactToLead failed', err);
      return { status: 500, jsonBody: { error: 'Failed to convert contact to lead' } };
    }
  },
});
