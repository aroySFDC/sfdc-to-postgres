const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const jsforce = require('jsforce');

/**
 * Connect to Salesforce using OAuth2 (Connected App) flow.
 * Uses `client_credentials` grant type with clientId/clientSecret.
 * Falls back to an existing accessToken when SF_ACCESS_TOKEN is set.
 */
async function connectSFDC() {
  const loginUrl = (process.env.SF_LOGIN_URL || 'https://login.salesforce.com').trim();

  // If a pre-obtained access token is available, skip the OAuth2 dance.
  if (process.env.SF_ACCESS_TOKEN) {
    const conn = new jsforce.Connection({
      instanceUrl: process.env.SF_INSTANCE_URL || loginUrl.replace('login', 'instance'),
      accessToken: process.env.SF_ACCESS_TOKEN
    });
    console.log('Connected to Salesforce via existing access token.');
    return conn;
  }

  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'SF_CLIENT_ID and SF_CLIENT_SECRET are required for OAuth2 login. '
      + 'Or set SF_ACCESS_TOKEN for token-based auth.'
    );
  }

  const conn = new jsforce.Connection({
    oauth2: {
      clientId,
      clientSecret,
      loginUrl,
    }
  });

  await conn.authorize({ grant_type: 'client_credentials' });
  console.log('Connected to Salesforce via OAuth2.');
  return conn;
}

/**
 * Describe a Salesforce object — returns the describe result.
 */
async function describeObject(conn, sfdcObject) {
  const describe = await conn.describeSObject(sfdcObject);
  if (!describe || !describe.fields) {
    throw new Error(`describeSObject(${sfdcObject}) returned no fields — is the object name correct?`);
  }
  return describe;
}

/**
 * Extract a flat field list from a Salesforce describe result.
 */
function parseFields(describeResult) {
  return describeResult.fields.map((f) => ({
    name: f.name,
    type: f.type,
    length: f.length,
    precision: f.precision,
    scale: f.scale,
    label: f.label,
    nullable: f.nullable,
  }));
}

/**
 * Query records from a Salesforce object.
 * Respects the `limit` parameter when provided; otherwise returns all rows.
 */
async function fetchRecords(conn, sfdcObject, fields, limit) {
  const columns = ['Id', ...fields.map((f) => f.name).filter((n) => n !== 'Id')];
  const result = await conn.query(`SELECT ${columns.join(', ')} FROM ${sfdcObject}`);
  // jsforce v3 returns a QueryResult object { totalSize, done, records, nextRecordsUrl }
  let allRecords = Array.isArray(result) ? result : result.records || [];
  return limit != null ? allRecords.slice(0, limit) : allRecords;
}

module.exports = { connectSFDC, describeObject, parseFields, fetchRecords };
