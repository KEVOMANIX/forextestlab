# Claude project entry point

Read [`CLAUDE_HANDOVER.md`](./CLAUDE_HANDOVER.md) completely before changing,
deploying, or operating ForexTestLab. It contains the current architecture,
credential locations (never their values), AWS/R2/Supabase procedures, health
checks, schedules, safety constraints, and production handover state.

## Keep agent usage efficient

- Read the handover once per chat. Do not reread the whole file after it is in
  context; use targeted searches for the relevant heading or path.
- Start with `git status` and narrow `rg` searches. Open only the files and line
  ranges needed for the current request.
- Reuse verified findings and completed work already recorded in the chat. Do
  not repeat diagnostics, builds, deployments, or production checks without a
  new change or conflicting evidence.
- Run the smallest meaningful test first. Run the full suite or production build
  only when the change's scope, deployment workflow, or a failure justifies it.
- Keep tool output focused with path filters and output limits. Never print an
  environment file or other secrets.
- For unrelated work, prefer a new chat with a concise handover of the current
  revision, completed work, and remaining task instead of carrying a large chat.
