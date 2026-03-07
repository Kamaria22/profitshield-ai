# Guarded Workflow (Autonomous Protection Stack)

This repository uses a guarded development path before meaningful changes.

## Entry command

```bash
npm run guard:run
```

## Chain

1. `guard:discover` — inventory watchdog/guardian/self-heal/stability modules
2. `guard:preflight` — detect publish/build blockers (imports, critical path files)
3. `guard:risk` — classify changed files by risk
4. `guard:runtime` — static runtime/auth/App Bridge guard checks
5. `guard:self-heal` — auto-heal safe blocker classes (currently import extension mismatch)
6. `build` — compile guard
7. report written to `.guard/guarded-workflow-report.json`

## Optional live agent probe

```bash
APP_URL=https://profit-shield-ai.base44.app npm run guard:probe-agents
```

This pings selected Base44 function agents and writes `.guard/agent-probe.json`.

## Incident files

- `.guard/protection-inventory.json`
- `.guard/incidents-preflight.json`
- `.guard/incidents-runtime.json`
- `.guard/self-heal-report.json`
- `.guard/guarded-workflow-report.json`

## Ownership model

- Build/publish blockers: `buildGuardian`
- Embedded auth/runtime checks: `frontendGuardian`, `stabilityAgent`, `selfHeal`
- Recovery path: `selfHeal`
- Agent execution safety controls: `functions/helpers/agentRuntime.ts`
