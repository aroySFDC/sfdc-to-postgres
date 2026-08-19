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
  console.log(
    'API Usage: %d / %d',
    conn.limitInfo.apiUsage.used,
    conn.limitInfo.apiUsage.limit
  );

  return conn;
}

/**
 * Query records from a Salesforce object.
 */
async function queryAll(conn, sobject, fields, where) {
  const base = `SELECT ${fields} FROM ${sobject}`;
  const query = where ? `${base} WHERE ${where}` : base;
  console.log('Querying:', query);

  const records = [];
  return new Promise((resolve, reject) => {
    conn
      .query(query)
      .on('record', (record) => records.push(record))
      .on('end', () => resolve(records))
      .on('error', (err) => reject(err));
  });
}

/**
 * Example usage — query Account records.
 */
async function main() {
  const conn = await connectSFDC();

  const accounts = await queryAll(
    conn,
    'Account',
    'Id, Name, Industry, AnnualRevenue',
    "Industry = 'Technology'"
  );

  console.log('\nFound %d records:', accounts.length);
  for (const acc of accounts.slice(0, 10)) {
    console.log(' - %s | %s | $%s', acc.Name, acc.Industry, acc.AnnualRevenue);
  }

  if (accounts.length > 10) {
    console.log('  ... and %d more', accounts.length - 10);
  }

  return conn;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
