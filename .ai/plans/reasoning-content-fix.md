# Preserve worker reasoning across tool calls

## Objective and context
Resolve repeated worker API rejections reporting missing `reasoning_content`, without changing worker models, fallback policy, or application code. Runtime changes require user approval.

## Current state
- Global `/Users/phumrin/.config/opencode/opencode.json:30-41` uses `@ai-sdk/openai-compatible` through localhost:3010; DeepSeek and GLM model entries specify only names, with no explicit reasoning replay mapping.
- The same file at lines 69-87 assigns DeepSeek to researcher/bug-catcher and GLM to the remaining workers, with reciprocal fallbacks.
- `/Users/phumrin/.config/opencode/opencode-fallback.json:3` lists retry status codes 429 and selected 5xx codes; the observed error does not expose its HTTP status, so fallback behavior is unconfirmed.
- Installed CLI reports version 1.18.30. Two researcher diagnostic calls reproduced the error. Their actual serving model and the router's payload handling remain unconfirmed.
- Published schema https://opencode.ai/config.json supports model-level `reasoning: boolean` and `interleaved: {"field":"reasoning_content"}`.
- Upstream source https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/provider/transform.ts maps assistant reasoning into OpenAI-compatible message provider options when the interleaved field is configured. This is upstream evidence, not proof of the installed binary's behavior.

## Proposed changes
In `/Users/phumrin/.config/opencode/opencode.json`, add `reasoning: true` and `interleaved: {"field":"reasoning_content"}` to `provider.agentrouter.models.deepseek-v4-flash` and `provider.agentrouter.models.glm-5.3`. Preserve all other settings. The replay field is the functional change; reasoning declares the models' capability.

## Blast radius
Global change affects every project inheriting these model definitions, including fallback uses. No application, agent prompt, dependency, or fallback-policy changes are proposed. Check effective project overrides before applying.

## Options considered
1. Explicit reasoning replay mapping (recommended): small, schema-supported, retains thinking and current models; depends on the router preserving the field.
2. Disable thinking: potential workaround, but provider-specific support must be confirmed and reasoning quality may change. `reasoning: false` alone is not a reliable API thinking-disable control.
3. Switch workers or patch router: potentially useful if replay mapping fails, but broader scope and does not inherently repair malformed history.

## Risks and mitigations
- Router could drop reasoning on responses or requests: if the smoke test fails, inspect redacted field-presence diagnostics at localhost:3010 rather than fabricate reasoning content.
- Existing sessions may contain incomplete reasoning history: restart OpenCode and test in fresh sessions.
- Published schema/source may differ from installed CLI: verify local configuration loading before model tests.
- Existing user changes in the repository must remain untouched.

## Verification plan
1. Check effective configuration overrides and validate the edited JSON/model settings against supported schema and local CLI loading.
2. Review the exact diff to ensure only the two model entries change.
3. Quit and restart OpenCode; perform a fresh read-only researcher task that calls a tool and then answers, proving the post-tool API turn succeeds.
4. Repeat using a GLM worker. A text-only request is insufficient to verify this failure mode.
5. If failures persist, investigate router field preservation and installed adapter behavior before further changes. Do not broaden fallback to all 400 errors.

## Status
Proposal only. No runtime configuration edited; end-to-end fix not yet verified.
