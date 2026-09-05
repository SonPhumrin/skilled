---
name: requirements-interview
description: Interview the user relentlessly about a plan, decision, or idea until every branch resolves. Use when the user wants their thinking stress-tested, asks to be interviewed or questioned about a design, says a plan feels underspecified, or when another skill needs to reach shared understanding before acting.
---

Interview the user relentlessly until you reach shared understanding. Map the work as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask *now* without guessing at answers you have not heard yet. Ask the whole frontier in one round. Number each question and give your recommended answer. Then wait.

Format a round like this:

```
❓ **Q1** - **<question title>**: <question body, possibly several paragraphs, possibly multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body>

➡️ <your recommended answer>
```

Each round of answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a *later* round.

## Facts are yours, decisions are theirs

Finding **facts** is your job. When a frontier question needs a fact from the environment (what the schema looks like, which library is already installed, how the existing endpoint behaves), dispatch a sub-agent to find it. Ask the user for nothing you could look up.

Do not block on it. A running exploration is an unsettled prerequisite, so only the questions downstream of it wait; ask the rest of the frontier now.

The **decisions** are the user's. Put each to them and wait.

## Reading the project

If `CONTEXT.md` exists, read it first and phrase questions in its vocabulary. If `ARCHITECTURE.md` exists, read its **Constraints** and **Non-goals** before asking anything: a question already answered by a stated constraint is a question you should not be asking, and a request that contradicts a non-goal is itself the first question to raise.

## Done

The session ends when the frontier is empty: every branch visited, nothing silently assumed. Take no action on the plan until the user confirms shared understanding.
