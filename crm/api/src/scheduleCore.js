const DEFAULT_SCHEDULE = { frequency: 'daily', time: '08:00', dayOfWeek: 1, dayOfMonth: 1 };

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// All schedule matching happens in Central time computed fresh on every
// call via Intl, rather than a fixed UTC offset -- so DST is handled for
// free, and this works for any configured time, not just 8am.
function getCentralParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday],
  };
}

const pad = (n) => String(n).padStart(2, '0');

// The timer that drives this fires every 15 minutes, so a configured time
// snaps down to the nearest quarter-hour -- the UI's time input steps in
// 15-minute increments to match.
function shouldSendNow(schedule, now) {
  const c = getCentralParts(now);
  const [hh, mm] = (schedule.time || DEFAULT_SCHEDULE.time).split(':').map(Number);
  const snappedMinute = Math.floor(mm / 15) * 15;
  if (c.hour !== hh || c.minute !== snappedMinute) return false;

  if (schedule.frequency === 'weekly') {
    const dow = schedule.dayOfWeek !== undefined ? schedule.dayOfWeek : DEFAULT_SCHEDULE.dayOfWeek;
    if (c.weekday !== dow) return false;
  } else if (schedule.frequency === 'monthly') {
    const dom = schedule.dayOfMonth || DEFAULT_SCHEDULE.dayOfMonth;
    if (c.day !== dom) return false;
  }
  return true;
}

// A stable key identifying "which period" a given moment falls in, so a
// successful run can record itself and this doesn't fire twice for the
// same day/week/month if the timer ticks land oddly (redeploys, clock
// skew, etc).
function periodKey(schedule, now) {
  const c = getCentralParts(now);
  if (schedule.frequency === 'weekly') {
    const d = new Date(Date.UTC(c.year, c.month - 1, c.day));
    const diffToMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diffToMonday);
    return `week-${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (schedule.frequency === 'monthly') {
    return `month-${c.year}-${pad(c.month)}`;
  }
  return `day-${c.year}-${pad(c.month)}-${pad(c.day)}`;
}

module.exports = { DEFAULT_SCHEDULE, shouldSendNow, periodKey };
