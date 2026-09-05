---
name: database-performance
description: Query performance, indexes, and data access. Use when writing a query or migration, when an endpoint or page is slow, when adding an index, when working with an ORM that loads related records, when paginating, or when the database is the suspected bottleneck.
---

# Database Performance

Ordered by where the pain actually is. Most production database problems are a missing index; most of the rest are a query shape that loops; connection management is a distant third but takes the system down hardest when it goes.

## Measure before changing anything

Read the query plan before touching the schema. Every database will tell you what it is doing (`EXPLAIN ANALYZE`, `EXPLAIN FORMAT=JSON`, the profiler), and the answer is regularly not what the code suggests.

Look for: sequential scans on large tables, row-estimate errors of an order of magnitude or more, sorts spilling to disk, and nested loops over big inputs.

**No speculative indexes.** An index added on a guess costs write throughput and storage forever, in exchange for nothing. Find the slow query, read its plan, then index.

Find the slow queries from data, not intuition: the slow query log, `pg_stat_statements`, or the APM. Optimise by total time (calls multiplied by mean), not by worst single call. A 20ms query running ten thousand times an hour outranks a 3-second report nobody runs.

## Indexes

**Composite column order decides everything.** An index on `(tenant_id, created_at)` serves `WHERE tenant_id = ? ORDER BY created_at` and `WHERE tenant_id = ?`. It does not serve `WHERE created_at > ?` alone. Equality columns first, then the range or sort column.

**Match the index to the query shape** rather than defaulting to B-tree. Containment and array queries want GIN; geometric and range overlap want GiST; very large low-selectivity scans want BRIN. Using the wrong type is why an index sometimes changes nothing.

**Cover the query where it pays.** An index carrying the selected columns lets the database answer without touching the table at all. Worth it on a hot read path, not worth the width everywhere else.

**Partial indexes** for the query that only ever wants a slice: `WHERE status = 'pending'` on a table where pending is one percent of rows gives a small, hot index.

**Every index costs writes.** Each insert, update, and delete maintains every index on the table. An index nothing uses is pure cost, and unused indexes are visible in the stats views. Check for them before adding another.

**Index the foreign keys you join and filter on.** Most databases do not create these for you, and their absence also makes deletes on the parent table scan the child.

**Build indexes without locking** in production: `CREATE INDEX CONCURRENTLY` or the equivalent. The plain form holds a lock that stops writes for the duration.

## Query shape

**N+1 is the most common bug in this space.** One query fetches N rows, then the code loops and queries once per row. It is invisible in code review because the loop looks like ordinary iteration, and invisible in development because N is three there and three thousand in production.

The tell: a query inside a loop, or a lazy relation accessed inside one. The fix is to fetch the related data in one query up front (the ORM's eager-loading mechanism) or batch the lookups by key. Then confirm by counting queries, not by reading the code.

**Select the columns you use.** `SELECT *` drags every column across the wire and defeats covering indexes. It also breaks silently when someone adds a large column to the table.

**Filter in the database, not in the application.** Loading ten thousand rows to keep fifty is ten thousand rows of network, memory, and deserialization.

**Batch writes.** One statement inserting a thousand rows beats a thousand statements, by more than the round-trip count suggests.

**A function on an indexed column disables the index.** `WHERE lower(email) = ?` cannot use an index on `email`. Index the expression, or normalise on write.

**Beware `OFFSET` in the query planner's blind spot** and leading-wildcard `LIKE '%foo'`, which no ordinary index can serve; that is a full-text or trigram index.

## Pagination

`LIMIT ... OFFSET ...` makes the database walk and discard every skipped row. Page 1 is instant and page 5,000 is a table scan, so the failure arrives gradually and only in production.

**Keyset (cursor) pagination** instead: `WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT 20`. Constant time at any depth, because it seeks into the index rather than counting from the start. It also stays consistent while rows are being inserted, which offset does not.

Offset is fine for a small bounded set, an admin screen, or anywhere the user cannot reach a deep page. Keyset is the default for anything user-facing that grows.

`COUNT(*)` for a total page count is its own full scan. Ask whether the UI needs an exact total, and use an estimate or a "load more" affordance when it does not.

## Connections

Opening a connection costs 20 to 100 milliseconds of authentication, session setup, and server-side memory. Under load, an application that opens one per request spends more time connecting than querying, and exhausts the server's connection limit.

- **Pool, and size the pool deliberately.** More connections is not more throughput; past the point the database can service them, added connections add contention. The pool is a queue, and a small fast pool beats a large slow one.
- **Total connections across all instances must fit under the server limit.** Ten instances with a pool of twenty is two hundred connections, and autoscaling multiplies it.
- **Serverless and per-request environments need an external pooler** (PgBouncer, RDS Proxy, or the platform's own), because each invocation would otherwise open its own connection.
- **Set statement and idle-transaction timeouts.** One runaway query holding a connection is a slow leak; an idle transaction holding locks is an outage.

## Transactions

- **Short.** A transaction holds locks for its whole life, and every other writer waits.
- **Never held across a network call.** Waiting on a third-party API inside a transaction converts their latency into your lock contention, and their outage into your outage.
- **Know the isolation level you are relying on.** Read-committed does not protect against the read-then-write race that most "check if exists, then insert" code contains. Use a unique constraint, `SELECT ... FOR UPDATE`, or an upsert instead of hoping.
- **Take locks in a consistent order** across the codebase, or two transactions touching the same two rows in opposite orders will deadlock.
- **Retry serialization failures**, which are expected under higher isolation levels rather than a bug.

## Migrations

- Adding a column with a default, adding an index, or changing a type can rewrite or lock the whole table. Check what your database version actually does before running it on a large table in production.
- Backfill in batches with a pause, not in one statement.
- Expand and contract: add the new shape, migrate the reads and writes, then remove the old one. Three deploys, no downtime.

## Done means

For every query and migration you touched: you read a plan, no loop issues a query, pagination is keyset where the set grows, and any index you added has a query that uses it. Say which queries you checked.
