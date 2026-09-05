---
name: design-principles
description: The cross-cutting design laws and when to break them - cohesion and coupling, Law of Demeter, command-query separation, composition over inheritance, illegal states, fail fast. Use when deciding between two designs, when code feels tangled or fragile, when a change ripples further than expected, or when the user asks which principle applies.
---

# Design Principles

Principles you **apply**, not recite. Each one states the failure it prevents and the cost of following it too far, because a principle without a stated cost turns into cargo cult, and cargo cult is over-engineering wearing a nicer shirt.

Two families live elsewhere, so no rule is stated twice:

- **SOLID**, and anything about interface shape or seams: call the Skill tool with "module-design".
- **KISS and YAGNI**, and anything about how much to build: call the Skill tool with "simple-first".

## High cohesion, low coupling

The root the others reduce to.

**Cohesion** is how much the things inside one module belong together. **Coupling** is how much one module must know about another. Separation of concerns is the process; these two are the measurement.

*Prevents*: the change that should touch one file and touches nine.

**Applying it**: group by what changes together, not by what looks alike. A `utils/` directory full of unrelated helpers is low cohesion wearing a tidy name. Two modules that must always be deployed together are one module.

**The tell**: you changed one behaviour and edited four files that have nothing to do with each other. Or you opened one file and it handles authentication, date formatting, and CSV export.

**Cost**: pushed hard, this produces many tiny modules that are individually cohesive and collectively unnavigable. Cohesion is served by putting related things together, which sometimes means a bigger file, not a smaller one.

## Law of Demeter

Talk to your immediate collaborators, not to their collaborators.

`order.customer.address.country.code` couples the caller to four types to read one string. Every one of them can now break this line.

*Prevents*: a change to a distant type breaking code that never knew it existed.

**Applying it**: ask the nearest object for what you need. `order.shippingCountryCode()` hides the walk, and the walk changes in one place.

**Cost**: applied literally, it generates a delegating method on every object for every field anyone might want, which is wrapper sprawl and its own kind of coupling. The rule bites on **behaviour**, not on data structures: walking a plain nested config object or a parsed JSON response is fine. Reach for it when the chain crosses module boundaries or when the intermediate objects have behaviour of their own.

## Command-query separation

A function either changes state or answers a question. Not both.

*Prevents*: the caller who logs a value and mutates the system doing it. Callers can safely call a query twice, reorder it, cache it, or drop it in a debug statement, and none of that is true of a command.

**Applying it**: `getNextId()` that increments a counter is a command wearing a query's name. Split it, or name it for what it does: `reserveNextId()`.

**Cost**: some operations genuinely are both, and forcing them apart makes them non-atomic, which is worse. Pop from a stack, compare-and-swap, and `INSERT ... RETURNING` are commands that must return a value. Keep them together and name them so the mutation is unmissable.

This is the line-level shape of the idempotency rule in `background-jobs`: a query is safe to run twice by construction.

## Composition over inheritance

Assemble behaviour from parts you hold rather than from a parent you extend.

*Prevents*: being coupled to a base class's entire future. Every method the parent adds becomes yours, including the ones that contradict what your subclass means.

**Applying it**: an object that *has* a `Formatter` can swap it, test it, and have two. An object that *is* a `BaseFormatter` can do none of those. Reach for inheritance when the subtype is genuinely substitutable everywhere the parent is used and the hierarchy is stable.

**Cost**: composition moves wiring to the construction site. When five parts must always be assembled the same way, that assembly is itself a thing worth naming rather than repeating.

## Make illegal states unrepresentable

Encode constraints where the type system, schema, or constructor can enforce them, so invalid data cannot be built in the first place.

*Prevents*: whole classes of validation, and the bug where one path forgot to run it.

**Applying it**: a union of `{status: "loading"} | {status: "loaded", data: T}` beats an object with optional `data` and a boolean, because the state "loaded but no data" stops existing. A `NonEmptyList` removes every "what if it is empty" branch downstream. A database `NOT NULL` with a `CHECK` constraint outranks a comment saying the column is always positive.

**The tell**: you are writing a guard for a state that only exists because the type allows it.

**Cost**: expressive types can outrun the team reading them. Stop where the type is harder to understand than the check it replaced.

## Fail fast at the boundary

Validate on entry, then trust the data inward.

*Prevents*: bad data travelling three layers before failing somewhere that cannot say what went wrong.

**Applying it**: parse and validate at every system boundary (HTTP handler, queue consumer, file reader, third-party response) and convert to a type that carries the guarantee. Inside that boundary, no defensive re-checking. Re-validating in the core is a sign the boundary is not doing its job, and it hides which layer is actually responsible.

Fail loudly on programmer error (a broken invariant, an impossible branch). Fail gracefully on user and network error, which are expected conditions, not bugs.

**Cost**: none worth trading away. The mistake is validating everywhere instead of at the edge.

## Explicit over implicit

The reader should be able to see what happens without knowing what is registered elsewhere.

*Prevents*: action at a distance, and the debugging session that ends at a decorator in a file nobody opened.

**Applying it**: dependencies passed in beat globals reached out to. A function that says it takes a clock beats one that reads the system time. Behaviour that changes with an environment variable is behaviour, so it belongs in the signature or in `ARCHITECTURE.md`, not in a `.env` nobody reads.

**Least astonishment** is the same principle aimed at names: a function called `getUser` that sends an email has lied, and every reader after you pays for it.

**Cost**: explicit wiring is more typing. Pay it. The reader outnumbers the writer.

## Using these

When two designs are in play, name which principle separates them and what it costs to follow. A design chosen because a principle said so, with no cost stated, has not been designed.
