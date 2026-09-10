const { app } = require('@azure/functions');
const { configContainer } = require('../cosmosClient');

const DOC_ID = 'contacts';

app.http('deleteContact', {
  methods: ['DELETE'],
  route: 'contacts/{contactId}',
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

    const before = doc.contacts.length;
    doc.contacts = doc.contacts.filter((c) => c.id !== contactId);
    if (doc.contacts.length === before) {
      return { status: 404, jsonBody: { error: 'Contact not found' } };
    }

    try {
      const { resource } = await configContainer.items.upsert(doc);
      return { jsonBody: resource.contacts };
    } catch (err) {
      context.error('deleteContact failed', err);
      return { status: 500, jsonBody: { error: 'Failed to delete contact' } };
    }
  },
});
