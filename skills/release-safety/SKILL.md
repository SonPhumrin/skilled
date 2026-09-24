---
name: release-safety
description: Make a change safe to deploy and to undo. Use when a change touches a database schema or migration, environment or deploy config, a public API or wire format, or a feature flag, or when the user asks whether something is safe to ship or how to roll it back.
---

# Release safety

During a deploy, the old version and the new one run at the same time, against the same database and the same clients. A change is safe to ship when every combination of the two works, and safe to undo when you know, before shipping, what undoing it means.

Work through the checks that apply to the change. For each, state pass, fail with the fix, or not applicable with why. Every check ends on something you can point to: a migration file, a flag default, a written rollback step.

## Schema and data

- **Expand, migrate, contract.** A breaking schema change ships as three deploys: add the new shape beside the old (expand), move reads, writes, and existing data across (migrate), then remove the old shape once nothing uses it (contract). Rename a column = add, dual-write, backfill, switch reads, drop. The contract step is its own later change.
- **The old code survives the new schema.** Version N must keep working after version N+1's migration has run, because N is still serving traffic mid-deploy. Additive and nullable changes pass; a dropped or renamed column, or a new `NOT NULL` without a default, fails.
- **Schema and data changes are separate migrations.** A long backfill does not hold a schema lock. On a large table, check the migration won't lock writes for its whole run.
- **The migration has been run against a copy of real data**, not only an empty test database.

## Compatibility

- **Clients one version behind still work.** A changed API response, event, or message format stays readable by the previous consumer: add fields, don't rename or retype them. Removal is a contract step.
- **Config ships before the code that needs it.** A new environment variable or secret exists in every environment before the deploy that reads it, and the code fails loudly at startup, not on first use, if it is missing.

## Rollout

- **Risky behaviour ships behind a flag, default off.** The flag is the kill switch: turning it off must restore the old behaviour without a deploy. Name who turns it on, and the order (internal, a small percentage, everyone).
- **One signal says it's working.** Name the metric, log, or trace to watch after the deploy and the value that means "roll back". Call the Skill tool with "observability" if the change has nothing to watch yet.

## Rollback

Classify the change before shipping it:

- **Reversible**: redeploying the previous version fully undoes it. Say so.
- **Reversible with steps**: undoing it needs a down-migration, a flag flip, or a data fix. Write the steps down now, in the PR, while nobody is under pressure.
- **One-way door**: dropped data, a sent email, a migration with no inverse. Say so explicitly and get the user's go-ahead. The fix for a one-way door is a forward fix, so name what it would be.

Steps that only a person can do (running the migration in production, flipping the flag, rotating a secret) go in a runbook: call the Skill tool with "generate-runbook".

## Report

One line per check that applies: pass, or fail with the fix. Then the rollback class and, if not fully reversible, the steps. A failed check blocks shipping until it is fixed or the user explicitly accepts the risk.
