# Security by default

The failures here don't show up in a stack trace; they show up in an incident report written by someone else, months later. This is the same fail-fast-at-the-boundary discipline in `design-principles.md`, aimed at an adversarial caller instead of a careless one.

**Never build a query, command, or path from untrusted input by concatenation.** A parameterized query, an ORM's query builder, or an allowlist beats string-building every time — not because the interpolation has a bug today, but because nobody re-checks it's still safe after the next refactor. Same rule for shell commands (no untrusted string into `exec`) and file paths (no untrusted string into a path join without normalizing and checking it stays inside the intended directory).

**Secrets don't go in logs, error messages, or version control — not even on a debug branch.** An error that includes the request body can include the password field in it. A `console.log` added while debugging and left in ships whatever it captured. The question is "will this line ever run in production against real data," not "is this line meant to be temporary."

**Authorization lives next to the data it guards, not at the edge alone.** A check at the route ("is this user logged in") is not a check at the resource ("does this user own *this* row"). The second one is the one that's missing when an incident report says a user could see another user's data by changing an ID in the URL — fail-fast-at-the-boundary catches malformed input, not a well-formed request for someone else's resource.

**Validate shape and validate meaning, separately.** A schema validator confirms an ID looks like an ID; it doesn't confirm the caller is allowed to use *this* ID. Passing schema validation is necessary and not sufficient — the authorization check above still has to run.

**Treat deserialization of untrusted data as code execution, not data parsing.** Some formats and libraries execute code as a side effect of parsing — arbitrary object deserialization, certain YAML/pickle loaders, template engines fed user input. Know which of your parsers are in that category and never point one at untrusted input; prefer formats with no such side channel, like JSON through a standard parser.

**A new default is closed; open it deliberately.** New endpoints, new fields, new feature flags: default to denied/private/off, then open on purpose — an accidentally-public endpoint is found by an attacker before it's found by code review.

Read this when: touching anything that builds a query, command, or file path from external input; writing an error handler or a log statement on a path that sees real user data; adding an endpoint, field, or resource that needs an owner check; adding a new parser or accepting a new input format; anywhere "trusted" and "the caller" would appear in the same sentence.
