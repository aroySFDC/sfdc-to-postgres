const jsforce = require('jsforce');

/**
 * Connect to a Salesforce org using username/password flow.
 */
async function connectSFDC() {
  const username = process.env.SF_USERNAME;
  const password = process.env.SF_PASSWORD;
  const securityToken = process.env.SF_SECURITY_TOKEN;

  if (!username || !password || !securityToken) {
    throw new Error(
      'Missing env vars: SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN are required.'
    );
  }

  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

  const conn = new jsforce.Connection({ loginUrl });
  await conn.login(username, password + securityToken);

  console.log('Connected as:', conn.user.userName);
  console.log('Instance URL:', conn.instanceUrl);

  return conn;
}

/**
 * Describe a Salesforce object to retrieve its field metadata.
 * @param {jsforce.Connection} conn — authenticated jsforce connection
 * @param {string} objectName — Salesforce API object name (e.g. "Account")
 * @returns {object} describe result with `sobject.fields` array
 */
async function describeObject(conn, objectName) {
  const result = await conn.describe(objectName);

  if (!result || !result.sobject || !result.sobject.fields) {
    throw new Error(`Describe failed for object "${objectName}" — no field metadata returned.`);
  }

  console.log('Object:', result.sobject.label, `(${result.sobject.name})`);
  console.log('Fields found:', result.sobject.fields.length);

  return result;
}

/**
 * Parse describe fields into a flat list of useful column definitions.
 * @param {object} describeResult — describe() result object
 * @returns {{ name: string, type: string, label: string, length?: number, precision?: number, scale?: number, nullable: boolean }[]}
 */
function parseFields(describeResult) {
  return describeResult.sobject.fields.map((f) => ({
    name: f.name,
    type: f.type,
    label: f.label,
    length: f.length,
    precision: f.precision,
    scale: f.scale,
    nullable: f.nullable,
    unique: f.unique || false,
  }));
}

/**
 * Fetch all records from a Salesforce object.
 * @param {jsforce.Connection} conn — authenticated jsforce connection
 * @param {string} objectName — Salesforce API object name
 * @param {{ name: string }[]} fields — describe field list (used for SELECT projection)
 * @param {number} [limit] — optional row cap appended to the query
 * @returns {object[]} array of record objects
 */
async function fetchRecords(conn, objectName, fields, limit) {
  // Project every field so the user sees all available values.
  const selectFields = fields.map((f) => f.name).join(', ');
  let query = `SELECT ${selectFields} FROM ${objectName}`;
  if (limit != null) {
    query += ` LIMIT ${limit}`;
  }

  console.log('Query:', query);

  const records = [];
  return new Promise((resolve, reject) => {
    conn
      .query(query)
      .on('record', (record) => records.push(record))
      .on('end', () => resolve(records))
      .on('error', (err) => reject(err));
  });
}

module.exports = { connectSFDC, describeObject, parseFields, fetchRecords };
