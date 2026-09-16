const DEFAULT_SCHEDULE = { frequency: 'daily', time: '08:00', dayOfWeek: 1, dayOfMonth: 1 };

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// How late a delayed/missed tick is still allowed to catch up and send the
// digest, before it's treated as too stale to bother with. Bounded rather
// than open-ended so a send doesn't show up hours later looking like it was
// triggered by something unrelated (a deploy, a manual API call, etc).
const CATCH_UP_WINDOW_MINUTES = Number(process.env.NOTIFIER_CATCHUP_WINDOW_MINUTES) || 180;

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

// The external cron driving this (see scheduled-jobs.yml) targets every 15
// minutes but isn't guaranteed to land on that cadence -- GitHub Actions
// schedules can be delayed well beyond their configured interval under load.
// An exact-match check against the configured time would silently skip an
// entire day/week/month whenever a tick landed late or was missed outright.
// So this is a catch-up check instead: true from the configured time up
// through CATCH_UP_WINDOW_MINUTES after it -- whether it's already been sent
// for this period is enforced separately by the caller via
// lastSentPeriodKey, so a late tick within the window still only sends once,
// and a tick past the window is treated as too stale to send at all (rather
// than showing up much later looking unrelated to the schedule).
function shouldSendNow(schedule, now) {
  const c = getCentralParts(now);
  const [hh, mm] = (schedule.time || DEFAULT_SCHEDULE.time).split(':').map(Number);
  const scheduledMinutes = hh * 60 + mm;
  const nowMinutes = c.hour * 60 + c.minute;
  if (nowMinutes < scheduledMinutes || nowMinutes > scheduledMinutes + CATCH_UP_WINDOW_MINUTES) return false;

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
