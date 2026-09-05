---
name: readable-code
description: Naming, function shape, control flow, and comments. Use when writing or refactoring any function, when a function grows past a screen or nests deeply, when picking names for variables, functions, or types, when the user asks to clean up or tidy code, or when a code review flags readability.
---

# Readable Code

The line-and-function level. This is where working code goes wrong in ways tests never catch, because it compiles and passes.

For interface shape and where a module's boundary belongs, call the Skill tool with "module-design". For whether the code should exist at all, call it with "simple-first".

## Naming

**Names state intent, not type or mechanism.** `activeUsers` over `userArray`, `userList`, or `data2`. The type is already in the type; the name is for the meaning.

**Booleans read as assertions.** `isExpired`, `hasAccess`, `shouldRetry`. A reader must be able to say the name aloud in an `if` and have it be a sentence.

**Functions are verb phrases named for what the caller gets**, not for how it happens. `findOverdueInvoices` beats `queryInvoiceTableWithDateFilter`: the second one lies the moment you add a cache.

**Length scales inversely with scope.** A loop index living for two lines can be `i`. A module export living for years cannot. The reader of a short-lived name has the definition on screen; the reader of an exported name does not.

**No unexplained abbreviations.** `req`, `res`, `id`, `db` are conventions and carry. `usrMgrCfg` is a puzzle.

**One concept, one word, everywhere.** If it is a `Reconciliation` in the schema, it is not a `Settlement` in the service and a `Match` in the UI. When `CONTEXT.md` exists, read it and use its terms exactly; that file is the source of truth for domain names.

**Reveal the unit.** `timeoutMs`, `sizeBytes`, `priceCents`. Units in names have prevented more bugs than any comment.

**A name you cannot find is a design signal.** When no honest name fits, the function is doing more than one thing. Split it and name the pieces.

## Function shape

**One level of abstraction per function.** A function that both orchestrates steps and manipulates bytes forces the reader to change altitude mid-read. Keep the high-level function reading like a summary of what happens.

**Guard clauses over nesting.** Handle the exceptional and early-exit cases first, then let the happy path run flat at the base indentation:

```
if (!user) return null;
if (!user.isActive) return null;
// happy path, unindented
```

rather than wrapping the real work in two levels of `if`. The reader of the flat version sees the main behaviour without holding conditions in their head.

**Nesting past three levels is the refactor signal.** Not a rule about taste: control-flow depth is what makes a function hard to hold. Extract the inner block into a named function, invert the condition into a guard, or move the loop body out.

**Complexity over roughly ten independent paths means extract.** Count the branches: each `if`, `&&`, `||`, `case`, `catch`, and loop adds one. Under ten is comfortable and testable; well over it means the function has become several functions sharing an indentation level.

**No boolean flag parameters.** `render(data, true)` tells the reader nothing, and the `true` branch and `false` branch are usually two different functions sharing a body. Write `renderCompact` and `renderFull`. Where the flag genuinely belongs, pass a named option so the call site reads.

**Parameter count is a design signal.** Past three or four, the parameters that always travel together want to be one type.

## Control flow

**Return early.** A function with one return at the bottom and a nest above it is harder to read than one that exits as soon as it knows the answer.

**Extract complex conditions into named predicates.** `if (isEligibleForRefund(order))` beats a three-clause boolean expression, and the name documents the rule in a place a reader will look.

**Pick loop form for clarity, not doctrine.** `map`, `filter`, and `reduce` say what the result is, which is usually clearer. A plain loop is clearer when the body has side effects, needs an early exit, or is genuinely imperative. A `reduce` that builds an object over eight lines is not clearer than the loop it replaced.

**Name the loop's product.** `const overdue = invoices.filter(...)` beats accumulating into `result`.

**Do not mutate a parameter the caller still holds.** Return a new value, or document the mutation in the name (`sortInPlace`).

**Handle the whole space.** Exhaustive `switch` with no silent default, so adding a case breaks the compile rather than falling through in production.

## Comments

**Comment the why, never the what.** A comment restating the code is a naming bug with extra steps, and it goes stale the first time the code changes.

Write a comment when the reader would otherwise ask a question the code cannot answer:

- Why this looks wrong but is correct
- The ordering constraint that is not visible from here
- The workaround, with the upstream issue linked
- The reason a slower approach was chosen
- The regulation, contract, or spec a magic number comes from

**Delete commented-out code.** Version control already has it.

**A `TODO` carries a name and a condition**, or it is decoration.

## Errors at the line level

**Never swallow.** A bare `catch {}` converts a fault into a mystery. Catch what you can act on, and let the rest travel.

**Errors carry context.** "Failed to load" is unusable; "failed to load invoice 4821 for tenant acme: connection timeout" is a fixed bug.

**The failure path is as readable as the success path.** It is the path that runs when someone is already having a bad day.

**Catch narrow.** Catching the base error type to handle one case buries the four you did not anticipate.
