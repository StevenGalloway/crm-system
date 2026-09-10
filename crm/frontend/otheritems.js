let otherItems = [];

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

function renderList() {
  const list = document.getElementById('otherItemsList');
  const todayStr = new Date().toISOString().slice(0, 10);
  const sorted = [...otherItems].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (!sorted.length) {
    list.innerHTML = '<li class="detail-item" style="color:var(--color-text-muted);border-style:dashed;">No other items yet</li>';
    return;
  }

  list.innerHTML = sorted.map((item) => `
    <li class="detail-item ${!item.completed && item.dueDate.slice(0, 10) < todayStr ? 'overdue' : ''} ${item.completed ? 'completed' : ''}">
      <div class="detail-item-top">
        <label style="display:flex;gap:6px;align-items:flex-start;font-weight:400;">
          <input type="checkbox" data-toggle-item="${item.id}" ${item.completed ? 'checked' : ''} style="width:auto;margin-top:2px;" />
          <span class="detail-item-title">${escapeHtml(item.description)}</span>
        </label>
        <span class="detail-item-meta">Due ${formatDate(item.dueDate)}</span>
      </div>
    </li>
  `).join('');

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
}

function wireEvents() {
  document.getElementById('newItemBtn').addEventListener('click', () => openModal('newItemModal'));

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
