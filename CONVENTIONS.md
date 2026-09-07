# How skills are written here

Rules for anyone (human or agent) adding to or editing this repo.

## Invocation is the one axis

Every skill is either **model-invoked** or **user-invoked**. Nothing else about a skill's shape changes.

**Model-invoked** is the default. Omit `disable-model-invocation`. The `description` is model-facing and keeps rich trigger phrasing ("Use when the user asks for..., mentions..., is about to...") so auto-invocation actually fires. The test: could the agent usefully reach for this on its own?

**User-invoked** is for workflows a human starts. Set `disable-model-invocation: true`. The `description` becomes human-facing: a one-line summary read by a person scanning the slash-command menu, with trigger lists stripped. Costs nothing in context until typed; costs the human remembering it exists.

## The dependency invariant

A user-invoked skill may call a model-invoked skill. Nothing may call a user-invoked skill, including another user-invoked skill.

That is why `skilled` can only *name* the user-invoked skills for a human to pick from, while `clarify-requirements` can genuinely dispatch to `requirements-interview`.

When a step's precondition is a user-invoked skill, write it as an instruction for the human: "tell the user to run `/skilled-setup`". Never as a call.

## Dependencies are explicit tool calls

Write `Call the Skill tool with "module-design"`. Naming the tool is what fires it; a bare `/module-design` dropped into prose is read as a label, not a command.

One skill per call. Two skills is two calls: `Call the Skill tool twice, for "tdd" and "review-diff"`.

Reference material lives inside the skill that owns it. Other skills reach it by calling the Skill tool, never by `../other-skill/FILE.md`.

## Frontmatter

Stay inside the six-field Agent Skills spec wherever possible, so these skills also load on claude.ai, through the Skills API, and on OpenCode and Antigravity (both of which read `SKILL.md` directly, per [tests/MANUAL-CHECKS.md](tests/MANUAL-CHECKS.md)):

`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`

`disable-model-invocation` is a Claude Code extension. It appears only on user-invoked skills, which are Claude Code entry points anyway.

**Known cross-harness gap**: OpenCode and Antigravity both ignore frontmatter keys they do not recognize, rather than erroring on them. That makes `disable-model-invocation` safe to use everywhere (it is silently ignored, never rejected), but it also means those two harnesses have no way to honor it: every skill in this repo is model-selectable there, including the 21 meant to be typed by hand on Claude Code. There is no portable fix, since no such field exists yet in the open spec. Do not work around it by inlining user-invoked content into a model-invoked skill, or the split stops meaning anything on the one harness where it does work.

`description` (plus `when_to_use` if used) is truncated at 1,536 characters in the skill listing. Put the key use case first. One trigger per branch, and collapse synonyms that rename a single branch.

## Writing the body

- **Progressive disclosure.** Inline what every run needs. Push behind a pointer what only some branches reach. A supporting file earns its place when the material genuinely branches, not when the main file is merely long.
- **Single source of truth.** No rule stated in two skills. If two skills need it, one owns it and the other points.
- **Positive phrasing.** State the target behaviour. A prohibition drags the banned behaviour into context and half-reads as an instruction. Reserve prohibitions for hard guardrails, and pair each with its positive target.
- **Completion criteria.** Every step ends on a condition the agent can check. "Every changed file accounted for" beats "review the diff".
- **No no-ops.** An instruction the model already follows by default pays context and says nothing. Delete the whole sentence.

## Upstream provenance

Some of these skills are byte-derived ports from an external source (renamed, some also edited). Each such skill carries a `metadata.upstream` block recording the source repo, path, and commit it was forked from — required so the source's license terms stay attached to the derived file. Run `/skilled-update` to check whether upstream has moved since. A skill written fresh, even one inspired by an upstream skill's shape, carries no such block: tracking a rewrite against its inspiration would always show total drift, which is noise, not signal.

When you copy (not rewrite) a skill from an external source in the future, add the same block by hand, and confirm its license permits redistribution before doing so.

## Altitude

The design skills are split by altitude so no rule lives twice:

| Altitude | Skill |
| :--- | :--- |
| How much to build, cross-cutting laws, naming/shape, general data/system design | `code-craft` |
| Module interfaces and seams | `module-design` |
| Instrumentation | `observability` |

`code-craft` is itself split by altitude internally — see its `reference/` folder — so no rule lives twice there either. SOLID lives in `module-design` because it is module-level; KISS, YAGNI, and everything else in `code-craft` stays out of `module-design`.
