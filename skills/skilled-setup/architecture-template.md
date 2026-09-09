# Architecture: <project name>

The runtime shape of this system. Read this before designing anything: what exists, what the real constraints are, and what is deliberately not built.

## Shape

<2-4 sentences: what talks to what, and where state lives. Point at an existing diagram if one's already true; don't draw a new one just for this file.>

## Constraints

The real numbers and limits that decide whether a design is right. This is the section the other skills actually read before proposing anything — speculative work gets justified against it or not at all.

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

## Worth knowing

Optional. Anything else genuinely load-bearing that a reader would otherwise get wrong or miss entirely: a data store playing an unusual role (Redis as the job queue, not just a cache), a background job with real guarantees, an external integration whose failure mode matters, a boundary between parts of the system a caller needs to respect. Skip anything that's either not true here or obvious from five minutes of reading the code — this section earns its place by preventing a wrong guess, not by being complete.

- <e.g. "Redis is the job queue, not just a cache — see JOBS.md">
