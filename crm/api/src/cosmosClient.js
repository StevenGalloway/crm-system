const { CosmosClient } = require('@azure/cosmos');

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE || 'crm';

if (!endpoint || !key) {
  // Functions will still load, but every Cosmos call will throw until these
  // Application Settings are configured (see README "Configure the Function App").
  console.warn('COSMOS_ENDPOINT / COSMOS_KEY are not set.');
}

const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);

module.exports = {
  leadsContainer: database.container('leads'),
  configContainer: database.container('config'),
};
