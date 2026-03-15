# ProfitShield AI Deep Pass Audit (2026-03-15)

## Scope
- 20 separate end-to-end validation passes across guard stack, build/runtime, route registration, live endpoints, and embedded reachability.

## Pass Results
1. `npm run guard:discover` -> PASS
2. `npm run guard:layers` -> PASS
3. `npm run guard:run` -> PASS
4. `npm run build` -> PASS
5. `npm run lint` -> FAIL (pre-existing repo-wide lint debt: 213 errors)
6. `npm run typecheck` -> FAIL (pre-existing repo-wide TS debt, many UI typing incompatibilities)
7. `npm run guard:preflight` -> PASS
8. `npm run guard:risk` -> PASS
9. `npm run guard:guardian-review` -> PASS
10. `npm run guard:builder-action` -> PASS
11. `npm run guard:runtime` -> PASS
12. `npm run guard:runtime-health` -> PASS
13. `npm run guard:self-heal` -> PASS
14. `npm run guard:simulate-heal` -> PASS
15. Live agent probe (`probe-agents.mjs`) -> PASS/DEGRADED (`vulnerabilityWatchdog` intermittently 503 under live load/rate limits)
16. Live core function matrix -> MIXED (sync/auth: 200; many non-core probes: 429 due live rate limiting)
17. Live core page reachability matrix (`/`, `/Home`, `/Integrations`, `/Orders`, `/HelpCenter`) -> PASS (all 200)
18. Pages config import integrity check -> PASS (0 missing imports)
19. Function registry compatibility check -> PASS (157 routable functions detected)
20. Embedded startup safety grep (`auth.me`, `User/me`, redirect/postMessage hotspots) -> PASS with known guarded hotspots already tracked

## Key Findings
- Embedded runtime and core route reachability are healthy.
- Shopify sync/auth endpoints are reachable and returning successful responses in live probes when not rate-limited.
- Repo-wide lint and typecheck debt remains large and is not isolated to embedded/sync critical paths.
- Live probes still show 429 bursts on some admin/watchdog endpoints, indicating platform-level throttling behavior in production traffic windows.

## Hardening Performed During This Deep Pass Cycle
- No additional risky architecture changes were made in this step.
- Existing guard and endpoint hardening remained intact and passing (`guard:run`, `build`).

## Recommended Next Scoped Phase
- Focused repo debt burn-down in controlled slices:
  - Slice A: `src/components/admin/*`, `src/pages/SystemHealth.jsx`, `src/pages/Tasks.jsx` type/lint compatibility.
  - Slice B: shared UI component typing contracts causing widespread TS JSX incompatibility.
  - Slice C: endpoint 429 resilience at caller level for non-critical background/admin probes.

