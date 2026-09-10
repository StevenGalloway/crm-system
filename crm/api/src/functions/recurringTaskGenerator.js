const { app } = require('@azure/functions');
const { generateDueTasks } = require('../recurringCore');

// Runs once daily, well before the pipeline digest, so anything generated
// today shows up in that morning's Slack post.
app.timer('recurringTaskGenerator', {
  schedule: '0 0 11 * * *',
  handler: async (myTimer, context) => {
    try {
      await generateDueTasks(context);
    } catch (err) {
      context.error('recurringTaskGenerator failed', err);
    }
  },
});
