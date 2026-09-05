# sfdc-to-postgres

Replicate Salesforce object records into a PostgreSQL table — auto-generate the schema from a Salesforce describe, then bulk-copy all rows.

## What it does

1. Connects to Salesforce via OAuth2 (Connected App)
2. Calls `describeSObject` on the target object (e.g. Account, Contact, Opportunity)
3. Maps each SFDC field type to its PostgreSQL equivalent and generates a `CREATE TABLE` statement
4. Drops the existing table (if any), creates the new schema, and bulk-inserts all records in batches of 100

## Prerequisites

### 1. Salesforce Connected App

You need a Connected App with OAuth permissions to get your `ClientId` and `ClientSecret`:

1. Log in to **Setup** → type **App Manager** in the Quick Find box → click **New Connected App**
2. Fill in:
   - **Connected App Name** — e.g. `sfdc-to-postgres`
   - **API Name** — auto-filled
   - **Contact Email**
3. Under **OAuth Settings**, check **Enable OAuth Settings**
4. Set **Callback URL** — any valid URL (e.g. `http://localhost:17100/callback`) — not used for the `client_credentials` grant but required by Salesforce
5. Under **Selected OAuth Scopes**, add:
   - **Access management API** (`access_mgt`)
6. Save the app

Your **Consumer Key** is the **Client ID**. Click **Manage** → **Policies** to confirm the IP wildcard `0.0.0.0/0` is allowed (or restrict it).

### 2. PostgreSQL

You need a running PostgreSQL instance with a database created:

```sql
CREATE DATABASE sfdc_sync;
```

### 3. Install dependencies

```bash
npm install
```

## Setup

Create a `.env` file in the project root:

```env
# Salesforce (Connected App)
SF_CLIENT_ID=<your_consumer_key>
SF_CLIENT_SECRET=<your_client_secret>
SF_LOGIN_URL=https://login.salesforce.com    # use sandbox URL for sandboxes

# PostgreSQL
PGHOST=localhost
PGPORT=5432
PGDATABASE=sfdc_sync
PGUSER=postgres
PGPASSWORD=your_password
```

| Variable | Required | Description |
|---|---|---|
| `SF_CLIENT_ID` | yes* | Connected App Consumer Key |
| `SF_CLIENT_SECRET` | yes* | Connected App Secret |
| `SF_ACCESS_TOKEN` | alt | Bypass OAuth2 with an existing token (set instead of client_id/secret) |
| `SF_LOGIN_URL` | no | Default: `https://login.salesforce.com`. Use the sandbox URL for sandbox orgs. |
| `PGHOST` | yes | PostgreSQL host |
| `PGPORT` | no | Default: `5432` |
| `PGDATABASE` | yes | Database name |
| `PGUSER` | yes | Database user |
| `PGPASSWORD` | yes | Database password |

## Usage

### Full sync — create table + copy all data

```bash
node index.js Account
```

This creates a PostgreSQL table named `Account` with columns matching every describe field, then copies all rows.

### Rename the output table

Use a different table name while keeping the SFDC object name:

```bash
node index.js Contact -t contacts
```

### Fetch only N rows

```bash
node index.js Account -l 50
```

### Schema-only preview (no data copied)

```bash
node index.js Opportunity --dryRun
```

Prints column definitions and DDL, then exits — useful for verifying the type mapping before copying data.

## SFDC → PG Type Mapping

| Salesforce type | PostgreSQL column |
|---|---|
| string, reference, id, textarea, picklist | TEXT |
| boolean | BOOLEAN |
| int | INTEGER |
| long | BIGINT |
| double, percent | DOUBLE PRECISION |
| decimal, currency | NUMERIC(precision, scale) |
| date | DATE |
| datetime | TIMESTAMP |
| time | INTERVAL |
| url, address | TEXT |

Precision and scale are preserved only when both `precision > 0` and `scale >= 0`. Fields with describe-default `p=0, s=0` fall to the type map base.
