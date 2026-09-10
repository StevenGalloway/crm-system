const { app } = require('@azure/functions');
const { configContainer, leadsContainer } = require('../cosmosClient');

// When clientPartners shrinks, any lead still assigned to a name that's no
// longer in the list gets that field cleared -- otherwise the board would
// keep silently displaying a "removed" partner with no way to tell from
// the config alone that they're gone.
async function clearRemovedPartners(oldList, newList, context) {
  const removed = (oldList || []).filter((name) => !newList.includes(name));
  if (!removed.length) return;

  const query = {
    query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(@removed, c.clientPartner)',
    parameters: [{ name: '@removed', value: removed }],
  };
  const { resources: affected } = await leadsContainer.items.query(query).fetchAll();
  await Promise.all(
    affected.map((lead) => {
      lead.clientPartner = '';
      lead.updatedAt = new Date().toISOString();
      return leadsContainer.item(lead.id, lead.id).replace(lead);
    })
  );
  if (affected.length) {
    context.log(`Cleared clientPartner on ${affected.length} lead(s) for removed partner(s): ${removed.join(', ')}`);
  }
}

app.http('updateConfig', {
  methods: ['PUT'],
  route: 'config',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

    try {
      const { resource: existing } = await configContainer.item('app-config', 'app-config').read();

      if (Array.isArray(body.clientPartners)) {
        await clearRemovedPartners(existing.clientPartners, body.clientPartners, context);
      }

      const updated = {
        ...existing,
        ...body,
        id: 'app-config',
        type: 'config',
      };
      const { resource } = await configContainer.item('app-config', 'app-config').replace(updated);
      return { jsonBody: resource };
    } catch (err) {
      context.error('updateConfig failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update config' } };
    }
  },
});
