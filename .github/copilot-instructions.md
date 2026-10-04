# DevUtils shared project guidance

Read and follow the repository root `AGENTS.md` before making changes.
Read `docs/architecture.md` for the map and feature entry points. For vault,
SSH or platform operations, also read `docs/review-2026-10-04.md`.
Keep shared rules in AGENTS.md; this file is only the Copilot entry point.

Preserve local processing and the renderer -> preload -> main privilege boundary.
Preserve uncommitted user work. Validate changes using the commands in AGENTS.md
and report checks that could not run.
