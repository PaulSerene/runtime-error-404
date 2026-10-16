# Directives (Layer 1: What to do)

This directory contains Standard Operating Procedures (SOPs) written in Markdown.

## Guidelines
- Define clear **goals**, **inputs**, **tools/scripts to use** (from `execution/`), **expected outputs**, and **edge cases**.
- Write instructions like you are delegating to a mid-level employee.
- **Living Documents**: Update directives as you discover API constraints, better workflows, or common pitfalls. Do not extemporaneously overwrite them without maintaining history.

## Directive Template

```markdown
# [Directive Name]

## Goal
A clear 1-2 sentence description of what this workflow accomplishes.

## Inputs
- Required parameters, environment variables, or files.

## Execution Tools
- `execution/[script_name].py`: Deterministic script to run.

## Outputs
- Deliverables (e.g. Google Sheets/Slides, API response, final report).
- Temporary intermediates placed in `.tmp/`.

## Edge Cases & Error Handling
- Rate limits, retry policies, fallback logic.
```
