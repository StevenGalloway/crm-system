let contacts = [];
let contactOwners = [];
let clientPartners = [];
let editingContactId = null;

const PAGE_TYPES = ['Non-Qualified Lead', 'Partnership'];
const SECTION_TITLES = {
  Partnership: 'Partnerships',
  'Non-Qualified Lead': 'Non-Qualified Leads',
};
const SECTION_SUBTEXT = {
  Partnership: 'Entities we have a relationship with that we want to reach out to on a cadence.',
  'Non-Qualified Lead': 'Leads that have not been confirmed ICP or seen the Intro to FG deck.',
};
const UNASSIGNED = '__unassigned__';

const collapsedSections = {
  'Non-Qualified Lead': false,
  Partnership: false,
};

const filters = {
  search: '',
  owner: '',
  clientPartner: '',
  dateFrom: '',
  dateTo: '',
};

async function init() {
  try {
    const config = await apiGet('/config');
    applyBrandFromConfig(config);
    contactOwners = config.contactOwners || [];
    clientPartners = config.clientPartners || [];
  } catch (err) {
    showToast('Could not load configuration: ' + err.message, true);
  }
  populateOwnerSelect(document.getElementById('ctOwner'));
  populatePartnerSelect(document.getElementById('ctClientPartner'));
  populateFilterSelects();
  wireEvents();
  await loadContacts();
}

