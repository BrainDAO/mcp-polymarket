---
"@iqai/mcp-polymarket": minor
---

Add server-side spending limits for order placement. Set `POLYMARKET_MAX_ORDER_USD` to cap a single order and `POLYMARKET_MAX_SESSION_USD` to cap cumulative order notional per server process. Orders over a limit are rejected with `ORDER_LIMIT_EXCEEDED` before anything is signed or sent, so an auto-approving MCP host can't commit more than the configured amount. Trading tools now also carry the MCP `destructiveHint` annotation.
