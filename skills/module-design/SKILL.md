---
name: module-design
description: Designing deep modules - small interfaces, clean seams, SOLID applied. Use when designing or restructuring a module's interface, deciding where a boundary goes, making code testable or easier for an agent to navigate, choosing between two structures, or when another skill needs the deep-module vocabulary.
---

# Module Design

Design **deep modules**: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface. The aim is leverage for callers, locality for maintainers, testability for everyone.

For the line-and-function level, call the Skill tool with "readable-code". For whether the module should exist, call it with "simple-first".

## Glossary

Use these terms exactly. Do not substitute "component", "service", "API", or "boundary". The consistent language is the point.

**Module**: anything with an interface and an implementation. Deliberately scale-agnostic: a function, class, package, or a slice spanning tiers. *Avoid*: unit, component, service.

**Interface**: everything a caller must know to use the module correctly. The type signature, and also invariants, ordering constraints, error modes, required configuration, and performance characteristics. *Avoid*: API, signature, which name only the type-level surface.

**Implementation**: what is inside a module. Distinct from **adapter**: a thing can be a small adapter with a large implementation (a Postgres repository) or a large adapter with a small implementation (an in-memory fake).

**Depth**: leverage at the interface. How much behaviour a caller or test can exercise per unit of interface they must learn. **Deep** is a large amount of behaviour behind a small interface. **Shallow** is an interface nearly as complex as the implementation.

**Seam** (Michael Feathers): a place where behaviour can be altered without editing in that place. The *location* at which an interface lives. Where the seam goes is a separate decision from what sits behind it. *Avoid*: boundary, which is overloaded with DDD's bounded context.

**Adapter**: a concrete thing satisfying an interface at a seam. Names a *role*, not a substance.

**Leverage**: what callers get from depth. One implementation pays back across N call sites and M tests.

**Locality**: what maintainers get from depth. Change, bugs, and verification concentrate in one place. Fix once, fixed everywhere.

## Deep and shallow

A **deep** module is a small interface over a large implementation. A **shallow** module has a large interface over a thin implementation that mostly forwards.

When designing an interface, ask:

- Can this expose fewer methods?
- Can these parameters be simpler?
- Can more of this complexity move inside?

## SOLID, in this vocabulary

The five principles say the same things this glossary says, in older words. Both are useful; they are stated together here so neither drifts.

**Single responsibility**: a module changes for one reason. That is what makes it deep rather than a grab bag, and it is why the deletion test works: a module with two reasons to change has two interfaces pretending to be one. The test is not "does it do one thing" (every useful module does many); it is "who asks for changes here", and the answer should be one kind of person or one kind of event.

**Open/closed**: extend behaviour by adding an adapter, not by editing the module. This is what a seam buys. It is also the most over-applied principle here, so pair it with the two-adapters rule below.

**Liskov substitution**: every adapter behind a seam honours the interface's *full* contract, including invariants, error modes, and performance characteristics. An in-memory fake that never fails where the real one times out has broken the interface even though it compiles. This is why "interface" here means more than the type.

**Interface segregation**: callers depend only on what they use. This is the core of depth. A caller forced to know about six methods to use one is paying interface cost for nothing, and the fix is usually to split the interface along its real caller groups.

**Dependency inversion**: modules accept their dependencies rather than constructing them. This is also the testability lever, since accepting a dependency is what creates the seam a test can substitute at.

## Principles

- **Depth is a property of the interface, not the implementation.** A deep module can be internally composed of small swappable parts; they are simply not part of the interface. A module can have **internal seams** used by its own tests as well as the **external seam** at its interface.
- **The deletion test** decides whether a module earns its keep. It is owned by `simple-first`; call the Skill tool with it when the question is whether the module should exist at all rather than what shape it takes.
- **The interface is the test surface.** Callers and tests cross the same seam. Wanting to test *past* the interface means the module is the wrong shape.
- **One adapter is a hypothetical seam. Two adapters is a real one.** Introduce a seam when something actually varies across it. A test double counts as a second adapter only when the seam is where the test genuinely needs to substitute, not when the double exists to work around a design you could have made direct.

## Designing for testability

1. **Accept dependencies, do not construct them.**

   ```
   processOrder(order, paymentGateway)      // testable
   processOrder(order)                      // constructs StripeGateway inside
   ```

2. **Return results rather than producing side effects.**

   ```
   calculateDiscount(cart): Discount         // testable
   applyDiscount(cart): void                 // mutates, observable only indirectly
   ```

3. **Small surface area.** Fewer methods, fewer tests. Fewer parameters, simpler setup.

## Relationships

- A **module** has exactly one **interface**.
- **Depth** is a property of a **module**, measured against its **interface**.
- A **seam** is where a **module**'s **interface** lives.
- An **adapter** sits at a **seam** and satisfies the **interface**.
- **Depth** produces **leverage** for callers and **locality** for maintainers.

## Rejected framings

- **Depth as a ratio of implementation lines to interface lines** (Ousterhout): rewards padding the implementation. Depth here is leverage.
- **"Interface" as the language keyword or a class's public methods**: too narrow. Interface here is every fact a caller must know.
- **"Boundary"**: overloaded with DDD. Say **seam** or **interface**.

## Going deeper

- **Deepening a cluster given its dependencies**: see [DEEPENING.md](DEEPENING.md) for dependency categories, seam discipline, and replace-do-not-layer testing.
- **Exploring alternative interfaces**: see [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md) for designing the interface several radically different ways in parallel, then comparing on depth, locality, and seam placement.
