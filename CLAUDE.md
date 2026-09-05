# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: sfdc-to-postgres

Replicate Salesforce object records to a PostgreSQL table — describe fields, create matching schema, and bulk-insert all rows.

## Running

### Prerequisites

Credentials must be in `.env` (see `.env.example`). Never commit `.env`.

### Usage

```bash
# Full sync (create table + copy all data)
SF_CLIENT_ID=xxx \
SF_CLIENT_SECRET=yyy \
PGHOST=localhost PGPORT=5432 PGDATABASE=db PGUSER=u PGPASSWORD=p \
node index.js Account

# Alias SFDC object name to a different PostgreSQL table name
node index.js Contact -t contact_list

# Fetch only N rows (schema + data)
node index.js Account -l 100

# Schema-only preview (no data copied)
node index.js Account --dryRun

# Use an existing access token instead of doing OAuth2 auth
SF_ACCESS_TOKEN=eaUTk... node index.js Account
```

**CLI flags:**

| Flag | Alias | Type | Description |
|---|---|---|---|
| `<sfdcObject>` (positional, required) | — | string | Salesforce sObject name (e.g. `Account`, `Contact`) |
| `--tableName` | `-t` | string | Override PostgreSQL table name (defaults to sObject name) |
| `--dryRun` | `-d` | boolean | Create schema only, skip data copy |
| `--limit` | `-l` | number | Max rows to fetch from Salesforce |

## Architecture

```
index.js              CLI entry point — arg parsing (yargs), orchestrate SFDC→PG pipeline
├── lib/sfdc.js       Salesforce layer: OAuth2 connect, describeSObject, parse fields, query records
│                       auth precedence: SF_ACCESS_TOKEN → client_credentials OAuth2 → error
├── lib/pg.js         PostgreSQL layer: type mapper (SF → PG), sanitiser, table DDL, bulk INSERT
│                       mapFieldType(): precision/scale → NUMERIC(p,s); standard SF types → baseType; length-only fields fall through to typeMap
│                       insertRecords(): parameterised multi-row INSERT in BATCH_SIZE=100 chunks
├── lib/sfdc.js       Salesforce layer (continued): conn.query() returns QueryResult { records, totalSize, ... }
└── package.json      No build/lint/test scripts; dependencies: dotenv, jsforce 3.x, pg, yargs
```

Key implementation details:

- `lib/pg.js:mapFieldType()` checks `(precision > 0 && scale >= 0)` before NUMERIC — fields with `p=0,s=0` (the SF describe default) fall to the typeMap base.
- `lib/sfdc.js:fetchRecords()` handles both array and QueryResult return from `conn.query()` (jsforce v3).
- `index.js:connectSFDC()` supports three auth modes: existing token, client_credentials OAuth2, or error.

### Environment Variables

**Salesforce:**

| Variable | Required | Description |
|---|---|---|
| `SF_CLIENT_ID` | yes* | Connected App consumer key |
| `SF_CLIENT_SECRET` | yes* | Connected App secret |
| `SF_ACCESS_TOKEN` | alt | Bypass OAuth2; set instead of client_id/secret |
| `SF_LOGIN_URL` | no | Default: `https://login.salesforce.com` (sandbox URL for sandboxes) |

**PostgreSQL:**

| Variable | Required | Description |
|---|---|---|
| `PGHOST` | yes | PostgreSQL host (e.g. localhost, Docker container IP) |
| `PGPORT` | no | Default: `5432` |
| `PGDATABASE` | yes | Database name |
| `PGUSER` | yes | Database user |
| `PGPASSWORD` | yes | Database password |

## SFDC → PG Type Mapping

| Salesforce type | PostgreSQL column |
|---|---|
| string, reference, id, textarea, picklist, multipicklist, phone | TEXT |
| boolean | BOOLEAN |
| int | INTEGER |
| long | BIGINT |
| double, percent | DOUBLE PRECISION |
| decimal, currency | NUMERIC(precision, scale) |
| date | DATE |
| datetime | TIMESTAMP |
| time | INTERVAL |
| url | TEXT |
| address | TEXT |

Precision/scale preserved only when **both** `precision > 0` and `scale >= 0`. Fields with `p=0,s=0` (describe default) fall to the typeMap base.

## File Structure

```
CLAUDE.md              This file
.env                   Local credentials (gitignored)
.env.example           Template (if exists; currently not present)
index.js               CLI entry point + main pipeline orchestration
lib/sfdc.js            Salesforce connection, describe, parse, fetch
lib/pg.js              PG connect, type map, sanitiser, DDL, bulk insert
package.json           dotenv, jsforce, pg, yargs
.gitignore             node_modules/, .env, skills-lock.json, .claude/
```

## Development Notes

- No build step, linter, or test framework. Add them when the project grows beyond a script.
- Salesforce describe fields set `precision=0` and `scale=0` as defaults on all field types — the type mapper must check `> 0` not `!= null`.
- jsforce v3 `conn.query()` returns a QueryResult object `{ records, totalSize, done, nextRecordsUrl }`, NOT a plain array. Always access `.records`.
