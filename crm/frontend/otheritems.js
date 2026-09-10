let otherItems = [];
let editingItemId = null;
let showCompleted = false;

async function init() {
  try {
    const config = await apiGet('/config');
    applyBrandFromConfig(config);
  } catch (err) {
    showToast('Could not load configuration: ' + err.message, true);
  }
  wireEvents();
  await loadItems();
}

async function loadItems() {
  try {
    otherItems = await apiGet('/other-items');
    renderList();
  } catch (err) {
    showToast('Could not load items: ' + err.message, true);
  }
}

function rolledOff(item) {
  // Completed items roll off the default view 10 days after their due
  // date -- overdue-but-incomplete items never do, regardless of age.
  if (!item.completed) return false;
  const dueMs = new Date(item.dueDate + 'T00:00:00').getTime();
  const rolloffMs = dueMs + 10 * 24 * 60 * 60 * 1000;
  return Date.now() > rolloffMs;
}

function itemBadges(item, todayStr, cutoffStr) {
  if (item.completed) return '';
  const badges = [];
  if (item.dueDate < todayStr) badges.push('<span class="card-badge overdue">Past due</span>');
  else if (item.dueDate <= cutoffStr) badges.push('<span class="card-badge upcoming">Due within 48 hours</span>');
  return badges.length ? `<div class="card-badges" style="margin-top:6px;">${badges.join('')}</div>` : '';
}

function renderList() {
  const list = document.getElementById('otherItemsList');
  const todayStr = new Date().toISOString().slice(0, 10);
  const cutoffStr = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const visible = otherItems.filter((item) => showCompleted || !rolledOff(item));
  const sorted = [...visible].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (!sorted.length) {
    list.innerHTML = '<li class="detail-item" style="color:var(--color-text-muted);border-style:dashed;">No items to show</li>';
    return;
  }

  list.innerHTML = sorted.map((item) => {
    if (item.id === editingItemId) {
      return `
        <li class="detail-item">
          <form class="inline-add-form" data-edit-item-form="${item.id}">
            <input class="grow" name="description" value="${escapeHtml(item.description)}" required />
            <input name="dueDate" type="date" value="${item.dueDate.slice(0, 10)}" required style="width:150px;" />
            <button type="submit" class="btn btn-secondary">Save</button>
            <button type="button" class="btn-text" data-cancel-edit-item="${item.id}">Cancel</button>
          </form>
        </li>`;
    }

    return `
      <li class="detail-item ${!item.completed && item.dueDate.slice(0, 10) < todayStr ? 'overdue' : ''} ${item.completed ? 'completed' : ''}">
        <div class="detail-item-top">
          <label style="display:flex;gap:6px;align-items:flex-start;font-weight:400;">
            <input type="checkbox" data-toggle-item="${item.id}" ${item.completed ? 'checked' : ''} style="width:auto;margin-top:2px;" />
            <span class="detail-item-title">${escapeHtml(item.description)}</span>
          </label>
          <span style="display:flex;align-items:center;gap:8px;">
            <span class="detail-item-meta">Due ${formatDate(item.dueDate)}</span>
            <button class="btn-text" data-edit-item="${item.id}" style="padding:0;">Edit</button>
            <button class="btn-danger-text" data-delete-item="${item.id}" style="padding:0;">Delete</button>
          </span>
        </div>
        ${itemBadges(item, todayStr, cutoffStr)}
      </li>`;
  }).join('');

  list.querySelectorAll('[data-toggle-item]').forEach((checkbox) => {
    checkbox.addEventListener('change', async (e) => {
      try {
        await apiPatch(`/other-items/${e.target.dataset.toggleItem}`, { completed: e.target.checked });
        await loadItems();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  list.querySelectorAll('[data-edit-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingItemId = btn.dataset.editItem;
      renderList();
    });
  });

  list.querySelectorAll('[data-cancel-edit-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingItemId = null;
      renderList();
    });
  });

  list.querySelectorAll('[data-edit-item-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await apiPatch(`/other-items/${form.dataset.editItemForm}`, {
          description: f.description.value,
          dueDate: f.dueDate.value,
        });
        editingItemId = null;
        await loadItems();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  list.querySelectorAll('[data-delete-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = otherItems.find((i) => i.id === btn.dataset.deleteItem);
      openDeleteItemConfirm(item);
    });
  });
}

function openDeleteItemConfirm(item) {
  document.getElementById('diItemDescription').textContent = item.description;
  const input = document.getElementById('diConfirmInput');
  const confirmBtn = document.getElementById('diConfirmBtn');
  input.value = '';
  confirmBtn.disabled = true;

  input.oninput = () => {
    confirmBtn.disabled = input.value !== item.description;
  };

  confirmBtn.onclick = async () => {
    if (input.value !== item.description) return;
    confirmBtn.disabled = true;
    try {
      await apiDelete(`/other-items/${item.id}`);
      closeModal('deleteItemModal');
      await loadItems();
      showToast('Item deleted');
    } catch (err) {
      showToast(err.message, true);
      confirmBtn.disabled = false;
    }
  };

  openModal('deleteItemModal');
  input.focus();
}

function wireEvents() {
  document.getElementById('newItemBtn').addEventListener('click', () => openModal('newItemModal'));

  document.getElementById('showCompletedToggle').addEventListener('change', (e) => {
    showCompleted = e.target.checked;
    renderList();
  });

  document.getElementById('newItemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await apiPost('/other-items', { description: form.description.value, dueDate: form.dueDate.value });
      form.reset();
      closeModal('newItemModal');
      await loadItems();
      showToast('Item added');
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
