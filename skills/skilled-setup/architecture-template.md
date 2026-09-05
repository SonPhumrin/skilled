# Architecture: <project name>

The runtime shape of this system. An agent reads this before designing anything, so it knows what exists, what the constraints are, and what is deliberately not built.

## Shape

<A short prose paragraph or a diagram. What talks to what.>

| Component | Owns | Talks to |
| :--- | :--- | :--- |
| <service / app> | <the data and decisions it is responsible for> | <its dependencies> |

## Data stores

| Store | Technology | Holds | Notes |
| :--- | :--- | :--- | :--- |
| <name> | <Postgres 16 / Redis / S3> | <what lives here> | <replication, retention, anything surprising> |

## Async work

What runs outside the request cycle, and what deliberately does not.

| Job / queue | Trigger | Guarantees | Failure handling |
| :--- | :--- | :--- | :--- |
| <name> | <event or schedule> | <at-least-once, ordering, idempotency key> | <retries, DLQ> |

If nothing here is async, say so. "Everything is synchronous; there is no queue" is useful information that stops an agent assuming one exists.

## Seams

The places where behaviour can be swapped without editing in that place. Each seam names its interface and every adapter behind it.

| Seam | Interface | Adapters |
| :--- | :--- | :--- |
| <name> | <what a caller must know> | <production, test, other> |

## External integrations

| Service | Used for | Failure mode when it is down |
| :--- | :--- | :--- |

## Constraints

The real numbers and limits that decide whether a design is right. Speculative work gets justified against this section or not at all.

- **Scale**: <requests/sec, rows, users, data volume, growth rate>
- **Latency budget**: <p50/p99 targets for the paths that matter>
- **Availability**: <what downtime actually costs here>
- **Team**: <how many people maintain this, and their context>
- **Deployment**: <where it runs, how often it ships>

## Non-goals

What this system deliberately does not do, and will not be built to do. An agent proposing any of these is proposing a change of direction, and should say so rather than quietly building it.

- <Not multi-tenant. Single customer per deployment.>
- <No real-time updates. Polling is acceptable.>
- <Not designed for <scale we will not reach>.>

## Decisions

Non-obvious choices are recorded as ADRs in `docs/adr/`. Read the relevant one before changing something that looks wrong.
