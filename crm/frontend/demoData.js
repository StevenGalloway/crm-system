/* Local demo backend -- only used as a fallback when /api/* isn't reachable
   (e.g. previewing this HTML directly, with no Function App behind it).
   Once deployed for real against Cosmos DB, this file is never invoked. */

(function () {
  let seq = 1;
  function uid() {
    return `demo-${seq++}`;
  }

  const config = {
    id: 'app-config',
    type: 'config',
    stages: [
      { key: 'qualification', label: 'Qualification', probability: 10, order: 1 },
      { key: 'discovery', label: 'Discovery', probability: 20, order: 2 },
      { key: 'validation', label: 'Validation', probability: 50, order: 3 },
      { key: 'decision_due', label: 'Decision Due', probability: 75, order: 4 },
      { key: 'pending_sale', label: 'Pending Sale', probability: 90, order: 5 },
      { key: 'win', label: 'Win', probability: 100, order: 6 },
      { key: 'lost', label: 'Lost', probability: 0, order: 99, terminal: true },
    ],
    brand: {
      colors: {
        brightRed: '#BD3039',
        midnightBlue: '#0C2340',
        slateBlue: '#4E738A',
        black: '#000000',
        white: '#FFFFFF',
        grayDark: '#323E48',
        grayMedium: '#A2A9AD',
        grayLight: '#CFD2D3',
      },
      logos: {
        full: 'assets/fenway-logo-full.png',
        icon: 'assets/fenway-logo-icon.png',
      },
    },
    notifications: { lookaheadBusinessDays: 5 },
  };

  function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString();
  }

  function seedLeads() {
    const now = new Date().toISOString();
    return [
      {
        id: uid(), type: 'lead', companyName: 'Harbor Freight Logistics', contactName: 'Dana Reyes',
        contactEmail: 'dana@harborfreight.example', contactPhone: '555-0101',
        dealValue: 84000, stage: 'validation', archived: false, createdAt: now, updatedAt: now,
        stageHistory: [
          { stage: 'qualification', enteredAt: daysFromNow(-20) },
          { stage: 'discovery', enteredAt: daysFromNow(-12) },
          { stage: 'validation', enteredAt: daysFromNow(-3) },
        ],
        actionItems: [
          { id: uid(), description: 'Send updated SOW', dueDate: daysFromNow(-1), completed: false, createdAt: now, completedAt: null },
          { id: uid(), description: 'Confirm security review scope', dueDate: daysFromNow(2), completed: false, createdAt: now, completedAt: null },
        ],
        calendarEvents: [
          { id: uid(), title: 'Follow-up call', eventDate: daysFromNow(3), notes: 'Discuss timeline', createdAt: now },
        ],
        communications: [
          { id: uid(), type: 'Call', description: 'Walked through architecture options; they want a follow-up with their security team before moving forward.', occurredAt: daysFromNow(-2), createdAt: now },
        ],
      },
      {
        id: uid(), type: 'lead', companyName: 'Northgate Credit Union', contactName: 'Marcus Ito',
        contactEmail: 'mito@northgate.example', contactPhone: '555-0110',
        dealValue: 152000, stage: 'decision_due', archived: false, createdAt: now, updatedAt: now,
        stageHistory: [{ stage: 'qualification', enteredAt: daysFromNow(-30) }],
        actionItems: [
          { id: uid(), description: 'Prep final pricing deck', dueDate: daysFromNow(1), completed: false, createdAt: now, completedAt: null },
        ],
        calendarEvents: [],
        communications: [
          { id: uid(), type: 'Email', description: 'Sent revised proposal reflecting board feedback on payment terms.', occurredAt: daysFromNow(-1), createdAt: now },
        ],
      },
      {
        id: uid(), type: 'lead', companyName: 'Bluepoint Retail Fuels', contactName: 'Priya Nair',
        contactEmail: 'priya@bluepoint.example', contactPhone: '555-0134',
        dealValue: 41000, stage: 'qualification', archived: false, createdAt: now, updatedAt: now,
        stageHistory: [{ stage: 'qualification', enteredAt: daysFromNow(-1) }],
        actionItems: [], calendarEvents: [], communications: [],
      },
      {
        id: uid(), type: 'lead', companyName: 'Ashford Rail & Transport', contactName: 'Wes Coleman',
        contactEmail: 'wes@ashford.example', contactPhone: '555-0177',
        dealValue: 96000, stage: 'win', archived: false, createdAt: now, updatedAt: now,
        stageHistory: [{ stage: 'qualification', enteredAt: daysFromNow(-45) }],
        actionItems: [], calendarEvents: [],
        communications: [{ id: uid(), type: 'Call', description: 'Signed. Kickoff scheduled for next sprint.', occurredAt: daysFromNow(-1), createdAt: now }],
      },
      {
        id: uid(), type: 'lead', companyName: 'Coastal Regional Bank', contactName: 'Elena Cho',
        contactEmail: 'elena@coastalregional.example', contactPhone: '555-0192',
        dealValue: 63000, stage: 'lost', archived: false, createdAt: now, updatedAt: now,
        stageHistory: [{ stage: 'qualification', enteredAt: daysFromNow(-60) }],
        actionItems: [], calendarEvents: [],
        communications: [{ id: uid(), type: 'Email', description: 'Went with an incumbent vendor for this budget cycle.', occurredAt: daysFromNow(-4), createdAt: now }],
      },
    ];
  }

  let leads = seedLeads();

  function findLead(id) {
    const lead = leads.find((l) => l.id === id);
    if (!lead) throw new Error('Lead not found');
    return lead;
  }

  const STAGE_ORDER = config.stages
    .filter((s) => !s.terminal)
    .sort((a, b) => a.order - b.order)
    .map((s) => s.key);

  function addBusinessDays(startDate, numDays) {
    const result = new Date(startDate);
    let added = 0;
    while (added < numDays) {
      result.setDate(result.getDate() + 1);
      const day = result.getDay();
      if (day !== 0 && day !== 6) added++;
    }
    return result;
  }

  window.DemoApi = {
    getConfig: () => config,

    getLeads: (archived) => leads.filter((l) => l.archived === archived),

    createLead: (body) => {
      if (!body.companyName || !body.companyName.trim()) throw new Error('companyName is required');
      const now = new Date().toISOString();
      const lead = {
        id: uid(), type: 'lead', companyName: body.companyName.trim(),
        contactName: body.contactName || '', contactEmail: body.contactEmail || '',
        contactPhone: body.contactPhone || '', dealValue: Number(body.dealValue) || 0,
        stage: 'qualification', archived: false, createdAt: now, updatedAt: now,
        stageHistory: [{ stage: 'qualification', enteredAt: now }],
        actionItems: [], calendarEvents: [], communications: [],
      };
      leads.unshift(lead);
      return lead;
    },

    updateLead: (id, body) => {
      const lead = findLead(id);
      ['companyName', 'contactName', 'contactEmail', 'contactPhone', 'dealValue'].forEach((f) => {
        if (body[f] !== undefined) lead[f] = f === 'dealValue' ? Number(body[f]) || 0 : body[f];
      });
      lead.updatedAt = new Date().toISOString();
      return lead;
    },

    updateStage: (id, action) => {
      const lead = findLead(id);
      const idx = STAGE_ORDER.indexOf(lead.stage);
      if (action === 'lost') {
        if (lead.stage === 'lost') throw new Error('Already Lost');
        lead.stage = 'lost';
      } else if (action === 'reopen') {
        if (lead.stage !== 'lost') throw new Error('Only a Lost lead can be reopened');
        lead.stage = 'qualification';
      } else if (lead.stage === 'lost') {
        throw new Error('Reopen this lead before moving it');
      } else if (action === 'forward') {
        if (idx >= STAGE_ORDER.length - 1) throw new Error('Already at the final stage');
        lead.stage = STAGE_ORDER[idx + 1];
      } else if (action === 'backward') {
        if (idx <= 0) throw new Error('Already at the first stage');
        lead.stage = STAGE_ORDER[idx - 1];
      }
      lead.updatedAt = new Date().toISOString();
      lead.stageHistory.push({ stage: lead.stage, enteredAt: lead.updatedAt });
      return lead;
    },

    archiveLead: (id, archived) => {
      const lead = findLead(id);
      lead.archived = archived;
      lead.updatedAt = new Date().toISOString();
      return lead;
    },

    addActionItem: (id, body) => {
      const lead = findLead(id);
      if (!body.description || !body.dueDate) throw new Error('description and dueDate are required');
      lead.actionItems.push({
        id: uid(), description: body.description, dueDate: body.dueDate,
        completed: false, createdAt: new Date().toISOString(), completedAt: null,
      });
      lead.updatedAt = new Date().toISOString();
      return lead;
    },

    completeActionItem: (id, actionId, completed) => {
      const lead = findLead(id);
      const item = lead.actionItems.find((a) => a.id === actionId);
      if (!item) throw new Error('Action item not found');
      item.completed = completed;
      item.completedAt = completed ? new Date().toISOString() : null;
      lead.updatedAt = new Date().toISOString();
      return lead;
    },

    addEvent: (id, body) => {
      const lead = findLead(id);
      if (!body.title || !body.eventDate) throw new Error('title and eventDate are required');
      lead.calendarEvents.push({
        id: uid(), title: body.title, eventDate: body.eventDate,
        notes: body.notes || '', createdAt: new Date().toISOString(),
      });
      lead.updatedAt = new Date().toISOString();
      return lead;
    },

    addCommunication: (id, body) => {
      const lead = findLead(id);
      if (!body.type || !body.description) throw new Error('type and description are required');
      lead.communications.push({
        id: uid(), type: body.type, description: body.description,
        occurredAt: body.occurredAt || new Date().toISOString(), createdAt: new Date().toISOString(),
      });
      lead.updatedAt = new Date().toISOString();
      return lead;
    },

    getCalendarFeed: (days) => {
      const now = new Date();
      const cutoff = addBusinessDays(now, days);
      const nowIso = now.toISOString();
      const cutoffIso = cutoff.toISOString();
      const todayDateStr = nowIso.slice(0, 10);
      const cutoffDateStr = cutoffIso.slice(0, 10);
      const overdueActionItems = [];
      const upcomingActionItems = [];
      const upcomingEvents = [];

      leads.filter((l) => !l.archived).forEach((l) => {
        l.actionItems.filter((a) => !a.completed && a.dueDate.slice(0, 10) <= cutoffDateStr).forEach((a) => {
          const row = { leadId: l.id, companyName: l.companyName, actionId: a.id, description: a.description, dueDate: a.dueDate };
          (a.dueDate.slice(0, 10) < todayDateStr ? overdueActionItems : upcomingActionItems).push(row);
        });
        l.calendarEvents.filter((e) => e.eventDate >= nowIso && e.eventDate <= cutoffIso).forEach((e) => {
          upcomingEvents.push({ leadId: l.id, companyName: l.companyName, eventId: e.id, title: e.title, eventDate: e.eventDate, notes: e.notes });
        });
      });

      overdueActionItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      upcomingActionItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      upcomingEvents.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
      return { overdueActionItems, upcomingActionItems, upcomingEvents };
    },
  };
})();
