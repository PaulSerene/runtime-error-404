---
title: False-positive fixture — issue #533
---

# False Positives

Inline-code spans that must NOT become file refs:

- Package specifiers: install `shadcn/ui` and animate with `motion/react`.
- Globs: lint every `*.ts` file and all `src/**/*.tsx` components.
- Conceptual mentions: each skill ships a `DESIGN.md` and a `SKILL.md`.
- Bare-filename shorthand: see `academic-verb-tiers.md` in resources.
- Placeholder paths: results land in `data/<id>/INFO.md`.
- Home paths: settings live in `~/.gemini/settings.json`.
- Branch-like tokens: push to `chore/update-oh-my-agent`.
- Timezones: set it to `Asia/Seoul`.

Inline-code spans that MUST stay file refs:

- Explicit relative: `./relative/setup.md` and `../shared/common.md`.
- Dir + extension: `cli/commands/docs/extract.ts`.

Commands that must NOT become script refs:

- External bin: run `bunx deepsec` or `pnpm deepsec`.
- Package-manager builtin: `pnpm install`.

Command that MUST stay a script ref: `bun run test`.

Dotted tokens that must NOT become config refs:

- Event names handled elsewhere, filenames: `session.md`.
- Domains: `telemetry.istio.io` and `telemetry.github.io`.

Dotted token kept as a config ref (resolver decides): `session.created`.

Links:

- Anchored relative link: [doctor command](sub/commands.md#doctor)
- Pure anchor: [section](#false-positives)
- Docusaurus route: [agents concept](/docs/core-concepts/agents)
- Extensionless doc link: [intro](guide/intro)
