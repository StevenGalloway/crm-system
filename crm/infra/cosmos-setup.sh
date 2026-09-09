#!/usr/bin/env bash
# Provisions the Cosmos DB account/database/containers for the CRM POC.
# Uses the Cosmos DB free tier (1000 RU/s + 25 GB, lifetime free, one per
# subscription) -- see README for details.
#
# Usage: edit the variables below, then: bash infra/cosmos-setup.sh

set -euo pipefail

RESOURCE_GROUP="fenway-crm-poc-rg"
LOCATION="southcentralus"          # pick a region close to you
COSMOS_ACCOUNT="fenway-crm-cosmos" # must be globally unique
DATABASE_NAME="crm"

echo "Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

echo "Creating Cosmos DB account (free tier)..."
az cosmosdb create \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --locations regionName="$LOCATION" \
  --enable-free-tier true \
  --default-consistency-level Session

echo "Creating database..."
az cosmosdb sql database create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DATABASE_NAME"

echo "Creating 'leads' container (partition key /id)..."
az cosmosdb sql container create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --database-name "$DATABASE_NAME" \
  --name "leads" \
  --partition-key-path "/id" \
  --throughput 400

echo "Creating 'config' container (partition key /id)..."
az cosmosdb sql container create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --database-name "$DATABASE_NAME" \
  --name "config" \
  --partition-key-path "/id" \
  --throughput 400

echo ""
echo "Done. Fetch your connection values with:"
echo "  az cosmosdb show --name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --query documentEndpoint -o tsv"
echo "  az cosmosdb keys list --name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --query primaryMasterKey -o tsv"
echo ""
echo "Note: both containers are provisioned at 400 RU/s here for clarity."
echo "The free tier covers the first 1000 RU/s combined, so two containers"
echo "at 400 RU/s each (800 RU/s total) stays comfortably inside the free grant."
