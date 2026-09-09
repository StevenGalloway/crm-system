async function init() {
  let config;
  try {
    config = await apiGet('/config');
    applyBrandFromConfig(config);
  } catch (err) {
    showToast('Could not load configuration: ' + err.message, true);
    return;
  }

  const days = (config.notifications && config.notifications.lookaheadBusinessDays) || 5;
  document.getElementById('calendarSubhead').textContent =
    `Action items and calendar events due over the next ${days} business days.`;

  try {
    const feed = await apiGet(`/calendar?days=${days}`);
    renderFeed(feed);
  } catch (err) {
    showToast('Could not load calendar: ' + err.message, true);
  }
}

function groupByDate(rows, dateField) {
  const groups = {};
  rows.forEach((row) => {
    const key = row[dateField].slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  return groups;
}

function renderFeed(feed) {
  const container = document.getElementById('calendarContent');
  container.innerHTML = '';

  if (feed.overdueActionItems.length) {
    const group = document.createElement('div');
    group.className = 'calendar-group is-overdue';
    group.innerHTML = `<div class="calendar-group-title">Overdue (${feed.overdueActionItems.length})</div>`;
    feed.overdueActionItems.forEach((a) => group.appendChild(buildRow(a.companyName, a.description, a.dueDate, true)));
    container.appendChild(group);
  }

  const upcomingByDate = groupByDate(feed.upcomingActionItems, 'dueDate');
  const eventsByDate = groupByDate(feed.upcomingEvents, 'eventDate');
  const allDates = Array.from(new Set([...Object.keys(upcomingByDate), ...Object.keys(eventsByDate)])).sort();

  if (allDates.length === 0 && feed.overdueActionItems.length === 0) {
    container.innerHTML += '<div class="calendar-empty">Nothing due or scheduled in the lookahead window.</div>';
    return;
  }

  allDates.forEach((dateKey) => {
    const group = document.createElement('div');
    group.className = 'calendar-group';
    const label = new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    group.innerHTML = `<div class="calendar-group-title">${label}</div>`;

    (upcomingByDate[dateKey] || []).forEach((a) => group.appendChild(buildRow(a.companyName, a.description, a.dueDate, false, 'Action item', false)));
    (eventsByDate[dateKey] || []).forEach((e) => group.appendChild(buildRow(e.companyName, e.title, e.eventDate, false, 'Event', true)));

    container.appendChild(group);
  });
}

function buildRow(companyName, description, dateIso, isOverdue, kindLabel, hasTime) {
  const row = document.createElement('div');
  row.className = 'calendar-row' + (isOverdue ? ' is-overdue' : '');
  const dateText = isOverdue
    ? `Was due ${formatDate(dateIso)}`
    : hasTime
      ? formatDateTime(dateIso)
      : formatDate(dateIso);

  row.innerHTML = `
    <div class="calendar-row-date">${dateText}</div>
    <div class="calendar-row-body">
      <div class="calendar-row-company">${escapeHtml(companyName)}${kindLabel ? ` &middot; ${kindLabel}` : ''}</div>
      <div class="calendar-row-desc">${escapeHtml(description)}</div>
    </div>
  `;
  return row;
}

document.addEventListener('DOMContentLoaded', init);
