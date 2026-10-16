<!--
  Default template (refactor / perf / chore / build / ci / other).
  For a feature, bug fix, or docs PR, pick a dedicated template:
    ?template=feature.md  |  ?template=bugfix.md  |  ?template=docs.md
  Title must follow Conventional Commits, e.g. refactor(hook): centralize vendor dispatch
-->

## Summary

<!-- One or two sentences: what this PR does and why. -->

## What changed

- 

## Verification

```bash
bun run lint
bun run test
bun run build
```

## Checklist

- [ ] PR title follows Conventional Commits
- [ ] Scope is focused — one logical change
- [ ] Tests added or updated where applicable
- [ ] `bun run lint` and `bun run test` pass locally
- [ ] Docs updated if behavior, flags, config keys, or env vars changed
- [ ] No secrets, credentials, or `.env` files committed
- [ ] `.agents/` SSOT changes are intentional (source repo only)

## Related issues

<!-- e.g. Closes #123, Refs #456. -->
