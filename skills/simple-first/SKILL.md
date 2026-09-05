---
name: simple-first
description: Build the smallest thing that works. Use before adding an abstraction, a queue, a cache, a config flag, a new service, or a dependency; when a solution feels heavier than the problem; when the user asks to simplify, says something is over-engineered, or asks whether a design is worth the complexity.
---

# Simple First

The default answer to added complexity is **no**. Complexity earns its place by pointing at a real constraint or a third repetition, never at a future that might arrive.

This skill covers **how much to build**. For which principle applies once you are building, call the Skill tool with "design-principles". For interface shape, call it with "module-design".

## Justify against the real system

Before adding infrastructure (a queue, a cache, a new service, a plugin system, an abstraction layer, a dependency), name the constraint that demands it. Read the **Constraints** and **Non-goals** sections of `ARCHITECTURE.md`.

- A constraint in that file justifies the work. Say which one.
- A **non-goal** settles it: the system is deliberately not built that way. Building it anyway is a change of direction, so raise it as one and let the user decide.
- No constraint either way means you are designing for an imagined future. Build the direct version.

State the justification out loud in one sentence before you build. If the sentence needs a hypothetical to make sense, the answer was no.

## The deletion test

Imagine removing the abstraction and inlining its body at every call site.

- Complexity **vanishes** and the call sites read fine: it was a pass-through. Remove it.
- Complexity **reappears** across N call sites: it earns its keep. Keep it.

Run this on abstractions you are about to write, not only on ones you find.

## The rule of three

Two similar things are a coincidence. Three is a pattern.

Duplicate the second time and write down what varies. By the third occurrence you know the real shape, and the abstraction you write fits it. An abstraction extracted from two examples encodes a guess about the third, and the third is what breaks it.

## Smells to scan your own output for

Read back what you just wrote and look for:

- A configuration flag nobody has asked to set
- An interface, base class, or abstract type with exactly one implementation
- A name assembling three roles: `BaseUserManagerFactory`, `AbstractServiceProvider`
- A generic type parameter with one instantiation
- Error handling for a state the types already make impossible
- A dependency added to replace twenty lines you could write
- An event, hook, or callback with one subscriber
- A layer that only forwards its arguments onward
- `options` or `config` objects where every caller passes the same thing
- A file created to hold one function used in one place

Each is a candidate, not a verdict. Apply the deletion test and say what you found.

## What simple does not mean

Simple is about **what you build**, not how carefully you build it. These stay:

- Error handling on paths that genuinely fail
- Input validation at system boundaries
- Tests for the behaviour you shipped
- Names that say what they mean

Cutting those is not simplicity, it is unfinished work. When the direct solution is genuinely harder to write than the layered one, say so and build the direct one anyway: the cost lands once on you, and the complexity would land forever on every reader.

## When you are asked for the complex version

If the user asks for something this skill would flag, say in one or two sentences what you would build instead and why. Then build what they asked for. Their call, made with the tradeoff visible.
