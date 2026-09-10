let contacts = [];
let contactOwners = [];
let editingContactId = null;

const CONTACT_TYPES = ['Contact', 'Partnership', 'Non-Qualified Lead'];
const SECTION_TITLES = {
  Contact: 'Contacts',
  Partnership: 'Partnerships',
  'Non-Qualified Lead': 'Non-Qualified Leads',
};

async function init() {
  try {
    const config = await apiGet('/config');
    applyBrandFromConfig(config);
    contactOwners = config.contactOwners || [];
  } catch (err) {
    showToast('Could not load configuration: ' + err.message, true);
  }
  populateOwnerSelect(document.getElementById('ctOwner'));
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

async function loadContacts() {
  try {
    contacts = await apiGet('/contacts');
    renderList();
  } catch (err) {
    showToast('Could not load contacts: ' + err.message, true);
  }
}

function buildContactRow(c, todayStr) {
  if (c.id === editingContactId) {
    const ownerNames = contactOwners.map((o) => o.name);
    if (c.contactOwner && !ownerNames.includes(c.contactOwner)) ownerNames.push(c.contactOwner);
    ownerNames.sort((a, b) => a.localeCompare(b));
    const ownerOptions = ['', ...ownerNames]
      .map((n) => `<option value="${escapeHtml(n)}" ${n === c.contactOwner ? 'selected' : ''}>${n || 'Unassigned'}</option>`)
      .join('');
    const typeOptions = CONTACT_TYPES.map((t) => `<option value="${t}" ${t === (c.contactType || 'Contact') ? 'selected' : ''}>${t}</option>`).join('');
    return `
      <li class="detail-item">
        <form class="inline-add-form" data-edit-contact-form="${c.id}" style="flex-wrap:wrap;">
          <input class="grow" name="name" value="${escapeHtml(c.name)}" required />
          <select name="contactType" style="width:150px;">${typeOptions}</select>
          <input name="nextOutreachDate" type="date" value="${c.nextOutreachDate}" required style="width:150px;" />
          <select name="contactOwner" style="width:160px;">${ownerOptions}</select>
          <button type="submit" class="btn btn-secondary">Save</button>
          <button type="button" class="btn-text" data-cancel-edit-contact="${c.id}">Cancel</button>
          <input class="grow" name="nextOutreachAction" value="${escapeHtml(c.nextOutreachAction || '')}" placeholder="Next outreach action" style="flex-basis:100%;" />
        </form>
      </li>`;
  }

  const overdue = c.nextOutreachDate < todayStr;
  return `
    <li class="detail-item ${overdue ? 'overdue' : ''}">
      <div class="detail-item-top">
        <span class="detail-item-title">${escapeHtml(c.name)}</span>
        <span style="display:flex;align-items:center;gap:8px;">
          <span class="detail-item-meta">Next outreach ${formatDate(c.nextOutreachDate)}</span>
          <button class="btn-text" data-edit-contact="${c.id}" style="padding:0;">Edit</button>
          <button class="btn-danger-text" data-delete-contact="${c.id}" style="padding:0;">Delete</button>
        </span>
      </div>
      <div class="detail-item-meta">${c.contactOwner ? `Owner: ${escapeHtml(c.contactOwner)}` : 'Unassigned'}</div>
      ${c.nextOutreachAction ? `<div class="detail-item-meta">${escapeHtml(c.nextOutreachAction)}</div>` : ''}
    </li>`;
}

function renderList() {
  const container = document.getElementById('contactsList');
  const todayStr = new Date().toISOString().slice(0, 10);

  container.innerHTML = CONTACT_TYPES.map((type) => {
    const group = contacts
      .filter((c) => (c.contactType || 'Contact') === type)
      .sort((a, b) => a.nextOutreachDate.localeCompare(b.nextOutreachDate));

    return `
      <div class="modal-section">
        <div class="modal-section-header"><h3>${escapeHtml(SECTION_TITLES[type])} <span class="detail-item-meta">(${group.length})</span></h3></div>
        <ul class="detail-list">
          ${group.length ? group.map((c) => buildContactRow(c, todayStr)).join('') : `<li class="detail-item" style="color:var(--color-text-muted);border-style:dashed;">None yet</li>`}
        </ul>
      </div>`;
  }).join('');

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
        });
        editingContactId = null;
        await loadContacts();
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
      });
      form.reset();
      closeModal('newContactModal');
      await loadContacts();
      showToast('Contact added');
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
