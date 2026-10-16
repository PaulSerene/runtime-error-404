<!--
  Title: feat(<scope>): <imperative summary>   e.g. feat(video): add key-optional shorts router
  Conventional Commits required. Use this template for new features.
-->

## Summary

<!-- One or two sentences: what this feature adds and why it matters. -->

## What changed

<!-- Bulleted list of the notable changes. -->

- 

## Verification

<!-- The exact commands you ran, so a reviewer can reproduce. Keep the ones that apply. -->

```bash
bun run lint
bun run test
bun run build
```

<!-- Add manual / integration checks if any (e.g. "verified in ~/oma-test with `oma install`"). -->

## Checklist

- [ ] PR title follows Conventional Commits
- [ ] Scope is focused — one logical feature
- [ ] Tests added or updated for the new behavior
- [ ] `bun run lint` and `bun run test` pass locally
- [ ] Docs updated if behavior, flags, config keys, or env vars changed
- [ ] No secrets, credentials, or `.env` files committed
- [ ] `.agents/` SSOT changes are intentional (source repo only)

## Related issues

<!-- e.g. Closes #123, Refs #456. -->
