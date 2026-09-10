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
    clientPartners: ['Sam Whitfield', 'Renee Ashby', 'Jordan Blake'],
    contactOwners: [
      { name: 'Sam Whitfield', slackUserId: 'U0DEMO001' },
      { name: 'Renee Ashby', slackUserId: 'U0DEMO002' },
    ],
    notificationSchedule: { frequency: 'daily', time: '08:00', dayOfWeek: 1, dayOfMonth: 1 },
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
        contactEmail: 'dana@harborfreight.example', contactPhone: '555-0101', clientPartner: 'Sam Whitfield',
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
        contactEmail: 'mito@northgate.example', contactPhone: '555-0110', clientPartner: 'Renee Ashby',
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

  let otherItems = [
    { id: uid(), description: 'Renew G2 review campaign', dueDate: daysFromNow(1).slice(0, 10), completed: false, createdAt: new Date().toISOString(), completedAt: null },
    { id: uid(), description: 'Update BD pipeline deck for leadership review', dueDate: daysFromNow(-2).slice(0, 10), completed: false, createdAt: new Date().toISOString(), completedAt: null },
    { id: uid(), description: 'Old finished task (should roll off)', dueDate: daysFromNow(-15).slice(0, 10), completed: true, createdAt: new Date().toISOString(), completedAt: daysFromNow(-14) },
  ];

  function findOtherItem(itemId) {
    const item = otherItems.find((i) => i.id === itemId);
    if (!item) throw new Error('Item not found');
    return item;
  }

  let recurringTasks = [
    { id: uid(), description: 'Weekly pipeline review', cadence: 'weekly', anchorDate: daysFromNow(-14).slice(0, 10), active: true, lastGeneratedDate: null, createdAt: new Date().toISOString() },
    { id: uid(), description: 'Monthly BD newsletter draft', cadence: 'monthly', anchorDate: daysFromNow(1).slice(0, 10), active: true, lastGeneratedDate: null, createdAt: new Date().toISOString() },
  ];

  function findRecurringTask(taskId) {
    const task = recurringTasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Recurring task not found');
    return task;
  }

  function addPeriod(dateStr, cadence) {
    const d = new Date(dateStr + 'T00:00:00');
    if (cadence === 'daily') d.setDate(d.getDate() + 1);
    else if (cadence === 'weekly') d.setDate(d.getDate() + 7);
    else if (cadence === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (cadence === 'quarterly') d.setMonth(d.getMonth() + 3);
    else if (cadence === 'annually') d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }

  function nextDueOccurrence(template, todayStr) {
    let occStr = template.lastGeneratedDate ? addPeriod(template.lastGeneratedDate, template.cadence) : template.anchorDate;
    let due = null;
    let guard = 0;
    while (occStr <= todayStr && guard < 1000) {
      due = occStr;
      occStr = addPeriod(occStr, template.cadence);
      guard++;
    }
    return due;
  }

  let contacts = [
    { id: uid(), name: 'Jane Doe', nextOutreachDate: daysFromNow(1).slice(0, 10), nextOutreachAction: 'Follow up on pricing questions from last call', contactOwner: 'Sam Whitfield', outreachNotifiedFor: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: uid(), name: 'Mike Chen', nextOutreachDate: daysFromNow(-1).slice(0, 10), nextOutreachAction: 'Send updated proposal', contactOwner: 'Renee Ashby', outreachNotifiedFor: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  function findContact(contactId) {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) throw new Error('Contact not found');
    return contact;
  }

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

    updateConfig: (body) => {
      if (Array.isArray(body.clientPartners)) {
        const removed = (config.clientPartners || []).filter((n) => !body.clientPartners.includes(n));
        leads.forEach((l) => {
          if (removed.includes(l.clientPartner)) l.clientPartner = '';
        });
      }
      Object.assign(config, body);
      return config;
    },

    getLeads: (archived) => leads.filter((l) => l.archived === archived),

    createLead: (body) => {
      if (!body.companyName || !body.companyName.trim()) throw new Error('companyName is required');
      const now = new Date().toISOString();
      const lead = {
        id: uid(), type: 'lead', companyName: body.companyName.trim(),
        contactName: body.contactName || '', contactEmail: body.contactEmail || '',
        contactPhone: body.contactPhone || '', clientPartner: body.clientPartner || '',
        dealValue: Number(body.dealValue) || 0,
        stage: 'qualification', archived: false, createdAt: now, updatedAt: now,
        stageHistory: [{ stage: 'qualification', enteredAt: now }],
        actionItems: [], calendarEvents: [], communications: [],
      };
      leads.unshift(lead);
      return lead;
    },

    updateLead: (id, body) => {
      const lead = findLead(id);
      ['companyName', 'contactName', 'contactEmail', 'contactPhone', 'clientPartner', 'dealValue'].forEach((f) => {
        if (body[f] !== undefined) lead[f] = f === 'dealValue' ? Number(body[f]) || 0 : body[f];
      });
      lead.updatedAt = new Date().toISOString();
      return lead;
    },

    updateStage: (id, action, targetStage) => {
      const lead = findLead(id);
      const idx = STAGE_ORDER.indexOf(lead.stage);
      if (targetStage !== undefined) {
        if (!config.stages.some((s) => s.key === targetStage)) throw new Error('Unknown target stage');
        if (targetStage === lead.stage) throw new Error('Lead is already in that stage');
        lead.stage = targetStage;
      } else if (action === 'lost') {
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

    deleteLead: (id) => {
      findLead(id);
      leads = leads.filter((l) => l.id !== id);
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

    updateActionItem: (id, actionId, body) => {
      const lead = findLead(id);
      const item = lead.actionItems.find((a) => a.id === actionId);
      if (!item) throw new Error('Action item not found');
      if (body.description !== undefined) {
        if (!body.description.trim()) throw new Error('description cannot be empty');
        item.description = body.description.trim();
      }
      if (body.dueDate !== undefined) {
        if (!body.dueDate) throw new Error('dueDate cannot be empty');
        item.dueDate = body.dueDate;
      }
      if (body.completed !== undefined) {
        item.completed = body.completed !== false;
        item.completedAt = item.completed ? new Date().toISOString() : null;
      }
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

    updateEvent: (id, eventId, body) => {
      const lead = findLead(id);
      const ev = lead.calendarEvents.find((e) => e.id === eventId);
      if (!ev) throw new Error('Calendar event not found');
      if (body.title !== undefined) {
        if (!body.title.trim()) throw new Error('title cannot be empty');
        ev.title = body.title.trim();
      }
      if (body.eventDate !== undefined) {
        if (!body.eventDate) throw new Error('eventDate cannot be empty');
        ev.eventDate = body.eventDate;
      }
      if (body.notes !== undefined) {
        ev.notes = body.notes;
      }
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

    getOtherItems: () => otherItems,

    addOtherItem: (body) => {
      if (!body.description || !body.dueDate) throw new Error('description and dueDate are required');
      otherItems.push({
        id: uid(), description: body.description, dueDate: body.dueDate,
        completed: false, createdAt: new Date().toISOString(), completedAt: null,
      });
      return otherItems;
    },

    updateOtherItem: (itemId, body) => {
      const item = findOtherItem(itemId);
      if (body.description !== undefined) {
        if (!body.description.trim()) throw new Error('description cannot be empty');
        item.description = body.description.trim();
      }
      if (body.dueDate !== undefined) {
        if (!body.dueDate) throw new Error('dueDate cannot be empty');
        item.dueDate = body.dueDate;
      }
      if (body.completed !== undefined) {
        item.completed = body.completed !== false;
        item.completedAt = item.completed ? new Date().toISOString() : null;
      }
      return otherItems;
    },

    deleteOtherItem: (itemId) => {
      findOtherItem(itemId);
      otherItems = otherItems.filter((i) => i.id !== itemId);
      return otherItems;
    },

    getRecurringTasks: () => recurringTasks,

    addRecurringTask: (body) => {
      if (!body.description || !body.cadence || !body.anchorDate) throw new Error('description, cadence, and anchorDate are required');
      recurringTasks.push({
        id: uid(), description: body.description, cadence: body.cadence, anchorDate: body.anchorDate,
        active: true, lastGeneratedDate: null, createdAt: new Date().toISOString(),
      });
      return recurringTasks;
    },

    updateRecurringTask: (taskId, body) => {
      const task = findRecurringTask(taskId);
      if (body.description !== undefined) task.description = body.description;
      if (body.cadence !== undefined) task.cadence = body.cadence;
      if (body.anchorDate !== undefined) task.anchorDate = body.anchorDate;
      if (body.active !== undefined) task.active = body.active !== false;
      return recurringTasks;
    },

    deleteRecurringTask: (taskId) => {
      findRecurringTask(taskId);
      recurringTasks = recurringTasks.filter((t) => t.id !== taskId);
      return recurringTasks;
    },

    testRecurringTaskGenerator: () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const generated = [];
      recurringTasks.filter((t) => t.active).forEach((template) => {
        const due = nextDueOccurrence(template, todayStr);
        if (!due) return;
        template.lastGeneratedDate = due;
        const item = {
          id: uid(), description: template.description, dueDate: due,
          completed: false, createdAt: new Date().toISOString(), completedAt: null,
          recurringTaskId: template.id,
        };
        otherItems.push(item);
        generated.push(item);
      });
      return { generated };
    },

    getContacts: () => contacts,

    addContact: (body) => {
      if (!body.name || !body.nextOutreachDate) throw new Error('name and nextOutreachDate are required');
      contacts.push({
        id: uid(), name: body.name, nextOutreachDate: body.nextOutreachDate, nextOutreachAction: body.nextOutreachAction || '',
        contactOwner: body.contactOwner || '',
        outreachNotifiedFor: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      return contacts;
    },

    updateContact: (contactId, body) => {
      const contact = findContact(contactId);
      if (body.name !== undefined) contact.name = body.name;
      if (body.nextOutreachDate !== undefined) contact.nextOutreachDate = body.nextOutreachDate;
      if (body.nextOutreachAction !== undefined) contact.nextOutreachAction = body.nextOutreachAction;
      if (body.contactOwner !== undefined) contact.contactOwner = body.contactOwner;
      contact.updatedAt = new Date().toISOString();
      return contacts;
    },

    deleteContact: (contactId) => {
      findContact(contactId);
      contacts = contacts.filter((c) => c.id !== contactId);
      return contacts;
    },

    testOutreachNotifier: () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 2);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const due = contacts.filter((c) => c.nextOutreachDate <= cutoffStr && c.outreachNotifiedFor !== c.nextOutreachDate);
      return {
        sent: [],
        skipped: [],
        reason: due.length
          ? `Demo mode -- ${due.length} contact(s) would be due, but Slack DMs aren't simulated locally. Deploy with SLACK_BOT_TOKEN set to test for real.`
          : 'Nothing due in the outreach window',
      };
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