function populateOwnerSelect(select, currentValue) {
  const names = contactOwners.map((o) => o.name);
  if (currentValue && !names.includes(currentValue)) names.push(currentValue);
  names.sort((a, b) => a.localeCompare(b));
  select.innerHTML =
    '<option value="">Unassigned</option>' +
    names.map((n) => `<option value="${escapeHtml(n)}" ${n === currentValue ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('');
}

function populatePartnerSelect(select, currentValue) {
  const partners = clientPartners.slice();
  if (currentValue && !partners.includes(currentValue)) partners.push(currentValue);
  partners.sort((a, b) => a.localeCompare(b));
  select.innerHTML =
    '<option value="">Unassigned</option>' +
    partners.map((name) => `<option value="${escapeHtml(name)}" ${name === currentValue ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
}

function populateFilterSelects() {
  const ownerNames = contactOwners.map((o) => o.name).sort((a, b) => a.localeCompare(b));
  document.getElementById('ctFilterOwner').innerHTML =
    '<option value="">All owners</option>' +
    `<option value="${UNASSIGNED}">Unassigned</option>` +
    ownerNames.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

  const partnerNames = clientPartners.slice().sort((a, b) => a.localeCompare(b));
  document.getElementById('ctFilterPartner').innerHTML =
    '<option value="">All partners</option>' +
    `<option value="${UNASSIGNED}">Unassigned</option>` +
    partnerNames.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
}

function matchesFilter(actual, filterValue) {
  if (!filterValue) return true;
  if (filterValue === UNASSIGNED) return !actual;
  return actual === filterValue;
}

async function loadContacts() {
  try {
    contacts = await apiGet('/contacts');
    renderList();
  } catch (err) {
    showToast('Could not load contacts: ' + err.message, true);
  }
}

function passesFilters(c) {
  if (!matchesFilter(c.contactOwner, filters.owner)) return false;
  if (!matchesFilter(c.clientPartner, filters.clientPartner)) return false;
  if (filters.dateFrom && c.nextOutreachDate < filters.dateFrom) return false;
  if (filters.dateTo && c.nextOutreachDate > filters.dateTo) return false;
  if (filters.search) {
    const haystack = [c.name, c.companyName, c.nextOutreachAction].filter(Boolean).join(' ').toLowerCase();
    if (!haystack.includes(filters.search)) return false;
  }
  return true;
}

function buildContactRow(c, todayStr) {
  if (c.id === editingContactId) {
    const ownerNames = contactOwners.map((o) => o.name);
    if (c.contactOwner && !ownerNames.includes(c.contactOwner)) ownerNames.push(c.contactOwner);
    ownerNames.sort((a, b) => a.localeCompare(b));
    const ownerOptions = ['', ...ownerNames]
      .map((n) => `<option value="${escapeHtml(n)}" ${n === c.contactOwner ? 'selected' : ''}>${n || 'Unassigned'}</option>`)
      .join('');
    const partnerNames = clientPartners.slice();
    if (c.clientPartner && !partnerNames.includes(c.clientPartner)) partnerNames.push(c.clientPartner);
    partnerNames.sort((a, b) => a.localeCompare(b));
    const partnerOptions = ['', ...partnerNames]
      .map((n) => `<option value="${escapeHtml(n)}" ${n === c.clientPartner ? 'selected' : ''}>${n || 'Unassigned'}</option>`)
      .join('');
    const typeOptions = PAGE_TYPES.map((t) => `<option value="${t}" ${t === (c.contactType || 'Partnership') ? 'selected' : ''}>${t}</option>`).join('');
    return `
      <li class="detail-item">
        <form class="inline-add-form" data-edit-contact-form="${c.id}" style="flex-wrap:wrap;">
          <input class="grow" name="name" value="${escapeHtml(c.name)}" required />
          <select name="contactType" style="width:170px;">${typeOptions}</select>
          <input name="nextOutreachDate" type="date" value="${c.nextOutreachDate}" required style="width:150px;" />
          <select name="contactOwner" style="width:160px;">${ownerOptions}</select>
          <button type="submit" class="btn btn-secondary">Save</button>
          <button type="button" class="btn-text" data-cancel-edit-contact="${c.id}">Cancel</button>
          <input class="grow" name="companyName" value="${escapeHtml(c.companyName || '')}" placeholder="Company name (optional)" style="flex-basis:100%;" />
          <select name="clientPartner" style="flex-basis:100%;">${partnerOptions}</select>
          <input class="grow" name="nextOutreachAction" value="${escapeHtml(c.nextOutreachAction || '')}" placeholder="Next outreach action" style="flex-basis:100%;" />
        </form>
      </li>`;
  }

  const overdue = c.nextOutreachDate < todayStr;
  const isNQL = (c.contactType || 'Contact') === 'Non-Qualified Lead';
  return `
    <li class="detail-item ${overdue ? 'overdue' : ''}">
      <div class="detail-item-top">
        <span class="detail-item-title">${escapeHtml(c.name)}</span>
        <span style="display:flex;align-items:center;gap:8px;">
          <span class="detail-item-meta">Next outreach ${formatDate(c.nextOutreachDate)}</span>
          ${isNQL ? `<button class="btn-text" data-convert-contact="${c.id}" style="padding:0;">Convert to lead</button>` : ''}
          <button class="btn-text" data-edit-contact="${c.id}" style="padding:0;">Edit</button>
          <button class="btn-danger-text" data-delete-contact="${c.id}" style="padding:0;">Delete</button>
        </span>
      </div>
      ${c.companyName ? `<div class="detail-item-meta">Company: ${escapeHtml(c.companyName)}</div>` : ''}
      <div class="detail-item-meta">Owner: ${c.contactOwner ? escapeHtml(c.contactOwner) : 'Unassigned'}</div>
      <div class="detail-item-meta">Partner: ${c.clientPartner ? escapeHtml(c.clientPartner) : 'Unassigned'}</div>
      ${c.nextOutreachAction ? `<div class="detail-item-meta">${escapeHtml(c.nextOutreachAction)}</div>` : ''}
    </li>`;
}

function renderList() {
  const container = document.getElementById('contactsList');
  const todayStr = new Date().toISOString().slice(0, 10);

  container.innerHTML = PAGE_TYPES.map((type) => {
    const group = contacts
      .filter((c) => (c.contactType || 'Contact') === type)
      .filter(passesFilters)
      .sort((a, b) => a.nextOutreachDate.localeCompare(b.nextOutreachDate));
    const collapsed = collapsedSections[type];

    return `
      <div class="modal-section">
        <div class="modal-section-header">
          <h3>${escapeHtml(SECTION_TITLES[type])} <span class="detail-item-meta">(${group.length})</span></h3>
          <button type="button" class="btn-text" data-toggle-section="${type}">${collapsed ? 'Expand' : 'Collapse'}</button>
        </div>
        <div ${collapsed ? 'hidden' : ''}>
          <p class="calendar-subhead" style="margin:-6px 0 10px;">${escapeHtml(SECTION_SUBTEXT[type])}</p>
          <ul class="detail-list">
            ${group.length ? group.map((c) => buildContactRow(c, todayStr)).join('') : `<li class="detail-item" style="color:var(--color-text-muted);border-style:dashed;">None match your filters</li>`}
          </ul>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-toggle-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.toggleSection;
      collapsedSections[type] = !collapsedSections[type];
      renderList();
    });
  });

  container.querySelectorAll('[data-edit-contact]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingContactId = btn.dataset.editContact;
      renderList();
    });
  });

  container.querySelectorAll('[data-cancel-edit-contact]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingContactId = null;
      renderList();
    });
  });

  container.querySelectorAll('[data-edit-contact-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await apiPatch(`/contacts/${form.dataset.editContactForm}`, {
          name: f.name.value,
          contactType: f.contactType.value,
          nextOutreachDate: f.nextOutreachDate.value,
          nextOutreachAction: f.nextOutreachAction.value,
          contactOwner: f.contactOwner.value,
          companyName: f.companyName.value,
          clientPartner: f.clientPartner.value,
        });
        editingContactId = null;
        await loadContacts();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  container.querySelectorAll('[data-convert-contact]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Convert this Non-Qualified Lead to a lead on the board (Qualification stage)?')) return;
      try {
        await apiPost(`/contacts/${btn.dataset.convertContact}/convert-to-lead`, {});
        await loadContacts();
        showToast('Converted to lead');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  container.querySelectorAll('[data-delete-contact]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this contact?')) return;
      try {
        await apiDelete(`/contacts/${btn.dataset.deleteContact}`);
        await loadContacts();
        showToast('Contact deleted');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

function wireEvents() {
  document.getElementById('newContactBtn').addEventListener('click', () => openModal('newContactModal'));

  document.getElementById('newContactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await apiPost('/contacts', {
        name: form.name.value,
        contactType: form.contactType.value,
        nextOutreachDate: form.nextOutreachDate.value,
        nextOutreachAction: form.nextOutreachAction.value,
        contactOwner: form.contactOwner.value,
        companyName: form.companyName.value,
        clientPartner: form.clientPartner.value,
      });
      form.reset();
      closeModal('newContactModal');
      await loadContacts();
      showToast('Added');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById('ctFilterSearch').addEventListener('input', (e) => {
    filters.search = e.target.value.trim().toLowerCase();
    renderList();
  });
  document.getElementById('ctFilterOwner').addEventListener('change', (e) => {
    filters.owner = e.target.value;
    renderList();
  });
  document.getElementById('ctFilterPartner').addEventListener('change', (e) => {
    filters.clientPartner = e.target.value;
    renderList();
  });
  document.getElementById('ctFilterDateFrom').addEventListener('change', (e) => {
    filters.dateFrom = e.target.value;
    renderList();
  });
  document.getElementById('ctFilterDateTo').addEventListener('change', (e) => {
    filters.dateTo = e.target.value;
    renderList();
  });
  document.getElementById('ctFilterClear').addEventListener('click', () => {
    filters.search = '';
    filters.owner = '';
    filters.clientPartner = '';
    filters.dateFrom = '';
    filters.dateTo = '';
    document.getElementById('ctFilterSearch').value = '';
    document.getElementById('ctFilterOwner').value = '';
    document.getElementById('ctFilterPartner').value = '';
    document.getElementById('ctFilterDateFrom').value = '';
    document.getElementById('ctFilterDateTo').value = '';
    renderList();
  });
}

document.addEventListener('DOMContentLoaded', init);
