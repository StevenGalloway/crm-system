// One-time seed script: writes infra/seed-config.json into the 'config'
// container as the app-config document.
//
// Usage:
//   cd infra
//   npm init -y && npm install @azure/cosmos
//   COSMOS_ENDPOINT="https://<acct>.documents.azure.com:443/" \
//   COSMOS_KEY="<primary-key>" \
//   COSMOS_DATABASE="crm" \
//   node seed-config.js

const fs = require('fs');
const path = require('path');
const { CosmosClient } = require('@azure/cosmos');

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE || 'crm';

if (!endpoint || !key) {
  console.error('Set COSMOS_ENDPOINT and COSMOS_KEY environment variables first.');
  process.exit(1);
}

async function main() {
  const client = new CosmosClient({ endpoint, key });
  const container = client.database(databaseId).container('config');

  const configDoc = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-config.json'), 'utf8'));

  const { resource } = await container.items.upsert(configDoc);
  console.log('Seeded app-config document:', resource.id);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
