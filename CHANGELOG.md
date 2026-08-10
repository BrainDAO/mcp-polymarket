# Changelog

## 0.1.0

### Minor Changes

- [#61](https://github.com/BrainDAO/mcp-polymarket/pull/61) [`8d32e91`](https://github.com/BrainDAO/mcp-polymarket/commit/8d32e9195fd7d8fff19bdef5ba037edbc79ff27a) Thanks [@petrarka](https://github.com/petrarka)! - Migrate to Polymarket v2 / pUSD (April 28 2026 exchange upgrade)

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

## 0.0.18

### Patch Changes

- [#57](https://github.com/IQAIcom/mcp-polymarket/pull/57) [`c67679f`](https://github.com/IQAIcom/mcp-polymarket/commit/c67679fa761114780e7524a2f71421ad992ce04c) Thanks [@MarvelNwachukwu](https://github.com/MarvelNwachukwu)! - Cleanup batch:

  - Fix stderr log lines running together due to missing trailing newlines on init/order/market-order logs (server log output is no longer corrupted into one line)
  - Reject invalid `outcomeIndex` for negRisk redemption instead of silently defaulting to outcome 0 — prevents accidentally redeeming the losing side when the caller passes a bad value
  - Move `shx` from `dependencies` to `devDependencies` so npm consumers don't pull it in

## 0.0.17

### Patch Changes

- 750f240: Fix MCP protocol logging and rename RPC environment variable

  - Route all server log output to stderr so it no longer corrupts the MCP stdout JSON-RPC stream
  - Rename `POLYMARKET_RPC_URL` to `POLYGON_RPC_URL` (update your env/config accordingly)
  - Remove emoji characters from log messages

## 0.0.16

### Patch Changes

- 0f1d89f: Fix npm compatibility by replacing JSR protocol dependency

  - Replace `jsr:@hk/polymarket` with npm-compatible `@jsr/hk__polymarket` package
  - Fix `EUNSUPPORTEDPROTOCOL` error when installing with npm/npx
  - Enable installation with all package managers (npm, pnpm, yarn) without JSR-specific syntax

## 0.0.15

### Patch Changes

- 57566eb: Fix network detection errors with flaky RPC endpoints

  - Use StaticJsonRpcProvider instead of JsonRpcProvider to bypass network auto-detection
  - Fix signature type auto-detection being overwritten during config merge
  - Skip approval checks for proxy wallet mode (signature type 2) since approvals are managed via Polymarket UI

## 0.0.14

### Patch Changes

- e4de267: Fix clob client errors on createOrDeriveApiKey

## 0.0.13

### Patch Changes

- 768ef22: Makes default signature type to 2 for supporting proxy contract

## 0.0.12

### Patch Changes

- aee641d: Add close false for get active markets
- aabc860: Improves the approvals service code

## 0.0.11

### Patch Changes

- 2829873: adds approval code for negrisk

## 0.0.10

### Patch Changes

- 859db6c: improve tool descriptions

## 0.0.9

### Patch Changes

- 187fbb4: Fix signature error on place order

## 0.0.8

### Patch Changes

- 74ac0ff: Changes negRisk to true for https://github.com/Polymarket/py-clob-client/issues/138

## 0.0.7

### Patch Changes

- 1e28dec: Fixes polymarket kit sdk installation for pnpm

## 0.0.6

### Patch Changes

- 0f0efbc: Improves max gas fee logic in approvals

## 0.0.5

### Patch Changes

- dea907e: Implement Polymarket API integration, add approval logic for USDC and CTF, and introduce new trading tools. Refactor existing code for better organization and lazy initialization.
- aea156e: Makes approvals manual instead of automatic

## 0.0.4

### Patch Changes

- 6c2982d: Adds dist in files

## 0.0.3

### Patch Changes

- 3c39366: Changes the build

## 0.0.2

### Patch Changes

- d003edc: Adds trade tools to mcp
- f014136: Removes viem
- 1dce032: makes mcp to only show trade related tools when the polymarket private key is given

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-10-28

### Added

- Initial implementation of Polymarket MCP Server
- TypeScript project setup with strict type checking
- Biome configuration for linting and formatting
- Market data retrieval tools:
  - `get_market_by_slug` - Get specific market details
  - `get_event_by_slug` - Get event information
  - `list_active_markets` - List active markets with pagination
  - `search_markets` - Search for markets, events, and profiles
  - `get_markets_by_tag` - Filter markets by category tags
  - `get_all_tags` - Get all available market tags
  - `get_order_book` - View current order book for a market
- Trading functionality implementation:
  - Trading client class with API credential initialization
  - Limit order placement (GTC/GTD)
  - Market order placement (FOK/FAK)
  - Order management (get, cancel individual, cancel all)
  - Trade history retrieval
  - Balance and allowance management
- Comprehensive documentation in README
- Example environment configuration file
- Test script for manual validation
- Configurable API endpoints via environment variables

### Security

- CodeQL security scan with no vulnerabilities found
- Proper handling of sensitive data (private keys)
- Use of environment variables for configuration
- Documentation of transitive dependency vulnerabilities and mitigation

### Dependencies

- `@modelcontextprotocol/sdk` ^1.20.2 - MCP server implementation
- `@polymarket/clob-client` ^4.22.8 - Polymarket trading client
- `ethers` ^5.7.2 - Ethereum wallet and signing (v5 for compatibility)
- `zod` ^3.25.76 - Schema validation
- `@biomejs/biome` ^2.3.1 - Linting and formatting
- `typescript` ^5.9.3 - Type-safe development
