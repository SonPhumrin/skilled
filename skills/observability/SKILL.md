---
name: observability
description: Logging, metrics, tracing, and alerts. Use when adding logging to new code, when an incident was hard to debug after the fact, when setting up or changing monitoring and alerts, or when the user asks how they would know something is broken.
---

# Observability

The question this answers: when this breaks at 3am, what will the on-call person be able to see? Instrumentation added while writing the code costs minutes; added during an incident it costs the incident.

## Logs

**Structured, not interpolated.** Emit fields, not sentences: `{event: "invoice.settled", invoiceId, tenantId, durationMs}` rather than a formatted string. The sentence is unqueryable, and querying is the entire point.

**Every log line carries a correlation ID** propagated from the request or job that started the work, through every service and every job it spawns. Without it, a distributed system produces a pile of unrelated lines. This is the single highest-value thing on this page.

**Log levels mean something:**

- `error`: a human needs to act. If nobody would act, it is not an error.
- `warn`: degraded but handled. The retry that succeeded, the fallback that fired.
- `info`: business events worth reconstructing later. Orders placed, jobs completed, deploys.
- `debug`: off in production.

An `error` level nobody acts on trains everyone to ignore the channel, which is how a real one gets missed.

**Log at the boundaries**: request in and out, job start and end, every external call with its duration and outcome. The inside of a function is rarely where the answer is.

**Errors log with context, once.** The identifiers, the operation, the input shape, and a stack trace. Log at the point you handle it, not at every layer it passes through, or one failure becomes five entries that look like five failures.

**Never log**: credentials, tokens, card numbers, personal data, full request bodies containing any of the above. Log identifiers instead and look the data up. This survives a log aggregator's retention policy and everybody with read access to it.

**Never log per row.** A loop that logs each iteration produces a million lines that cost money and hide the one line that mattered.

## Metrics

Metrics tell you *that* something is wrong and how widely. Logs tell you *what*. Traces tell you *where*.

**Per endpoint and per job type, the three that matter**: request rate, error rate, and duration as a distribution.

**Percentiles, not averages.** An average latency of 200ms hides a p99 of 8 seconds, and the p99 is a real group of users having a bad time every time. Track p50, p95, p99.

**Per resource**: utilisation, saturation, and errors. Saturation, meaning the queue or wait depth, is the leading indicator; utilisation looks fine right up until it does not.

**For anything async**, from `background-jobs`: queue depth, oldest-job age, DLQ depth, per-type failure rate. Oldest-job age catches the stalled worker that depth alone misses.

**Watch cardinality.** A label carrying a user ID, a request ID, or a URL with an ID in it multiplies your time series into a bill and an outage. Labels take bounded values: endpoint template, status class, job type, region.

**Business metrics alongside technical ones.** Orders per minute catches breakages that every technical metric reports as healthy, because a service returning 200s with wrong content looks perfect from the infrastructure side.

## Traces

A trace follows one request across services and shows where the time went. Instrument at the **seams** the design already has, since those are the boundaries worth measuring anyway. For that vocabulary, call the Skill tool with "module-design".

Spans get meaningful names and the identifiers needed to correlate them with logs. Sample aggressively on volume, but keep every trace that errored or ran slow, since those are the ones anyone will look at.

## Alerts

**Alert on symptoms, not causes.** "Checkout error rate above 2% for five minutes" is actionable. "CPU above 80%" is not: high CPU during a successful batch job is fine, and low CPU during a total outage is normal.

**Every alert has an owner, a runbook, and a plausible action.** An alert nobody can act on is noise, and noise is what makes people mute the channel that later carries the real one.

**Page on user-visible breakage. Ticket everything else.** Anything that can wait until morning waits until morning, or the on-call rotation burns out and stops reading.

**Alert on the rate of change too**, not only thresholds. DLQ depth climbing steadily is a problem well before it crosses any number you would have picked.

**Delete alerts that have fired ten times and never mattered.**

## Health checks

Distinguish **liveness** (the process is alive, restart it if not) from **readiness** (it can serve traffic, take it out of the pool if not). Conflating them produces restart loops during a dependency blip.

A readiness check that calls every dependency turns one dependency's outage into a total one. Check what this instance actually needs to serve.

## Done means

For the code you wrote: errors log with identifiers and context, external calls are timed, anything async reports depth and age, no secret or personal data reaches a log, and you can name the signal that would have caught the failure mode you are most worried about.
