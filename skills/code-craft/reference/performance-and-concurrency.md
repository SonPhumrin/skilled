# Performance and concurrency

Two questions that don't show up until the system is under real load or genuine parallelism, which is exactly when they're expensive to discover.

**Know the shape of your data before you pick the structure.** An `Array.includes` in a hot path is O(n) per check; a `Set`/`Map` is O(1). The bug isn't "arrays are slow," it's not knowing which one you wrote. Nested loops over the same collection (`for x in list: for y in list`) are O(n²) — fine at 50 items, an incident at 50,000. Before optimizing, name the actual complexity class you're in; most "make it faster" requests are really "get out of the wrong complexity class," which a faster constant factor at the wrong class can't fix.

**Measure the hot path, budget the cold path.** Not all code needs this scrutiny — a build script that runs once a day can be O(n²) and nobody notices. Ask whether this code runs per-request, per-row, or in a loop over user input; if not, this whole rung doesn't apply. Optimizing code nobody's waiting on is complexity spent on a future that isn't real (see `how-much-to-build.md`).

**Cost is more than complexity class.** Two O(n) algorithms can differ 100x on allocation, cache locality, or a hidden syscall — a network call inside a loop, a regex compiled per-iteration instead of once. Profile before assuming the Big-O fix is the whole story; "Big-O settles it" is as wrong an assumption here as "a rewrite settles it" is elsewhere.

**Concurrency needs a named answer for what protects the shared state.** Two requests touching the same row, counter, or cache entry at once is normal the moment there's more than one request, not an edge case. Every piece of shared mutable state needs a stated protection: a lock, a database row-level lock (`SELECT ... FOR UPDATE`), an atomic increment, or immutability — no shared state to race over in the first place. "It probably won't happen" is not an answer; it's the sentence that precedes the incident report.

**Check-then-act is a race, not a sequence.** Checking a condition and acting on it (`if not exists, then create`) is two operations a concurrent caller can interleave between — the classic TOCTOU (time-of-check to time-of-use) bug. Prefer a single atomic operation over a check followed by an act whenever the datastore offers one: `INSERT ... ON CONFLICT`, a compare-and-swap, an atomic counter.

**Lock the smallest scope that's still correct.** A lock held across a network call or the whole request turns every concurrent caller into a queue of one; a lock held too narrowly races on the state it was meant to protect. Widening a lock is the easy fix and the wrong one to reach for first — narrow the critical section before you widen the lock.

**Idempotency is the concurrency-safe default, not a special case.** A handler safe to run twice concurrently doesn't need a lock to prevent the second run — it needs the second run to be a no-op. This is the same idempotency `async-and-jobs.md` requires for retries; concurrent requests are retries you didn't ask for.

Read this when: writing code that runs per-request or in a loop over user-controlled input; two things might touch the same state at once (a counter, a row, a cache key, a file); the profiler or an incident points here; before reaching for a lock, a queue, or a "this should be rare" comment.
