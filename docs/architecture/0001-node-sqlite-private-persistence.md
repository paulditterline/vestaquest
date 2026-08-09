# ADR 0001: Node SQLite for private persistence

Status: Accepted for private mode, 2026-08-09

## Context

VestaQuest needs durable sessions, command idempotency receipts, and presentation intents without requiring the owner to install or operate a database server. The selected runtime is pinned to Node.js 22.23.1.

## Decision

Private mode uses SQLite through Node's built-in `node:sqlite` `DatabaseSync` API. Synchronous database work is isolated inside `SqliteSessionRepository`, whose public contract remains Promise-returning. Mutating operations use `BEGIN IMMEDIATE` transactions so the session snapshot, receipt, and presentation intents commit atomically.

The schema is explicitly versioned through `schema_migrations`. Persisted JSON is treated as untrusted input and validated or deterministically replayed before it enters the session service.

## Consequences

- Private mode needs only one local database file and no native third-party package.
- The rest of the application remains independent of SQLite through `SessionRepository`.
- `node:sqlite` is marked active-development/experimental in the pinned Node 22 documentation. This risk is accepted for private alpha because the adapter is isolated and contract-tested. Node upgrades must rerun persistence, restart, corruption, and concurrency tests.
- Hosted/marketplace persistence remains unresolved until Gate F; this decision does not select a production multi-tenant database.

Reference: [Node.js 22 SQLite documentation](https://nodejs.org/docs/latest-v22.x/api/sqlite.html).
