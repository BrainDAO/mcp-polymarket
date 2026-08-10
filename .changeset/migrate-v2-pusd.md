---
"@iqai/mcp-polymarket": minor
---

Migrate to Polymarket v2 / pUSD (April 28 2026 exchange upgrade)

The Polymarket exchange migrated from USDC.e to pUSD collateral and bumped CLOB endpoints to v2 on April 28 2026. The legacy `@polymarket/clob-client` (v1) is no longer compatible — placing orders against the v2 exchange fails when signed with v1 contracts.

Changes:

- Swap dependency `@polymarket/clob-client@^4.22.8` → `@polymarket/clob-client-v2@^1.0.6` (add `viem` as supporting dep).
- `services/trading.ts`: v2 SDK uses an object-form constructor (`{ host, chain, signer, ... }`) and renames `chainId` to `chain`. API credentials use `createOrDeriveApiKey()` with validation and a strict direct-derivation fallback; authenticated clients throw API failures instead of returning error payloads as successful values.
- `UserOrder` / `UserMarketOrder` now `UserOrderV2` / `UserMarketOrderV2`. The v2 types dropped `feeRateBps`, `nonce`, and `taker`. BUY orders pass the user's pUSD balance for fee-aware sizing.
- `services/config.ts`: `USDC_ADDRESS` (USDC.e) replaced with `COLLATERAL_ADDRESS` (pUSD `0xC011a7E1...`). Exchange and collateral-adapter addresses use the canonical V2 contracts. Added USDC.e onramp/offramp constants for future wrap/unwrap flows.
- `services/approvals.ts`: pUSD and CTF approvals target the V2 exchanges and collateral adapters.
- `services/redemption.ts`: standard and NegRisk redemption route through their V2 collateral adapters and return pUSD.
- `services/api.ts`: dropped the `PolymarketSDK` (v1) usage from `@jsr/hk__polymarket` in favor of a direct `/book` fetch (the endpoint is public and works without auth). `GammaSDK` is retained for market discovery — Gamma API was not affected by the upgrade.
- `tools/get-balance-allowance.ts`, `tools/update-balance-allowance.ts`: `AssetType` import path updated to v2 SDK.

Adds `smoke-test.mjs` — a retry-aware regression harness for live read-only APIs, signature defaults, authenticated client initialization, pUSD balance access, and V2 order signing. It never posts an order or sends an on-chain transaction. Run with `node smoke-test.mjs` after `pnpm build`.

Default `signatureType` semantics are unchanged (still 2 = POLY_GNOSIS_SAFE when auto-detected with a `funderAddress`, 0 = EOA otherwise) — v2 ClobClient continues to accept `signatureType` + `funderAddress` for proxy-wallet flows.
