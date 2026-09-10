let config = null;
let leads = [];
let showArchived = false;
let activeLeadId = null;
let editingActionItemId = null;
let editingEventId = null;

async function init() {
  wireStaticEvents();
  try {
    config = await apiGet('/config');
    applyBrandFromConfig(config);
  } catch (err) {
    showToast('Could not load configuration: ' + err.message, true);
    return;
  }
  await loadLeads();
}

async function loadLeads() {
  try {
    leads = await apiGet(`/leads?archived=${showArchived}`);
    renderBoard();
  } catch (err) {
    showToast('Could not load leads: ' + err.message, true);
  }
}

function activeStages() {
  return config.stages.filter((s) => !s.terminal).sort((a, b) => a.order - b.order);
}

function terminalStages() {
  return config.stages.filter((s) => s.terminal).sort((a, b) => a.order - b.order);
}

function stageByKey(key) {
  return config.stages.find((s) => s.key === key);
}

function leadHasOverdue(lead) {
  // Action items carry a date, not a time -- "overdue" means before today's
  // calendar date, so a task due today doesn't flag as overdue mid-day.
  const todayStr = new Date().toISOString().slice(0, 10);
  return lead.actionItems.some((a) => !a.completed && a.dueDate.slice(0, 10) < todayStr);
}

function leadHasUpcomingCall(lead) {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 2);
  return lead.calendarEvents.some((e) => {
    const d = new Date(e.eventDate);
    return d >= now && d <= cutoff;
  });
}

function leadHasUpcomingActionDue(lead) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const cutoffStr = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return lead.actionItems.some((a) => {
    const d = a.dueDate.slice(0, 10);
    return !a.completed && d >= todayStr && d <= cutoffStr;
  });
}

function lastCommunication(lead) {
  if (!lead.communications.length) return null;
  return [...lead.communications].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
}

/* ---------------------------------------------------------------------
   Rendering
--------------------------------------------------------------------- */
function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  [...activeStages(), ...terminalStages()].forEach((stage) => {
    const leadsInStage = leads.filter((l) => l.stage === stage.key);
    board.appendChild(buildColumn(stage, leadsInStage));
  });

  renderBoardSummary();
}

function renderBoardSummary() {
  const summary = document.getElementById('boardSummary');
  const total = leads.reduce((sum, l) => sum + (l.dealValue || 0), 0);
  summary.innerHTML = `
    <span class="board-summary-label">Total pipeline value</span>
    <span class="board-summary-value">${formatCurrency(total)}</span>
    <span class="board-summary-count">${leads.length} lead${leads.length === 1 ? '' : 's'}</span>
  `;
}

function buildColumn(stage, leadsInStage) {
  const col = document.createElement('section');
  col.className = 'column' + (stage.terminal ? ' is-lost' : '');

  const stageTotal = leadsInStage.reduce((sum, l) => sum + (l.dealValue || 0), 0);

  const header = document.createElement('div');
  header.className = 'column-header';
  header.innerHTML = `
    <div class="column-header-top">
      ${stage.terminal ? '' : `<span class="column-number">${stage.order}</span>`}
      <span class="column-title">${escapeHtml(stage.label)}</span>
      <span class="column-count">${leadsInStage.length}</span>
    </div>
    <div class="column-subline">${stage.probability}% probability</div>
    <div class="column-total">${formatCurrency(stageTotal)}</div>
  `;
  col.appendChild(header);

  const body = document.createElement('div');
  body.className = 'column-body';
  if (leadsInStage.length === 0) {
    body.innerHTML = `<div class="column-empty">No leads here</div>`;
  } else {
    leadsInStage
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .forEach((lead) => body.appendChild(buildCard(lead)));
  }
  col.appendChild(body);

  body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    body.classList.add('drag-over');
  });
  body.addEventListener('dragleave', (e) => {
    if (!body.contains(e.relatedTarget)) body.classList.remove('drag-over');
  });
  body.addEventListener('drop', (e) => {
    e.preventDefault();
    body.classList.remove('drag-over');
    const leadId = e.dataTransfer.getData('text/plain');
    if (leadId) handleDropOnStage(leadId, stage);
  });

  return col;
}

