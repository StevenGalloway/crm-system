let config = null;
let leads = [];
let showArchived = false;
let activeLeadId = null;

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
}

function buildColumn(stage, leadsInStage) {
  const col = document.createElement('section');
  col.className = 'column' + (stage.terminal ? ' is-lost' : '');

  const header = document.createElement('div');
  header.className = 'column-header';
  header.innerHTML = `
    <div class="column-header-top">
      ${stage.terminal ? '' : `<span class="column-number">${stage.order}</span>`}
      <span class="column-title">${escapeHtml(stage.label)}</span>
      <span class="column-count">${leadsInStage.length}</span>
    </div>
    <div class="column-subline">${stage.probability}% probability</div>
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
  return col;
}

function buildCard(lead) {
  const card = document.createElement('article');
  const isWin = lead.stage === 'win';
  const isLost = lead.stage === 'lost';
  card.className = 'card' + (isWin ? ' is-win' : '') + (isLost ? ' is-lost' : '');
  card.dataset.leadId = lead.id;

  const stage = stageByKey(lead.stage);
  const comm = lastCommunication(lead);
  const overdue = leadHasOverdue(lead);

  let badge = '';
  if (isWin) badge = '<span class="card-badge won">Won</span>';
  else if (isLost) badge = '<span class="card-badge lost">Lost</span>';
  else if (overdue) badge = '<span class="card-badge overdue">Overdue</span>';

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
      ${badge}
    </div>
    ${lead.contactName ? `<div class="card-contact">${escapeHtml(lead.contactName)}</div>` : ''}
    <div class="card-value">${formatCurrency(lead.dealValue)}</div>
    ${comm ? `<div class="card-last-comm">${escapeHtml(comm.type)}: ${escapeHtml(comm.description)}</div>` : ''}
    <div class="card-progress-track"><div class="card-progress-fill" style="width:${stage ? stage.probability : 0}%"></div></div>
    <div class="card-actions">${actionsHtml}</div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-action]')) return; // let button handlers below deal with it
    openLead(lead.id);
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

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  document.getElementById('newLeadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      companyName: form.companyName.value,
      contactName: form.contactName.value,
      contactEmail: form.contactEmail.value,
      contactPhone: form.contactPhone.value,
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

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (id === 'leadModal') activeLeadId = null;
}

/* ---------------------------------------------------------------------
   Lead detail modal
--------------------------------------------------------------------- */
function openLead(id) {
  activeLeadId = id;
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
          <div class="field" style="display:flex;align-items:flex-end;"><button type="submit" class="btn btn-secondary">Save</button></div>
        </div>
      </form>
    </div>

    <div class="modal-section">
      <div class="modal-section-header"><h3>Action items</h3></div>
      <ul class="detail-list">
        ${sortedActions.length ? sortedActions.map((a) => `
          <li class="detail-item ${!a.completed && a.dueDate.slice(0, 10) < todayStr ? 'overdue' : ''} ${a.completed ? 'completed' : ''}">
            <div class="detail-item-top">
              <label style="display:flex;gap:6px;align-items:flex-start;font-weight:400;">
                <input type="checkbox" data-toggle-action="${a.id}" ${a.completed ? 'checked' : ''} style="width:auto;margin-top:2px;" />
                <span class="detail-item-title">${escapeHtml(a.description)}</span>
              </label>
              <span class="detail-item-meta">Due ${formatDate(a.dueDate)}</span>
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
        ${sortedEvents.length ? sortedEvents.map((ev) => `
          <li class="detail-item">
            <div class="detail-item-top">
              <span class="detail-item-title">${escapeHtml(ev.title)}</span>
              <span class="detail-item-meta">${formatDateTime(ev.eventDate)}</span>
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
