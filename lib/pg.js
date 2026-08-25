const { Client } = require('pg');

/**
 * Map a Salesforce field type to a PostgreSQL column type.
 * @param {{ name: string, type: string, length?: number, precision?: number, scale?: number }} sfField
 * @returns {{ pgType: string, nullable: boolean }}
 */
function mapFieldType(sfField) {
  const typeMap = {
    string: 'TEXT',
    reference: 'TEXT',
    id: 'TEXT',
    boolean: 'BOOLEAN',
    int: 'INTEGER',
    long: 'BIGINT',
    double: 'DOUBLE PRECISION',
    decimal: 'NUMERIC',
    currency: 'NUMERIC',
    date: 'DATE',
    datetime: 'TIMESTAMP',
    time: 'INTERVAL',
    textarea: 'TEXT',
    picklist: 'TEXT',
    multipicklist: 'TEXT',
    percent: 'DOUBLE PRECISION',
    phone: 'TEXT',
  };

  const baseType = typeMap[sfField.type] || 'TEXT';

  // Numeric(10,2) style — preserve precision/scale when available
  if ((sfField.precision != null && sfField.scale != null) || sfField.length) {
    if (sfField.precision != null && sfField.scale != null) {
      return { pgType: `NUMERIC(${sfField.precision}, ${sfField.scale})`, nullable: true };
    }
    if (sfField.length) {
      return { pgType: `NUMERIC(${sfField.length}, 0)`, nullable: true };
    }
  }

  return { pgType: baseType, nullable: true };
}

/**
 * Sanitise a Salesforce record value so it is safe for PostgreSQL insertion.
 * - null/undefined → null (PG handles natively)
 * - empty string → null where PG would reject it (numeric/date columns)
 */
function sanitizeValue(value, pgType) {
  if (value == null || value === '') {
    return null;
  }

  // For DATE / TIMESTAMP columns, jsforce may return Date objects natively — leave them.
  if (value instanceof Date) {
    return value;
  }

  // Cast booleans that come back as strings from Salesforce API.
  if (pgType === 'BOOLEAN') {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return null; // couldn't convert — skip it rather than crash
  }

  return value;
}

/**
 * Connect to PostgreSQL using environment variables.
 */
async function connectPG() {
  const host = process.env.PGHOST;
  const port = process.env.PGPORT || '5432';
  const database = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;

  if (!host || !database || !user || !password) {
    throw new Error(
      'Missing PG env vars: PGHOST, PGDATABASE, PGUSER, PGPASSWORD are required.'
    );
  }

  const client = new Client({ host, port, database, user, password });
  await client.connect();
  console.log('Connected to PostgreSQL:', `${host}/${database}`);
  return client;
}

/**
 * Drop a table if it already exists.
 */
async function dropTableIfExists(client, tableName) {
  await client.query(`DROP TABLE IF EXISTS "${tableName}"`);
}

/**
 * Create a PostgreSQL table whose columns mirror a Salesforce object's describe fields.
 * @param {import('pg').Client} client
 * @param {string} tableName — exact name (preserved as-is, quoted in SQL)
 * @param {{ name: string, type: string }[]} fields — parsed describe fields
 * @returns {Promise<void>}
 */
async function createTable(client, tableName, fields) {
  const columnDefs = fields.map((f) => {
    const { pgType } = mapFieldType(f);
    return `"${f.name}" ${pgType}`;
  });

  const ddl = `CREATE TABLE "${tableName}" (${columnDefs.join(', ')})`;
  console.log('DDL:', ddl);
  await client.query(ddl);
}

/**
 * Insert records into a PostgreSQL table using parameterised batches.
 * @param {import('pg').Client} client
 * @param {string} tableName — exact name (quoted in SQL)
 * @param {{ name: string, type: string }[]} fields — describe field list (order = column order)
 * @param {object[]} records — Salesforce record objects
 */
async function insertRecords(client, tableName, fields, records) {
  if (!records.length) {
    console.log('No records to insert.');
    return;
  }

  const columnNames = fields.map((f) => `"${f.name}"`);

  // Process each record into an array of PG-safe values in field order.
  function recordToValues(record) {
    return fields.map((f) => sanitizeValue(record[f.name], mapFieldType(f).pgType));
  }

  const BATCH_SIZE = 100;

  for (let start = 0; start < records.length; start += BATCH_SIZE) {
    const batch = records.slice(start, start + BATCH_SIZE);
    const valuesArray = batch.map(recordToValues);

    // Build a multi-row INSERT: INSERT INTO ... VALUES ($1,$2),($3,$4),...
    const rowStart = start; // global offset across the entire statement
    const rows = valuesArray.map((vals, ri) => `(${vals.map((_, i) => `$${rowStart + (ri * fields.length) + i + 1}`).join(',')})`);
    const flatValues = valuesArray.flat();

    const sql = `INSERT INTO "${tableName}" (${columnNames.join(', ')}) VALUES ${rows.join(', ')}`;
    await client.query(sql, flatValues);

    const done = Math.min(start + BATCH_SIZE, records.length);
    console.log(`  Inserted rows ${start + 1}–${done} / ${records.length}`);
  }
}

module.exports = { connectPG, dropTableIfExists, createTable, insertRecords };
