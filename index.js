#!/usr/bin/env node
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

const { connectSFDC, describeObject, parseFields, fetchRecords } = require('./lib/sfdc');
const {
  connectPG,
  dropTableIfExists,
  createTable,
  insertRecords,
} = require('./lib/pg');

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('tableName', {
      alias: 't',
      type: 'string',
      description: 'Override PostgreSQL table name (default: use Salesforce object name as-is)',
    })
    .option('dryRun', {
      alias: 'd',
      type: 'boolean',
      default: false,
      description: 'Create schema only — skip data copy',
    })
    .option('limit', {
      alias: 'l',
      type: 'number',
      description: 'Max rows to fetch from Salesforce (default: all)',
    })
    .demandCommand(1, 'Salesforce object name is required (e.g. Account, Contact)')
    .strict()
    .parse();
    console.log(argv);
  const sfdcObject = argv._[0];
  const tableName = argv.tableName || sfdcObject;

  console.log('=== Salesforce → PostgreSQL Sync ===');
  console.log('Object :', sfdcObject);
  console.log('Table  :', tableName);
  console.log('Dry run:', argv.dryRun ? 'yes' : 'no');
  if (argv.limit != null) {
    console.log('Limit  :', argv.limit);
  }
  console.log();

  // --- Salesforce: connect + describe ---
  const conn = await connectSFDC();
  const describeResult = await describeObject(conn, sfdcObject);
  const fields = parseFields(describeResult);

  // Print column definitions
  console.log('\n--- Column definitions ---');
  fields.forEach((f) => {
    const meta = [];
    if (f.length) meta.push(`len=${f.length}`);
    if (f.precision != null && f.scale != null) meta.push(`p=${f.precision},s=${f.scale}`);
    console.log(`  ${f.name.padEnd(30)} ${mapSFType(f.type).padEnd(25)} -- ${f.label}${meta.length ? ` [${meta.join(', ')}]` : ''}`);
  });

  if (argv.dryRun) {
    console.log('\n[Dry run — schema only, no data copied.]');
    process.exit(0);
  }

  // --- PostgreSQL: connect + create table ---
  const pgClient = await connectPG();

  await dropTableIfExists(pgClient, tableName);
  await createTable(pgClient, tableName, fields);
  console.log(`\nTable "${tableName}" created.`);

  // --- Fetch & insert data ---
  console.log('\n--- Fetching records ---');
  const records = await fetchRecords(conn, sfdcObject, fields, argv.limit);
  console.log(`Fetched ${records.length} record(s).`);

  if (records.length) {
    console.log('\n--- Inserting into PostgreSQL ---');
    await insertRecords(pgClient, tableName, fields, records);
  }

  await pgClient.end();
  console.log('\nDone.');
}

/** Quick type label helper for logging (not the PG mapping — that lives in lib/pg.js). */
function mapSFType(sfType) {
  const short = {
    string: 'string',
    reference: 'reference',
    id: 'id',
    boolean: 'boolean',
    int: 'int',
    long: 'long',
    double: 'double',
    decimal: 'decimal',
    currency: 'currency',
    date: 'date',
    datetime: 'datetime',
    time: 'time',
    textarea: 'textarea',
    picklist: 'picklist',
    multipicklist: 'multipicklist',
    percent: 'percent',
    phone: 'phone',
  };
  return short[sfType] || sfType;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
