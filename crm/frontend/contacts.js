let contacts = [];
let contactOwners = [];
let editingContactId = null;

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
  if (currentValue && !names.includes(currentValue)) names.unshift(currentValue);
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

function renderList() {
  const list = document.getElementById('contactsList');

  if (!contacts.length) {
    list.innerHTML = '<li class="detail-item" style="color:var(--color-text-muted);border-style:dashed;">No contacts yet</li>';
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const sorted = [...contacts].sort((a, b) => a.nextOutreachDate.localeCompare(b.nextOutreachDate));

  list.innerHTML = sorted.map((c) => {
    if (c.id === editingContactId) {
      const ownerOptions = ['', ...contactOwners.map((o) => o.name)]
        .map((n) => `<option value="${escapeHtml(n)}" ${n === c.contactOwner ? 'selected' : ''}>${n || 'Unassigned'}</option>`)
        .join('');
      return `
        <li class="detail-item">
          <form class="inline-add-form" data-edit-contact-form="${c.id}" style="flex-wrap:wrap;">
            <input class="grow" name="name" value="${escapeHtml(c.name)}" required />
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
  }).join('');

  list.querySelectorAll('[data-edit-contact]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingContactId = btn.dataset.editContact;
      renderList();
    });
  });

  list.querySelectorAll('[data-cancel-edit-contact]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingContactId = null;
      renderList();
    });
  });

  list.querySelectorAll('[data-edit-contact-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await apiPatch(`/contacts/${form.dataset.editContactForm}`, {
          name: f.name.value,
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

  list.querySelectorAll('[data-delete-contact]').forEach((btn) => {
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
