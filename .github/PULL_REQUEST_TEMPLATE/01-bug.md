<!--
  Title: fix(<scope>): <imperative summary>   e.g. fix(install): reclaim a crashed lock in 60s, not 10min
  Conventional Commits required. Use this template for bug fixes.
-->

## Problem

<!-- What broke. Include a concrete repro or the actual error output. -->

```
<error output / repro>
```

## Root cause

<!-- Why it happened — point at the specific code path or commit. -->

## Fix

<!-- What you changed and why this is the minimal correct fix. -->

## Verification

<!-- Commands that prove the fix, including the regression test. -->

```bash
bun run lint
bun run test
```

## Checklist

- [ ] PR title follows Conventional Commits
- [ ] Root cause identified — not just the symptom
- [ ] Minimal fix — only what's necessary changed
- [ ] Regression test added that fails before the fix and passes after
- [ ] Checked for the same pattern elsewhere in the codebase
- [ ] `bun run lint` and `bun run test` pass locally
- [ ] No secrets, credentials, or `.env` files committed

## Related issues

<!-- e.g. Closes #123, Refs #456. -->
