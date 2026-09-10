const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');

app.http('updateLeadArtifact', {
  methods: ['PATCH'],
  route: 'leads/{id}/artifacts/{artifactId}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id, artifactId } = request.params;
    let body = {};
    try {
      body = await request.json();
    } catch {
      // no body is fine -- defaults to marking complete
    }

    let lead;
    try {
      const { resource } = await leadsContainer.item(id, id).read();
      lead = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Lead not found' } };
    }
    if (!lead) return { status: 404, jsonBody: { error: 'Lead not found' } };

    const completed = body.completed !== false;
    const current = new Set(lead.completedArtifactIds || []);
    if (completed) current.add(artifactId);
    else current.delete(artifactId);
    lead.completedArtifactIds = [...current];
    lead.updatedAt = new Date().toISOString();

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { jsonBody: resource };
    } catch (err) {
      context.error('updateLeadArtifact failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update artifact checklist' } };
    }
  },
});
