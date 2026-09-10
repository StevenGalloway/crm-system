const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { configContainer } = require('../cosmosClient');

const DOC_ID = 'contacts';

async function readDoc() {
  try {
    const { resource } = await configContainer.item(DOC_ID, DOC_ID).read();
    return resource || { id: DOC_ID, type: 'contacts', contacts: [] };
  } catch (err) {
    if (err.code === 404) {
      return { id: DOC_ID, type: 'contacts', contacts: [] };
    }
    throw err;
  }
}

app.http('addContact', {
  methods: ['POST'],
  route: 'contacts',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

    if (!body.name || !body.name.trim()) {
      return { status: 400, jsonBody: { error: 'name is required' } };
    }
    if (!body.nextOutreachDate) {
      return { status: 400, jsonBody: { error: 'nextOutreachDate is required' } };
    }

    const now = new Date().toISOString();
    const contact = {
      id: randomUUID(),
      name: body.name.trim(),
      nextOutreachDate: body.nextOutreachDate,
      nextOutreachAction: body.nextOutreachAction || '',
      contactOwner: body.contactOwner || '',
      outreachNotifiedFor: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const doc = await readDoc();
      doc.contacts.push(contact);
      const { resource } = await configContainer.items.upsert(doc);
      return { status: 201, jsonBody: resource.contacts };
    } catch (err) {
      context.error('addContact failed', err);
      return { status: 500, jsonBody: { error: 'Failed to add contact' } };
    }
  },
});
