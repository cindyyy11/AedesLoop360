# Fast Demo Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a prototype viewer enter as coordinator in one click and switch to the operator when demonstrating simulated execution.

**Architecture:** Keep authentication and all API role checks on the server. Replace the multi-role/password UI with a local seeded coordinator shortcut and a coordinator/operator switch in the workspace. Keep inspector/reviewer/admin accounts for acceptance coverage and advanced testing.

**Tech Stack:** Next.js, TypeScript, FastAPI cookie sessions, Playwright.

**Spec:** The approved one-click coordinator plus operator-switch choice in the current conversation.

## Global Constraints

- Preserve the server-side mission approval check and distinct coordinator/operator audit actors.
- Label this as local simulated demo access.
- Keep advanced backend roles and existing workflow coverage.

---

### Task 1: Simplify demo access and verify the main loop

**Files:**
- Modify `apps/web/components/workspace.tsx` for the one-click entry and role switch.
- Modify `apps/web/tests/closed-loop.spec.ts` for UI switching and direct advanced-role test setup.
- Modify `README.md` and `docs/IMPLEMENTATION_STATUS.md` to describe the quick path accurately.

- [x] Replace the account selector and password field with an `Enter demo` action that logs into the seeded coordinator.
- [x] Add a top-bar `Switch to operator` / `Switch to coordinator` action that uses the seeded local credentials through the existing login endpoint.
- [x] Update Playwright to exercise the visible coordinator/operator switch and preserve inspector/reviewer workflow coverage through test-only API login.
- [x] Update local run instructions; lint, typecheck and the full Playwright scenario passed. The Playwright result file reports `passed` with no failed tests.
