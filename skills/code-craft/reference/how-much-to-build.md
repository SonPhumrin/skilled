# How much to build

The default answer to added complexity is **no**. Complexity earns its place by pointing at a real constraint or a third repetition, never at a future that might arrive.

**Justify against the real system.** Before adding infrastructure — a queue, a cache, a new service, a plugin system, an abstraction layer, a dependency — name the constraint that demands it. Read `ARCHITECTURE.md`'s **Constraints** and **Non-goals**. A constraint justifies the work; say which one. A non-goal settles it the other way — the system is deliberately not built that way, so building it anyway is a change of direction, raised as one, not slipped in. No constraint either way means you're designing for an imagined future: build the direct version. State the justification in one sentence before you build it; if the sentence needs a hypothetical to make sense, the answer was no.

**The deletion test.** Imagine inlining the abstraction's body at every call site. If the complexity vanishes and the call sites still read fine, it was a pass-through — remove it. If the complexity reappears across N call sites, it earned its keep. Run this on abstractions you're about to write, not only ones you find.

**The rule of three.** Two similar things are a coincidence; three is a pattern. Duplicate the second time and write down what varies. By the third occurrence you know the real shape, and the abstraction fits it. One extracted from two examples encodes a guess about the third, and the third is what breaks it.

**Smells to scan your own output for**: a configuration flag nobody asked to set; an interface or base class with exactly one implementation; a name assembling three roles (`BaseUserManagerFactory`); a generic type parameter with one instantiation; error handling for a state the types already make impossible; a dependency added to replace twenty lines you could write; an event or hook with one subscriber; a layer that only forwards its arguments; an `options` object where every caller passes the same thing; a file created to hold one function used in one place. Each is a candidate, not a verdict — apply the deletion test.

**What simple does not mean.** Simple is about what you build, not how carefully. These stay regardless: error handling on paths that genuinely fail, input validation at system boundaries, tests for the behaviour you shipped, names that say what they mean. Cutting those isn't simplicity, it's unfinished work.

If the user asks for something this section would flag, say in a sentence what you'd build instead and why, then build what they asked for. Their call, made with the tradeoff visible.