function buildCard(lead) {
  const card = document.createElement('article');
  const isWin = lead.stage === 'win';
  const isLost = lead.stage === 'lost';
  card.className = 'card' + (isWin ? ' is-win' : '') + (isLost ? ' is-lost' : '');
  card.dataset.leadId = lead.id;
  card.draggable = true;

  const stage = stageByKey(lead.stage);
  const comm = lastCommunication(lead);
  const overdue = leadHasOverdue(lead);

  const badges = [];
  if (isWin) badges.push({ text: 'Won', cls: 'won' });
  if (isLost) badges.push({ text: 'Lost', cls: 'lost' });
  if (overdue) badges.push({ text: 'Overdue', cls: 'overdue' });
  if (leadHasUpcomingCall(lead)) badges.push({ text: 'Upcoming call', cls: 'upcoming' });
  if (leadHasUpcomingActionDue(lead)) badges.push({ text: 'Action due soon', cls: 'upcoming' });
  const badgesHtml = badges.slice(0, 5)
    .map((b) => `<span class="card-badge ${b.cls}">${escapeHtml(b.text)}</span>`)
    .join('');

  const activeIdx = activeStages().findIndex((s) => s.key === lead.stage);
  const isActiveStage = activeIdx !== -1;
  const canGoBack = isActiveStage && activeIdx > 0;
  const canGoForward = isActiveStage && activeIdx < activeStages().length - 1;

  let actionsHtml;
  if (lead.stage === 'lost') {
    actionsHtml = `<button class="btn-text" data-action="reopen" data-lead-id="${lead.id}">Reopen</button>`;
  } else {
    actionsHtml = `
      <div class="card-move-buttons">
        <button class="btn-icon" data-action="move-backward" data-lead-id="${lead.id}" ${canGoBack ? '' : 'disabled'} title="Move back a stage">&lsaquo;</button>
        <button class="btn-icon" data-action="move-forward" data-lead-id="${lead.id}" ${canGoForward ? '' : 'disabled'} title="Move forward a stage">&rsaquo;</button>
      </div>
      ${isWin ? '' : `<button class="btn-danger-text" data-action="mark-lost" data-lead-id="${lead.id}">Mark lost</button>`}
    `;
  }

  card.innerHTML = `
    <div class="card-top">
      <div class="card-company">${escapeHtml(lead.companyName)}</div>
    </div>
    ${badgesHtml ? `<div class="card-badges">${badgesHtml}</div>` : ''}
    ${lead.contactName ? `<div class="card-contact">${escapeHtml(lead.contactName)}</div>` : ''}
    ${lead.clientPartner ? `<div class="card-partner">Partner: ${escapeHtml(lead.clientPartner)}</div>` : ''}
    <div class="card-value">${formatCurrency(lead.dealValue)}</div>
    ${comm ? `<div class="card-last-comm">${escapeHtml(comm.type)}: ${escapeHtml(comm.description)}</div>` : ''}
    <div class="card-progress-track"><div class="card-progress-fill" style="width:${stage ? stage.probability : 0}%"></div></div>
    <div class="card-actions">${actionsHtml}</div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-action]')) return; // let button handlers below deal with it
    openLead(lead.id);
  });

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  return card;
}

/* ---------------------------------------------------------------------
   Stage move / archive actions (delegated on the board)
--------------------------------------------------------------------- */
async function handleStageAction(action, leadId) {
  try {
    await apiPatch(`/leads/${leadId}/stage`, { action });
    await loadLeads();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleDropOnStage(leadId, stage) {
  const lead = leads.find((l) => l.id === leadId);
  if (!lead || lead.stage === stage.key) return;
  if (stage.terminal && !confirm('Mark this lead as Lost?')) return;
  try {
    await apiPatch(`/leads/${leadId}/stage`, { targetStage: stage.key });
    await loadLeads();
  } catch (err) {
    showToast(err.message, true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});

function wireStaticEvents() {
  document.getElementById('board').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const leadId = btn.dataset.leadId;
    const action = btn.dataset.action;
    if (action === 'move-forward') handleStageAction('forward', leadId);
    if (action === 'move-backward') handleStageAction('backward', leadId);
    if (action === 'mark-lost') {
      if (confirm('Mark this lead as Lost?')) handleStageAction('lost', leadId);
    }
    if (action === 'reopen') handleStageAction('reopen', leadId);
  });

  document.getElementById('showArchivedToggle').addEventListener('change', (e) => {
    showArchived = e.target.checked;
    loadLeads();
  });

  document.getElementById('newLeadBtn').addEventListener('click', () => openModal('newLeadModal'));

  document.getElementById('newLeadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      companyName: form.companyName.value,
      contactName: form.contactName.value,
      contactEmail: form.contactEmail.value,
      contactPhone: form.contactPhone.value,
      clientPartner: form.clientPartner.value,
      dealValue: form.dealValue.value,
    };
    try {
      await apiPost('/leads', payload);
      form.reset();
      closeModal('newLeadModal');
      await loadLeads();
      showToast('Lead added');
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

/* ---------------------------------------------------------------------
   Lead detail modal
--------------------------------------------------------------------- */
function openLead(id) {
  activeLeadId = id;
  editingActionItemId = null;
  editingEventId = null;
  renderLeadModal();
  openModal('leadModal');
}

function currentLead() {
  return leads.find((l) => l.id === activeLeadId);
}

function renderLeadModal() {
  const lead = currentLead();
  if (!lead) return;
  const stage = stageByKey(lead.stage);

  document.getElementById('ldCompanyName').textContent = lead.companyName;

  const todayStr = new Date().toISOString().slice(0, 10);
  const sortedActions = [...lead.actionItems].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const sortedEvents = [...lead.calendarEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const sortedComms = [...lead.communications].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  document.getElementById('leadModalBody').innerHTML = `
    <div class="modal-section">
      <div class="lead-summary-grid">
        <div class="lead-summary-field"><span class="label">Stage</span>${escapeHtml(stage ? stage.label : lead.stage)} (${stage ? stage.probability : 0}%)</div>
        <div class="lead-summary-field"><span class="label">Deal value</span>${formatCurrency(lead.dealValue)}</div>
        <div class="lead-summary-field"><span class="label">Contact</span>${escapeHtml(lead.contactName) || '&mdash;'}</div>
        <div class="lead-summary-field"><span class="label">Email</span>${escapeHtml(lead.contactEmail) || '&mdash;'}</div>
        <div class="lead-summary-field"><span class="label">Phone</span>${escapeHtml(lead.contactPhone) || '&mdash;'}</div>
        <div class="lead-summary-field"><span class="label">Client Partner</span>${escapeHtml(lead.clientPartner) || '&mdash;'}</div>
        <div class="lead-summary-field"><span class="label">Created</span>${formatDate(lead.createdAt)}</div>
      </div>
      <button class="btn-text" data-toggle="editLeadForm" style="padding-left:0;">Edit details</button>
      <form id="editLeadForm" class="hidden" style="margin-top:10px;">
        <div class="field-row">
          <div class="field"><label>Company</label><input name="companyName" value="${escapeHtml(lead.companyName)}" /></div>
          <div class="field"><label>Deal value ($)</label><input name="dealValue" type="number" min="0" step="1000" value="${lead.dealValue}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Contact name</label><input name="contactName" value="${escapeHtml(lead.contactName)}" /></div>
          <div class="field"><label>Contact email</label><input name="contactEmail" value="${escapeHtml(lead.contactEmail)}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Contact phone</label><input name="contactPhone" value="${escapeHtml(lead.contactPhone)}" /></div>
          <div class="field"><label>Client Partner</label><input name="clientPartner" value="${escapeHtml(lead.clientPartner)}" /></div>
        </div>
        <div class="field-row">
          <div class="field" style="display:flex;align-items:flex-end;"><button type="submit" class="btn btn-secondary">Save</button></div>
        </div>
      </form>
    </div>

    <div class="modal-section">
      <div class="modal-section-header"><h3>Action items</h3></div>
      <ul class="detail-list">
        ${sortedActions.length ? sortedActions.map((a) => a.id === editingActionItemId ? `
          <li class="detail-item">
            <form class="inline-add-form" data-edit-action-form="${a.id}">
              <input class="grow" name="description" value="${escapeHtml(a.description)}" required />
              <input name="dueDate" type="date" value="${a.dueDate.slice(0, 10)}" required style="width:150px;" />
              <button type="submit" class="btn btn-secondary">Save</button>
              <button type="button" class="btn-text" data-cancel-edit-action="${a.id}">Cancel</button>
            </form>
          </li>` : `
          <li class="detail-item ${!a.completed && a.dueDate.slice(0, 10) < todayStr ? 'overdue' : ''} ${a.completed ? 'completed' : ''}">
            <div class="detail-item-top">
              <label style="display:flex;gap:6px;align-items:flex-start;font-weight:400;">
                <input type="checkbox" data-toggle-action="${a.id}" ${a.completed ? 'checked' : ''} style="width:auto;margin-top:2px;" />
                <span class="detail-item-title">${escapeHtml(a.description)}</span>
              </label>
              <span style="display:flex;align-items:center;gap:6px;">
                <span class="detail-item-meta">Due ${formatDate(a.dueDate)}</span>
                <button class="btn-text" data-edit-action="${a.id}" style="padding:0;">Edit</button>
              </span>
            </div>
          </li>`).join('') : '<li class="detail-item" style="color:var(--color-text-muted);border-style:dashed;">No action items yet</li>'}
      </ul>
      <form id="addActionForm" class="inline-add-form">
        <input class="grow" name="description" placeholder="What needs to happen?" required />
        <input name="dueDate" type="date" required style="width:150px;" />
        <button type="submit" class="btn btn-secondary">Add</button>
      </form>
    </div>

    <div class="modal-section">
      <div class="modal-section-header"><h3>Calendar events</h3></div>
      <ul class="detail-list">
        ${sortedEvents.length ? sortedEvents.map((ev) => ev.id === editingEventId ? `
          <li class="detail-item">
            <form class="inline-add-form" data-edit-event-form="${ev.id}" style="flex-wrap:wrap;">
              <input class="grow" name="title" value="${escapeHtml(ev.title)}" required />
              <input name="eventDate" type="datetime-local" value="${toDatetimeLocalValue(ev.eventDate)}" required style="width:190px;" />
              <input class="grow" name="notes" placeholder="Notes (optional)" value="${escapeHtml(ev.notes || '')}" />
              <button type="submit" class="btn btn-secondary">Save</button>
              <button type="button" class="btn-text" data-cancel-edit-event="${ev.id}">Cancel</button>
            </form>
          </li>` : `
          <li class="detail-item">
            <div class="detail-item-top">
              <span class="detail-item-title">${escapeHtml(ev.title)}</span>
              <span style="display:flex;align-items:center;gap:6px;">
                <span class="detail-item-meta">${formatDateTime(ev.eventDate)}</span>
                <button class="btn-text" data-edit-event="${ev.id}" style="padding:0;">Edit</button>
              </span>
            </div>
            ${ev.notes ? `<div class="detail-item-meta">${escapeHtml(ev.notes)}</div>` : ''}
          </li>`).join('') : '<li class="detail-item" style="color:var(--color-text-muted);border-style:dashed;">No events scheduled</li>'}
      </ul>
      <form id="addEventForm" class="inline-add-form">
        <input class="grow" name="title" placeholder="e.g. Follow-up call" required />
        <input name="eventDate" type="datetime-local" required style="width:190px;" />
        <button type="submit" class="btn btn-secondary">Add</button>
      </form>
    </div>

    <div class="modal-section">
      <div class="modal-section-header"><h3>Last communication</h3></div>
      ${sortedComms.length ? `
        <div class="detail-item" style="margin-bottom:8px;">
          <div class="detail-item-top">
            <span class="detail-item-title">${escapeHtml(sortedComms[0].type)}</span>
            <span class="detail-item-meta">${formatDateTime(sortedComms[0].occurredAt)}</span>
          </div>
          <div style="margin-top:4px;">${escapeHtml(sortedComms[0].description)}</div>
        </div>
        ${sortedComms.length > 1 ? `
          <details>
            <summary class="btn-text" style="cursor:pointer;">View ${sortedComms.length - 1} earlier communication(s)</summary>
            <ul class="detail-list" style="margin-top:8px;">
              ${sortedComms.slice(1).map((c) => `
                <li class="detail-item">
                  <div class="detail-item-top">
                    <span class="detail-item-title">${escapeHtml(c.type)}</span>
                    <span class="detail-item-meta">${formatDateTime(c.occurredAt)}</span>
                  </div>
                  <div style="margin-top:4px;">${escapeHtml(c.description)}</div>
                </li>`).join('')}
            </ul>
          </details>` : ''}
      ` : '<p style="color:var(--color-text-muted);font-size:12px;">No communications logged yet</p>'}
      <form id="addCommForm" class="inline-add-form" style="margin-top:10px;">
        <select name="type" style="width:110px;">
          <option>Call</option>
          <option>Email</option>
          <option>Text</option>
          <option>Other</option>
        </select>
        <textarea class="grow" name="description" placeholder="What was discussed?" rows="1" required></textarea>
        <button type="submit" class="btn btn-secondary">Log</button>
      </form>
    </div>

    <div class="modal-section">
      <div class="modal-section-header"><h3>Stage history</h3></div>
      <div class="stage-history">
        ${[...lead.stageHistory].reverse().map((h) => `${formatDateTime(h.enteredAt)} &mdash; ${escapeHtml(stageByKey(h.stage) ? stageByKey(h.stage).label : h.stage)}`).join('<br/>')}
      </div>
    </div>
  `;

  document.getElementById('leadModalFooter').innerHTML = `
    <button class="btn-danger-text" data-action="delete" style="margin-right:auto;">Delete lead</button>
    <button class="btn btn-secondary" data-action="${lead.archived ? 'restore' : 'archive'}">${lead.archived ? 'Restore lead' : 'Archive lead'}</button>
    <button class="btn btn-secondary" data-close="leadModal">Close</button>
  `;

  wireLeadModalEvents(lead);
}

function wireLeadModalEvents(lead) {
  const body = document.getElementById('leadModalBody');
  const footer = document.getElementById('leadModalFooter');

  const editToggle = body.querySelector('[data-toggle="editLeadForm"]');
  if (editToggle) {
    editToggle.addEventListener('click', () => {
      document.getElementById('editLeadForm').classList.toggle('hidden');
    });
  }

  const editForm = document.getElementById('editLeadForm');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await apiPatch(`/leads/${lead.id}`, {
          companyName: f.companyName.value,
          contactName: f.contactName.value,
          contactEmail: f.contactEmail.value,
          contactPhone: f.contactPhone.value,
          clientPartner: f.clientPartner.value,
          dealValue: f.dealValue.value,
        });
        await loadLeads();
        renderLeadModal();
        showToast('Lead updated');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  body.querySelectorAll('[data-toggle-action]').forEach((checkbox) => {
    checkbox.addEventListener('change', async (e) => {
      try {
        await apiPatch(`/leads/${lead.id}/actions/${e.target.dataset.toggleAction}`, { completed: e.target.checked });
        await loadLeads();
        renderLeadModal();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  body.querySelectorAll('[data-edit-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingActionItemId = btn.dataset.editAction;
      renderLeadModal();
    });
  });

  body.querySelectorAll('[data-cancel-edit-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingActionItemId = null;
      renderLeadModal();
    });
  });

  body.querySelectorAll('[data-edit-action-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await apiPatch(`/leads/${lead.id}/actions/${form.dataset.editActionForm}`, {
          description: f.description.value,
          dueDate: f.dueDate.value,
        });
        editingActionItemId = null;
        await loadLeads();
        renderLeadModal();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  const addActionForm = document.getElementById('addActionForm');
  if (addActionForm) {
    addActionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await apiPost(`/leads/${lead.id}/actions`, { description: f.description.value, dueDate: f.dueDate.value });
        await loadLeads();
        renderLeadModal();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  const addEventForm = document.getElementById('addEventForm');
  if (addEventForm) {
    addEventForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await apiPost(`/leads/${lead.id}/events`, { title: f.title.value, eventDate: new Date(f.eventDate.value).toISOString() });
        await loadLeads();
        renderLeadModal();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  body.querySelectorAll('[data-edit-event]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingEventId = btn.dataset.editEvent;
      renderLeadModal();
    });
  });

  body.querySelectorAll('[data-cancel-edit-event]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingEventId = null;
      renderLeadModal();
    });
  });

  body.querySelectorAll('[data-edit-event-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await apiPatch(`/leads/${lead.id}/events/${form.dataset.editEventForm}`, {
          title: f.title.value,
          eventDate: new Date(f.eventDate.value).toISOString(),
          notes: f.notes.value,
        });
        editingEventId = null;
        await loadLeads();
        renderLeadModal();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  const addCommForm = document.getElementById('addCommForm');
  if (addCommForm) {
    addCommForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await apiPost(`/leads/${lead.id}/communications`, { type: f.type.value, description: f.description.value });
        await loadLeads();
        renderLeadModal();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  footer.querySelectorAll('[data-action]').forEach((btn) => {
    if (btn.dataset.action === 'delete') {
      btn.addEventListener('click', () => openDeleteLeadConfirm(lead));
      return;
    }
    btn.addEventListener('click', async () => {
      const archived = btn.dataset.action === 'archive';
      try {
        await apiPatch(`/leads/${lead.id}/archive`, { archived });
        closeModal('leadModal');
        await loadLeads();
        showToast(archived ? 'Lead archived' : 'Lead restored');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

/* ---------------------------------------------------------------------
   Delete lead (permanent) -- requires typing the exact company name
--------------------------------------------------------------------- */
function openDeleteLeadConfirm(lead) {
  document.getElementById('dlCompanyName').textContent = lead.companyName;
  const input = document.getElementById('dlConfirmInput');
  const confirmBtn = document.getElementById('dlConfirmBtn');
  input.value = '';
  confirmBtn.disabled = true;

  input.oninput = () => {
    confirmBtn.disabled = input.value !== lead.companyName;
  };

  confirmBtn.onclick = async () => {
    if (input.value !== lead.companyName) return;
    confirmBtn.disabled = true;
    try {
      await apiDelete(`/leads/${lead.id}`);
      closeModal('deleteLeadModal');
      closeModal('leadModal');
      await loadLeads();
      showToast('Lead deleted');
    } catch (err) {
      showToast(err.message, true);
      confirmBtn.disabled = false;
    }
  };

  openModal('deleteLeadModal');
  input.focus();
}
