const { app } = require('@azure/functions');
const { leadsContainer, configContainer } = require('../cosmosClient');

const LOST_STAGE = 'lost';
const REOPEN_STAGE = 'qualification';

async function getStages() {
  const { resource } = await configContainer.item('app-config', 'app-config').read();
  return resource.stages;
}

function activeStageOrder(stages) {
  return stages
    .filter((s) => !s.terminal)
    .sort((a, b) => a.order - b.order)
    .map((s) => s.key);
}

app.http('updateLeadStage', {
  methods: ['PATCH'],
  route: 'leads/{id}/stage',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { id } = request.params;
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Request body must be JSON' } };
    }

    const action = body.action; // 'forward' | 'backward' | 'lost' | 'reopen'
    const targetStage = body.targetStage; // direct stage key, e.g. from dragging a card to a column
    if (targetStage === undefined && !['forward', 'backward', 'lost', 'reopen'].includes(action)) {
      return { status: 400, jsonBody: { error: 'action must be forward, backward, lost, or reopen' } };
    }

    let lead;
    try {
      const { resource } = await leadsContainer.item(id, id).read();
      lead = resource;
    } catch {
      return { status: 404, jsonBody: { error: 'Lead not found' } };
    }
    if (!lead) return { status: 404, jsonBody: { error: 'Lead not found' } };

    const stages = await getStages();
    const stageOrder = activeStageOrder(stages);
    const currentIndex = stageOrder.indexOf(lead.stage);
    let newStage;

    if (targetStage !== undefined) {
      if (!stages.some((s) => s.key === targetStage)) {
        return { status: 400, jsonBody: { error: 'Unknown target stage' } };
      }
      if (targetStage === lead.stage) {
        return { status: 400, jsonBody: { error: 'Lead is already in that stage' } };
      }
      newStage = targetStage;
    } else if (action === 'lost') {
      if (lead.stage === LOST_STAGE) {
        return { status: 400, jsonBody: { error: 'Lead is already marked Lost' } };
      }
      newStage = LOST_STAGE;
    } else if (action === 'reopen') {
      if (lead.stage !== LOST_STAGE) {
        return { status: 400, jsonBody: { error: 'Only a Lost lead can be reopened' } };
      }
      newStage = REOPEN_STAGE;
    } else if (lead.stage === LOST_STAGE) {
      return { status: 400, jsonBody: { error: 'Reopen this lead before moving it forward or backward' } };
    } else if (action === 'forward') {
      if (currentIndex === -1 || currentIndex >= stageOrder.length - 1) {
        return { status: 400, jsonBody: { error: 'Lead is already at the final stage' } };
      }
      newStage = stageOrder[currentIndex + 1];
    } else {
      // backward
      if (currentIndex <= 0) {
        return { status: 400, jsonBody: { error: 'Lead is already at the first stage' } };
      }
      newStage = stageOrder[currentIndex - 1];
    }

    const now = new Date().toISOString();
    lead.stage = newStage;
    lead.updatedAt = now;
    lead.stageHistory.push({ stage: newStage, enteredAt: now });

    try {
      const { resource } = await leadsContainer.item(id, id).replace(lead);
      return { jsonBody: resource };
    } catch (err) {
      context.error('updateLeadStage failed', err);
      return { status: 500, jsonBody: { error: 'Failed to update stage' } };
    }
  },
});
