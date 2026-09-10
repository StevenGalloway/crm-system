let config = null;

async function init() {
  try {
    config = await apiGet('/config');
    applyBrandFromConfig(config);
  } catch (err) {
    showToast('Could not load configuration: ' + err.message, true);
    return;
  }
  populateDayOfMonthSelect();
  renderClientPartners();
  renderContactOwners();
  renderSchedule();
  wireEvents();
}

function populateDayOfMonthSelect() {
  const select = document.getElementById('schDayOfMonth');
  select.innerHTML = Array.from({ length: 28 }, (_, i) => i + 1)
    .map((d) => `<option value="${d}">${d}</option>`)
    .join('');
}

function renderClientPartners() {
  const list = document.getElementById('clientPartnersList');
  const partners = config.clientPartners || [];
  if (!partners.length) {
    list.innerHTML = '<li class="detail-item" style="color:var(--color-text-muted);border-style:dashed;">No client partners configured yet</li>';
    return;
  }
  list.innerHTML = partners.map((name) => `
    <li class="detail-item">
      <div class="detail-item-top">
        <span class="detail-item-title">${escapeHtml(name)}</span>
        <button class="btn-danger-text" data-remove-partner="${escapeHtml(name)}" style="padding:0;">Remove</button>
      </div>
    </li>
  `).join('');

  list.querySelectorAll('[data-remove-partner]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.removePartner;
      if (!confirm(`Remove "${name}"? Any lead currently assigned to them will have Client Partner cleared.`)) return;
      const updated = (config.clientPartners || []).filter((n) => n !== name);
      try {
        config = await apiPut('/config', { clientPartners: updated });
        renderClientPartners();
        showToast('Partner removed');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

function renderContactOwners() {
  const list = document.getElementById('contactOwnersList');
  const owners = config.contactOwners || [];
  if (!owners.length) {
    list.innerHTML = '<li class="detail-item" style="color:var(--color-text-muted);border-style:dashed;">No contact owners configured yet</li>';
    return;
  }
  list.innerHTML = owners.map((o) => `
    <li class="detail-item">
      <div class="detail-item-top">
        <span class="detail-item-title">${escapeHtml(o.name)}</span>
        <button class="btn-danger-text" data-remove-owner="${escapeHtml(o.name)}" style="padding:0;">Remove</button>
      </div>
      <div class="detail-item-meta">${o.slackUserId ? `Slack ID: ${escapeHtml(o.slackUserId)}` : "No Slack ID set -- outreach DMs won't reach them"}</div>
    </li>
  `).join('');

  list.querySelectorAll('[data-remove-owner]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.removeOwner;
      if (!confirm(`Remove "${name}"?`)) return;
      const updated = (config.contactOwners || []).filter((o) => o.name !== name);
      try {
        config = await apiPut('/config', { contactOwners: updated });
        renderContactOwners();
        showToast('Owner removed');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

function renderSchedule() {
  const schedule = config.notificationSchedule || {};
  const frequency = schedule.frequency || 'daily';
  document.getElementById('schFrequency').value = frequency;
  document.getElementById('schTime').value = schedule.time || '08:00';
  document.getElementById('schDayOfWeek').value = schedule.dayOfWeek !== undefined ? schedule.dayOfWeek : 1;
  document.getElementById('schDayOfMonth').value = schedule.dayOfMonth || 1;
  toggleScheduleFields(frequency);
}

function toggleScheduleFields(frequency) {
  document.getElementById('schDayOfWeekField').style.display = frequency === 'weekly' ? '' : 'none';
  document.getElementById('schDayOfMonthField').style.display = frequency === 'monthly' ? '' : 'none';
}

function wireEvents() {
  document.getElementById('addPartnerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.partnerName.value.trim();
    if (!name) return;
    const current = config.clientPartners || [];
    if (current.includes(name)) {
      showToast('That partner is already in the list', true);
      return;
    }
    try {
      config = await apiPut('/config', { clientPartners: [...current, name] });
      form.reset();
      renderClientPartners();
      showToast('Partner added');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById('addOwnerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.ownerName.value.trim();
    if (!name) return;
    const current = config.contactOwners || [];
    if (current.some((o) => o.name === name)) {
      showToast('That owner is already in the list', true);
      return;
    }
    try {
      config = await apiPut('/config', {
        contactOwners: [...current, { name, slackUserId: form.ownerSlackId.value.trim() }],
      });
      form.reset();
      renderContactOwners();
      showToast('Owner added');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById('schFrequency').addEventListener('change', (e) => toggleScheduleFields(e.target.value));

  document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const schedule = {
      frequency: form.frequency.value,
      time: form.time.value,
      dayOfWeek: Number(form.dayOfWeek.value),
      dayOfMonth: Number(form.dayOfMonth.value),
    };
    try {
      config = await apiPut('/config', { notificationSchedule: schedule });
      showToast('Schedule saved');
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
