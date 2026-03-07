# ProfitShield Autonomous Agent Architecture (Production Hardening)

## Scope
This document covers autonomous/runtime agents that execute healing, monitoring, or remediation behavior in production.

## Agent Inventory
| Agent | Category | Purpose | Trigger Conditions | Execution Context | Dependencies | Permissions |
|---|---|---|---|---|---|---|
| `selfHeal` | Self-Healing Agent | Detects and repairs Shopify/webhook/queue/secret drift | Scheduler watchdog, admin actions | Serverless function (`Deno.serve`) | `PlatformIntegration`, `OAuthToken`, `WebhookQueue`, `SelfHealingEvent`, `AuditLog` | Admin/owner for manual actions; scheduler allowed |
| `frontendGuardian` | Watchdog Monitoring Agent | Captures frontend incidents and applies safe UI heal actions | Client incident reports, watchdog schedule, queue processing | Serverless function + client reporter | `SelfHealingEvent`, `SystemHealth`, `Tenant`, `AuditLog` | Admin/owner for status/watchdog/process; client can report incidents |
| `featureGuardian` | System Guardian Agent | Feature-level diagnostics/fixes for tenant features | Scheduled watchdog or manual fix request | Serverless function | `Tenant`, `Order`, `Customer`, `CustomerSegment`, `BuildGuardianAction`, feature functions | Admin/owner for non-watchdog calls |
| `buildGuardian` | System Guardian Agent | Build/env/webhook readiness checks + integration healing | Manual/scheduled invocation | Serverless function | Env vars, `AuditLog`, `shopifyConnectionManager` | Admin/owner if user-auth call; scheduler allowed |
| `stabilityAgent` | Watchdog Monitoring Agent | SLO signal detection and controlled mitigation planning/execution | Scheduled watchdog or admin invocation | Serverless function | `AutomationRunLog`, `BuildGuardianAction`, `AuditLog` | Admin/owner for direct calls; scheduler allowed |
| `shopifyConnectionWatchdog` | Watchdog Monitoring Agent | Shopify token/webhook/sync health verification and healing | Scheduled watchdog | Serverless function | `PlatformIntegration`, `OAuthToken`, `WebhookQueue`, `Alert`, Shopify API | Admin/owner if user-auth call; scheduler allowed |
| `automatedRemediation` | Automation Repair Agent | Safe remediation flow for automation-generated alerts | Automation payloads | Serverless function | `Alert`, `AuditLog` | Service/scheduler mode |
| `automatedRemediationV2` | Automation Repair Agent | Hardened remediation flow using safe runtime helpers | Automation payloads | Serverless function | `Alert`, `AuditLog`, `automationRuntime` | Service/scheduler mode |
| `autonomousDebugBot` | AI Support Agent | Diagnoses tenant health and applies autonomous support fixes | Scheduled scans, admin manual actions | Serverless function | `Task`, `Alert`, `Order`, `ProfitLeak`, `AuditLog`, LLM integration | Admin/owner for tenant-scoped manual actions |
| `supportGuardian` | AI Support Agent | Support inbox watchdog, support email guard, stale ticket self-heal | Watchdog schedule, admin actions | Serverless function | `SupportConversation`, `TenantSettings`, `AuditLog` | Admin/owner for manual actions; watchdog allowed |
| `emailAutomationEngine` | Autonomous Builder/Comms Agent | Event-driven transactional/marketing email automation with cooldown | Event dispatch actions, watchdog | Serverless function | `AuditLog`, `Core.SendEmail` | Admin/owner for manual dispatch; watchdog allowed |
| `appStoreReadinessGuardian` | System Guardian Agent | Readiness checks and proof outputs for Shopify app submission | Manual/scheduled invocation | Serverless function | Multiple readiness modules/entities | Admin/owner + scheduler |

## Shared Guardrails
All hardened agents now use `functions/helpers/agentRuntime.ts`:
- `startAgentExecution`: bounded execution rate + failure circuit breaker.
- `finishAgentExecution`: centralized success/failure completion logs.
- `ensureTenantIsolation`: blocks unsafe tenantless mutations.
- `allowRole`: standard admin/owner authorization check.
- Logging target:
  - Primary: `AgentExecutionLog` (if available)
  - Fallback: `AuditLog` entries (`action=agent_execution`)

## Failure Isolation Model
- Agents run in isolated request handlers; failures are caught and converted to JSON error responses.
- Execution completion is logged for both success and failure paths.
- Watchdog flows avoid app-crash propagation and retain bounded behavior through policy checks.

## Security Constraints
- No arbitrary code execution path added.
- Tenant context validation added prior to mutation paths.
- Role checks enforce admin/owner access for privileged/manual agent actions.
- Secrets are not read directly beyond existing env checks; no secret material is persisted in logs.

## Observability
Execution telemetry captures:
- `agent_name`
- `action`
- `status` (`started`, `success`, `failure`, `blocked`)
- `tenant_id`
- elapsed runtime
- repair actions
- error reason
- scheduler/user-role context
- agent version marker

## Scalability Notes
- Agents use bounded scans (slice/limit windows) to avoid unbounded loops.
- Watchdog paths are scheduler-compatible and non-blocking for frontend requests.
- Retry/circuit controls prevent high-frequency failure storms.
