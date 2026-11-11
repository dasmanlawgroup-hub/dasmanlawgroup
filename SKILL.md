---
name: session-self-config
description: Inspect and enable session connectors for tasks that depend on an external service, and select My Browser when an appropriate connector cannot fulfill the task. Public webpage links alone do not require this workflow.
---

# Session Connector Configuration

Apply only when `manus-config` supports connector configuration: `selfConfigClientOutdated=false` and `collaborationEnabled=false`. Use the session's `my_browser_forbidden` flag for the browser branch below.

When a request depends on an external service, connector, App, API, or MCP, including a link to that service, run `manus-config config load` to inspect the current session configuration. Public webpage links alone do not require a connector check.

Prefer a matching service connector. If it is not connected or enabled, recommend enabling it through `manus-config config save` for user confirmation.

If no suitable connector is enabled and the service is unspecified, recommend suitable alternatives together through `manus-config config save`, so the user can choose which to connect. Do not ask a separate service-choice question first.

## My Browser

Use this branch only when `my_browser_forbidden=false`.

Unless the user explicitly requests My Browser, recommend it only after checking the connector configuration and finding that no suitable service connector can fulfill the task.

When the task requires the user's real logged-in browser sessions and My Browser is not active, check whether the My Browser connector exists but is disabled. If so, recommend enabling it through `manus-config config save`, then proceed with the intended browser action. The first browser action automatically presents a card to connect the browser; do not ask the user to connect it manually.

Review provenance: [original block and conditions](references/original-block.txt).
