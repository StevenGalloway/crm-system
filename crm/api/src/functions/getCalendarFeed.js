const { app } = require('@azure/functions');
const { leadsContainer } = require('../cosmosClient');
const { addBusinessDays } = require('../dateUtils');

app.http('getCalendarFeed', {
  methods: ['GET'],
  route: 'calendar',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const days = Number(request.query.get('days')) || 5;
    const now = new Date();
    const cutoff = addBusinessDays(now, days);
    const nowIso = now.toISOString();
    const cutoffIso = cutoff.toISOString();
    // Action items carry a date (not a time), so "overdue" is judged against
    // today's calendar date -- a task due today isn't overdue until tomorrow.
    const todayDateStr = nowIso.slice(0, 10);
    const cutoffDateStr = cutoffIso.slice(0, 10);

    const actionQuery = {
      query: `SELECT c.id AS leadId, c.companyName, ai.id AS actionId, ai.description, ai.dueDate
              FROM c JOIN ai IN c.actionItems
              WHERE ai.completed = false AND ai.dueDate <= @cutoff AND c.archived = false`,
      parameters: [{ name: '@cutoff', value: cutoffDateStr }],
    };
    const eventQuery = {
      query: `SELECT c.id AS leadId, c.companyName, ev.id AS eventId, ev.title, ev.eventDate, ev.notes
              FROM c JOIN ev IN c.calendarEvents
              WHERE ev.eventDate >= @now AND ev.eventDate <= @cutoff AND c.archived = false`,
      parameters: [
        { name: '@now', value: nowIso },
        { name: '@cutoff', value: cutoffIso },
      ],
    };

    try {
      const [{ resources: actionItems }, { resources: events }] = await Promise.all([
        leadsContainer.items.query(actionQuery).fetchAll(),
        leadsContainer.items.query(eventQuery).fetchAll(),
      ]);

      const overdueActionItems = actionItems
        .filter((a) => a.dueDate.slice(0, 10) < todayDateStr)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const upcomingActionItems = actionItems
        .filter((a) => a.dueDate.slice(0, 10) >= todayDateStr)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const upcomingEvents = events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

      return { jsonBody: { overdueActionItems, upcomingActionItems, upcomingEvents } };
    } catch (err) {
      context.error('getCalendarFeed failed', err);
      return { status: 500, jsonBody: { error: 'Failed to load calendar feed' } };
    }
  },
});
