const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');

const DOC_ID = 'contacts';

app.http('updateContact', {
  methods: ['PATCH'],
  route: 'contacts/{contactId}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { contactId } = request.params;
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

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

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return { status: 400, jsonBody: { error: 'name cannot be empty' } };
      }
      contact.name = body.name.trim();
    }
    if (body.nextOutreachDate !== undefined) {
      if (!body.nextOutreachDate) {
        return { status: 400, jsonBody: { error: 'nextOutreachDate cannot be empty' } };
      }
      contact.nextOutreachDate = body.nextOutreachDate;
    }
    if (body.nextOutreachAction !== undefined) {
      contact.nextOutreachAction = body.nextOutreachAction;
    }
    if (body.contactOwner !== undefined) {
      contact.contactOwner = body.contactOwner;
    }
    contact.updatedAt = new Date().toISOString();

    try {
      const { resource } = await configContainer.items.upsert(doc);
      return { jsonBody: resource.contacts };
    } catch (err) {
      context.error('updateContact failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update contact' } };
    }
  },
});
