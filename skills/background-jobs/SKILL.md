---
name: background-jobs
description: Queues, workers, and anything running outside the request cycle. Use when adding a background job, worker, scheduled task, or queue; when writing or changing a job handler; when a job runs twice, gets stuck, or fails silently; or when deciding whether work should be async at all.
---

# Background Jobs

Work that leaves the request cycle gains a whole failure surface: it can run twice, run late, run out of order, or never run. Every rule here exists to make one of those survivable.

## First: does this need to be async?

A queue is infrastructure, and infrastructure defaults to no. Do the work synchronously when:

- It finishes inside the latency budget in `ARCHITECTURE.md`
- The user needs the result to continue
- Failure should be visible to the caller right now

Move work to a job when one of these is true, and say which:

- It is genuinely slow (video processing, a large export, a third-party call with an unbounded tail)
- It must survive the request ending (an email that still sends if the browser closes)
- It is naturally scheduled rather than triggered
- It must be retried independently of the caller

If the reason is "it feels cleaner", it is not a reason. Call the Skill tool with "simple-first".

An `ARCHITECTURE.md` that says everything is synchronous is a design decision. Adding the first queue changes that, so raise it rather than slipping it in.

## Handlers run more than once

Delivery is at-least-once. A worker that crashes after doing the work but before acknowledging will see the same job again. This is not an edge case; it is the normal operation of every queue worth using.

So **every handler is idempotent**, meaning a second run changes nothing. Pick the mechanism that fits:

- **Unique constraint in the database.** The cleanest, because the guarantee lives where the data lives. Insert with a natural key and let a conflict mean "already done".
- **Idempotency key on the external call.** Payment providers and most modern APIs accept one. Derive it from the job, not from a random value generated at call time.
- **Upsert instead of insert.** Works when the operation is naturally a set-to-this rather than an add-one.
- **Completion check at handler entry.** Read the record, return early if it is already in the target state. The weakest of the four, because two workers can pass the check together, so pair it with a constraint or a lock.

Effects with no natural key (sending an email, charging a card without an idempotency key) need a processed-jobs table written in the same transaction as the effect, or the effect happens twice.

## Retries

**Exponential backoff with jitter.** 1s, 2s, 4s, 8s, each multiplied by a random factor. Without jitter, everything that failed together retries together, and the retry storm is often what keeps the dependency down.

**A bounded attempt count.** Unbounded retry is a queue that never drains.

**Classify the error before retrying.** This is the part most often skipped:

- **Transient** (timeout, connection reset, 429, 503, deadlock): retry with backoff.
- **Permanent** (validation failure, 401, 403, 404, a row that no longer exists, a serialization error in the payload): do not retry. Nothing changes on the second attempt except the time wasted. Send it straight to the dead-letter queue.

Retrying a permanent failure burns the attempt budget that a transient failure later in the same job might have needed.

## Dead-letter queue

Failed jobs go somewhere inspectable, with the error and the payload attached. A job that fails into a log line is a job nobody will ever fix.

**Treat DLQ depth as a metric, not a bin.** It is the leading indicator that processing is broken: it rises before the user-visible symptom does. Alert on it rising, not on it being non-zero.

Draining the DLQ means fixing the cause and replaying, which only works because handlers are idempotent.

## The write-then-publish problem

Writing to the database and enqueueing a job are two operations that can partially fail. Commit the write and crash before the enqueue and the job never runs; enqueue first and roll back the write and the job runs against data that does not exist.

**The outbox pattern** fixes it: write the job into an outbox table *in the same transaction* as the data change. A separate process polls the outbox and publishes. Now the two either both happen or neither does.

Its cost, stated so it is not cargo-culted: jobs are not enqueued instantly, they wait for the next poll. A few seconds of delay is fine for most work and unacceptable for some. Use the outbox when a lost job is a correctness problem (money, orders, state machines). Enqueue directly when a lost job is an inconvenience.

## Shape of a job

- **Payloads carry identifiers, not objects.** Send `{invoiceId}`, not the serialized invoice. A serialized payload is stale by the time it runs, and it breaks the moment the shape changes while jobs are in flight.
- **Payloads must survive a deploy.** A job enqueued by the old version is consumed by the new one. Add fields, do not repurpose them.
- **Long jobs checkpoint.** A four-hour job that restarts from zero will never finish on a busy cluster. Process in batches and record progress.
- **Workers run as separate processes** from the web tier, so a queue backlog does not consume the capacity serving requests, and the two scale independently.
- **Separate queues by latency requirement**, not by feature. A nightly export sharing a queue with password-reset emails means the reset waits behind the export.
- **Set a visibility timeout longer than the job's worst case**, or the queue hands the job to a second worker while the first is still running it.

## Scheduled work

- A cron that fires on every instance runs N times. Use a leader election, a lock, or a scheduler that guarantees single delivery.
- A schedule that fires while the previous run is still going needs an overlap policy: skip, queue, or run concurrently. Decide it rather than discovering it.
- Missed runs after downtime: decide whether to catch up or skip forward.

## Instrumenting

Queue depth, oldest-job age, DLQ depth, and per-job-type duration and failure rate. Oldest-job age is the one that catches a silently stalled worker, since depth alone looks normal when nothing is being added either. For the wider picture, call the Skill tool with "observability".

## Done means

Every handler you wrote or changed: idempotent by a named mechanism, errors classified, retry policy set, failures reaching the DLQ, payload carrying identifiers. Say which mechanism each one uses.
