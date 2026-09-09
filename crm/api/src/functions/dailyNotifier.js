const { app } = require('@azure/functions');
const { runDigest } = require('../notifierCore');

// Static Web Apps' managed Functions don't allow WEBSITE_TIME_ZONE as an
// app setting, and always run timers in UTC -- so instead of relying on a
// single fixed UTC hour (which would drift an hour off 8am Central across
// the DST change), this fires at both UTC hours that 8am Central can land
// on (13:00 during CDT, 14:00 during CST) and only actually runs the
// digest on whichever of those firings is currently 8am in Chicago.
app.timer('dailyNotifier', {
  schedule: '0 0 13,14 * * 1-5',
  handler: async (myTimer, context) => {
    const centralHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date())
    );
    if (centralHour !== 8) return; // the other of the two UTC firings for the current DST offset

    try {
      const result = await runDigest(context);
      if (!result.posted) {
        context.warn(result.reason);
      }
    } catch (err) {
      context.error('dailyNotifier failed', err);
    }
  },
});
