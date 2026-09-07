# Upstream provenance map

Every row here forked from [mattpocock/skills](https://github.com/mattpocock/skills). `commit` is the upstream sha at fork time; `/skilled-update` diffs `path` from that sha to upstream's current HEAD to find drift. This lives here, not in each skill's frontmatter, because it's read by exactly one skill and would otherwise cost every other skill's token budget on every fire for information only this one needs.

| Skill here | Upstream path | Forked at commit |
| :--- | :--- | :--- |
| architecture-review | skills/engineering/improve-codebase-architecture/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| decision-map | skills/engineering/wayfinder/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| design-workflows | skills/in-progress/loop-me/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| diagnose-bug | skills/engineering/diagnosing-bugs/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| domain-interview | skills/engineering/grill-with-docs/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| domain-modeling | skills/engineering/domain-modeling/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| enforce-module-boundaries | skills/in-progress/setup-ts-deep-modules/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| explain-again | skills/productivity/wait-what/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| generate-runbook | skills/engineering/wizard/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| git-guardrails | skills/misc/git-guardrails-claude-code/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| handoff | skills/productivity/handoff/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| handoff-to-agent | skills/in-progress/claude-handoff/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| implement-spec | skills/in-progress/implement-spec/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| prototype | skills/engineering/prototype/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| research | skills/engineering/research/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| resolve-merge-conflicts | skills/engineering/resolving-merge-conflicts/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| retro | skills/in-progress/retro/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| review-diff | skills/engineering/code-review/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| setup-pre-commit | skills/misc/setup-pre-commit/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| tdd | skills/engineering/tdd/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| teach | skills/productivity/teach/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| triage | skills/engineering/triage/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| write-questionnaire | skills/productivity/to-questionnaire/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| write-spec | skills/engineering/to-spec/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| write-tickets | skills/engineering/to-tickets/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |
| writing-for-agents | skills/productivity/writing-for-agents/SKILL.md | 3cca18b368ae95cdbdebbff572ccafa662551015 |

The 11 skills with no row here (`code-craft`, `module-design`, `observability`, `implement`, `requirements-interview`, `clarify-requirements`, `skilled`, `skilled-setup`, `skilled-update`, `design-doc`, `verify-in-browser`) are either wholly original or rewritten heavily enough that a diff against upstream would be noise, not signal.
