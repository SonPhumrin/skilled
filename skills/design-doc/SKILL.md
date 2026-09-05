---
name: design-doc
description: "Research and write a pre-spec architecture design doc for work big enough to need one: new-project bootstraps, large features, non-obvious integrations. Saves a local design.md instead of publishing to the issue tracker."
disable-model-invocation: true
---

This skill produces the architecture document that `write-spec` doesn't have room for: researched alternatives, module/seam tradeoffs, and (for a new project) the tech-stack and design-system choices. Reach for it before `/write-spec` when the work has a real architecture question — not for every feature.

Do NOT interview the user; build on the interview (`/domain-interview` or `/clarify-requirements`) and any conversation that already happened.

## Process

1. If a repo already exists, explore it and read `CONTEXT.md`/`ARCHITECTURE.md`/any ADRs in the area you're touching, so the design uses established terms and respects existing constraints. If this is a greenfield project, skip exploration; treat whatever stack, UI framework, or color scheme you've already been given as decided inputs to record, not questions to re-ask.

2. For each open technical question — framework behaviour, library capability, API contract, how a CLI scaffolds something — call the Skill tool with "research" and read back its cited findings file.

3. Sketch the proposed module/interface shape. Call the Skill tool with "module-design" for the deep-module/seam vocabulary, and again for `DESIGN-IT-TWICE.md`'s comparison approach wherever more than one structure is genuinely live.

4. Write the doc using the template below.

5. Save it as a local file — do not publish it to the issue tracker; that's what `write-spec` is for. Match whatever per-feature-doc convention the project already has (e.g. an existing `docs/design/` or `rfcs/` folder). If none exists, use `docs/design/<feature-slug>.md` and say so.

<design-template>

## Context & Problem

Why this work exists, from what's already been established.

## Goals / Non-Goals

## Proposed Architecture

The module/seam shape, in `module-design`'s vocabulary: module, interface, seam, adapter.

## Alternatives Considered

Structures compared and why the chosen one won, on depth, locality, and seam placement.

## Technology & Framework Choices

UI framework/component library, CLI scaffolding tooling, state/data layer, and a pointer to the color scheme or design tokens if one was given. Only for work that involves picking or bootstrapping a stack.

## Research Findings

One line per open question resolved, linking to the file `research` produced for it.

## Risks & Open Questions

## Out of Scope

</design-template>
