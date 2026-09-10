let recurringTasks = [];
let editingTaskId = null;

const CADENCE_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

async function init() {
  try {
    const config = await apiGet('/config');
    applyBrandFromConfig(config);
  } catch (err) {
    showToast('Could not load configuration: ' + err.message, true);
  }
  wireEvents();
  await loadTasks();
}

async function loadTasks() {
  try {
    recurringTasks = await apiGet('/recurring-tasks');
    renderList();
  } catch (err) {
    showToast('Could not load recurring tasks: ' + err.message, true);
  }
}

function renderList() {
  const list = document.getElementById('recurringTasksList');

  if (!recurringTasks.length) {
    list.innerHTML = '<li class="detail-item" style="color:var(--color-text-muted);border-style:dashed;">No recurring tasks configured yet</li>';
    return;
  }

  const sorted = [...recurringTasks].sort((a, b) => a.description.localeCompare(b.description));

  list.innerHTML = sorted.map((t) => {
    if (t.id === editingTaskId) {
      return `
        <li class="detail-item">
          <form class="inline-add-form" data-edit-task-form="${t.id}" style="flex-wrap:wrap;">
            <input class="grow" name="description" value="${escapeHtml(t.description)}" required />
            <select name="cadence" style="width:110px;">
              ${Object.entries(CADENCE_LABELS).map(([v, l]) => `<option value="${v}" ${v === t.cadence ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <input name="anchorDate" type="date" value="${t.anchorDate}" required style="width:150px;" />
            <button type="submit" class="btn btn-secondary">Save</button>
            <button type="button" class="btn-text" data-cancel-edit-task="${t.id}">Cancel</button>
          </form>
        </li>`;
    }

    return `
      <li class="detail-item ${t.active ? '' : 'paused'}">
        <div class="detail-item-top">
          <span class="detail-item-title">${escapeHtml(t.description)}</span>
          <span style="display:flex;align-items:center;gap:10px;">
            <span class="detail-item-meta">starts ${formatDate(t.anchorDate)}</span>
            <button class="btn-text" data-edit-task="${t.id}" style="padding:0;">Edit</button>
            <button class="btn-text" data-toggle-active="${t.id}" style="padding:0;">${t.active ? 'Pause' : 'Resume'}</button>
            <button class="btn-danger-text" data-delete-task="${t.id}" style="padding:0;">Delete</button>
          </span>
        </div>
        ${t.lastGeneratedDate ? `<div class="detail-item-meta">Last generated ${formatDate(t.lastGeneratedDate)}</div>` : ''}
        <div class="card-badges" style="margin-top:6px;"><span class="card-badge cadence">${CADENCE_LABELS[t.cadence] || t.cadence}</span></div>
      </li>`;
  }).join('');

  list.querySelectorAll('[data-edit-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingTaskId = btn.dataset.editTask;
      renderList();
    });
  });

  list.querySelectorAll('[data-cancel-edit-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingTaskId = null;
      renderList();
    });
  });

  list.querySelectorAll('[data-edit-task-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await apiPatch(`/recurring-tasks/${form.dataset.editTaskForm}`, {
          description: f.description.value,
          cadence: f.cadence.value,
          anchorDate: f.anchorDate.value,
        });
        editingTaskId = null;
        await loadTasks();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  list.querySelectorAll('[data-toggle-active]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const task = recurringTasks.find((t) => t.id === btn.dataset.toggleActive);
      try {
        await apiPatch(`/recurring-tasks/${btn.dataset.toggleActive}`, { active: !task.active });
        await loadTasks();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  list.querySelectorAll('[data-delete-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const task = recurringTasks.find((t) => t.id === btn.dataset.deleteTask);
      openDeleteTaskConfirm(task);
    });
  });
}

function openDeleteTaskConfirm(task) {
  document.getElementById('dtTaskDescription').textContent = task.description;
  const input = document.getElementById('dtConfirmInput');
  const confirmBtn = document.getElementById('dtConfirmBtn');
  input.value = '';
  confirmBtn.disabled = true;

  input.oninput = () => {
    confirmBtn.disabled = input.value !== task.description;
  };

  confirmBtn.onclick = async () => {
    if (input.value !== task.description) return;
    confirmBtn.disabled = true;
    try {
      await apiDelete(`/recurring-tasks/${task.id}`);
      closeModal('deleteTaskModal');
      await loadTasks();
      showToast('Recurring task deleted');
    } catch (err) {
      showToast(err.message, true);
      confirmBtn.disabled = false;
    }
  };

  openModal('deleteTaskModal');
  input.focus();
}

function wireEvents() {
  document.getElementById('newTaskBtn').addEventListener('click', () => openModal('newTaskModal'));

  document.getElementById('newTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await apiPost('/recurring-tasks', {
        description: form.description.value,
        cadence: form.cadence.value,
        anchorDate: form.anchorDate.value,
      });
      form.reset();
      closeModal('newTaskModal');
      await loadTasks();
      showToast('Recurring task added');
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
