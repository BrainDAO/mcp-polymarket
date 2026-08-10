# 📊 Polymarket MCP Server

[![npm version](https://img.shields.io/npm/v/@iqai/mcp-polymarket.svg)](https://www.npmjs.com/package/@iqai/mcp-polymarket)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 📖 Overview

The Polymarket MCP Server enables AI agents to interact with [Polymarket](https://polymarket.com), a leading prediction market platform on Polygon. This server provides comprehensive access to market data, real-time pricing, order books, and trading capabilities through the Polymarket API.

By implementing the Model Context Protocol (MCP), this server allows Large Language Models (LLMs) to discover prediction markets, analyze odds (probabilities), execute trades, and track portfolio positions directly through their context window, bridging the gap between AI and decentralized prediction markets.

## ✨ Features

*   **Market Discovery**: Search and filter prediction markets by keywords, tags, and status.
*   **Real-time Pricing**: Access live price data, implied probabilities, and depth-of-market (order books) for any outcome token.
*   **Trading Capabilities**: Place limit orders, market orders, and manage open orders (requires private key).
*   **Portfolio Tracking**: Monitor user positions, trade history, and balances for specific wallet addresses.
*   **Order Management**: View, cancel, and manage open orders across all markets.

## 📦 Installation

### 🚀 Using npx (Recommended)

To use this server without installing it globally:

```bash
npx @iqai/mcp-polymarket
```

### 🔧 Build from Source

```bash
git clone https://github.com/IQAIcom/mcp-polymarket.git
cd mcp-polymarket
pnpm install
pnpm run build
```

## ⚡ Running with an MCP Client

Add the following configuration to your MCP client settings (e.g., `claude_desktop_config.json`).

### 📋 Minimal Configuration (Read-Only)

```json
{
  "mcpServers": {
    "polymarket": {
      "command": "npx",
      "args": ["-y", "@iqai/mcp-polymarket"]
    }
  }
}
```

### ⚙️ Advanced Configuration (With Trading)

```json
{
  "mcpServers": {
    "polymarket": {
      "command": "npx",
      "args": ["-y", "@iqai/mcp-polymarket"],
      "env": {
        "POLYMARKET_PRIVATE_KEY": "your_private_key_here",
        "POLYGON_RPC_URL": "https://polygon-mainnet.g.alchemy.com/v2/<YOUR_KEY>"
      }
    }
  }
}
```

## 🔐 Configuration (Environment Variables)

| Variable | Required | Description | Default |
| :--- | :--- | :--- | :--- |
| `POLYMARKET_PRIVATE_KEY` | No | Private key for trading (enables trading tools) | - |
| `POLYGON_RPC_URL` | No | Polygon RPC URL for transactions | `https://polygon-rpc.com` |
| `CLOB_API_BASE` | No | Polymarket CLOB API base URL | `https://clob.polymarket.com` |
| `CHAIN_ID` | No | Blockchain network chain ID | `137` (Polygon) |
| `SIGNATURE_TYPE` | No | Order signature type (`0` EOA, `1` proxy, `2` Safe, `3` EIP-1271) | `0` without a funder, otherwise `2` |
| `POLYMARKET_FUNDER` | No | Funder address for transactions | - |
| `FUNDER_ADDRESS` | No | Alternative funder address (alias) | - |

## 💡 Usage Examples

### 🔍 Market Discovery
*   "What are the most active prediction markets on Polymarket right now?"
*   "Search for markets related to 'Bitcoin' or 'BTC'."
*   "Find markets in the 'Crypto' category."
*   "What events are trending on Polymarket today?"

### 📊 Analytics & Pricing
*   "Show me the order book for the 2024 election market."
*   "What is the current probability implied by the price of the 'Yes' token?"
*   "Get detailed information about the 'will-trump-win-2024' market."

### 💼 Portfolio & Trading (Requires Private Key)
*   "What's my current pUSD balance and allowance?"
*   "Show me all my open orders across all markets."
*   "Place a buy order for 100 shares at 0.65 price."
*   "Cancel all my open orders on this market."

## 🛠️ MCP Tools

<!-- AUTO-GENERATED TOOLS START -->

### `approve_allowances`
Grant the pUSD and Conditional Token approvals required for Polymarket V2 trading and position management. Automatically approves only contracts that do not already have permission. Approvals are revocable at any time in your wallet.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `waitForConfirmations` | integer | false | How many confirmations to wait before returning (0 = return immediately after broadcasting). Default: 0 |

### `cancel_all_orders`
Cancel all open orders for the authenticated account.

_No parameters_

### `cancel_order`
Cancel a specific order by its ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | true | The unique identifier of the order to cancel |

### `get_all_tags`
Get a list of all available tags for categorizing markets.

_No parameters_

### `get_balance_allowance`
Get balance and allowance information for the authenticated account. Can check COLLATERAL or CONDITIONAL tokens.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `assetType` | string | true | Asset type to check balance for: COLLATERAL or CONDITIONAL |
| `tokenID` | string | false | Optional token ID for conditional token balance |

### `get_event_by_slug`
Get detailed information about a specific event by its slug identifier. Events group multiple related markets.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `slug` | string | true | The event slug identifier |

### `get_market_by_slug`
Get detailed information about a specific market by its slug identifier. The slug can be extracted from the Polymarket URL.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `slug` | string | true | The market slug identifier (e.g., 'will-trump-win-2024') |

### `get_markets_by_tag`
Get markets filtered by a specific tag ID. Useful for finding markets in specific categories.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tag_id` | string | true |  | The tag ID to filter by |
| `limit` | number | false | 20 | Number of markets to return (default: 20) |
| `closed` | boolean | false | false | Include closed markets (default: false) |

### `get_open_orders`
Get all open orders for the authenticated account. Can optionally filter by market.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `market` | string | false | Optional market address to filter orders by |

### `get_order`
Get details of a specific order by its ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | true | The unique identifier of the order |

### `get_order_book`
Get the current order book for a specific market token. Shows all active buy and sell orders.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token_id` | string | true | The token ID for the market outcome |

### `get_positions`
Get all positions for a wallet address with current values. Returns position details including size, current price, current value, and P&L. Uses the Polymarket Data API for accurate position valuation.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `user` | string | false |  | Wallet address to fetch positions for. If not provided, uses POLYMARKET_FUNDER env var. |
| `limit` | number | false | 100 | Maximum number of positions to return (default: 100) |

### `get_trade_history`
Get trade history for the authenticated account. Can optionally filter by market or maker address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `market` | string | false | Optional market address to filter trades by |
| `maker_address` | string | false | Optional maker address to filter trades by |

### `list_active_markets`
List all currently active markets with pagination. Returns markets that are not yet closed.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | false | 20 | Number of markets to return (default: 20, max: 100) |
| `offset` | number | false | 0 | Number of markets to skip for pagination (default: 0) |

### `place_market_order`
Place a market order that executes immediately at the current market price. For BUY orders, amount is the pUSD amount to spend. For SELL orders, amount is the number of shares to sell. Example: amount=5, side=BUY spends 5 pUSD. Minimum 1 pUSD for BUY orders.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenId` | string | true | The token ID of the market outcome to trade |
| `amount` | number | true | BUY orders: pUSD amount to spend. SELL orders: Number of shares to sell. Minimum 1 pUSD for BUY orders. |
| `side` | string | true | The side of the order: BUY or SELL |
| `orderType` | string | false | Order type: FOK (Fill or Kill) or FAK (Fill and Kill). Default: FOK |

### `place_order`
Place a limit order on Polymarket at a specific price. Specify the number of shares (size) and price (0-1). For both BUY and SELL, you specify the number of shares you want to trade. Example: size=10, price=0.6 means buy/sell 10 shares at $0.60 per share (total: $6).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenId` | string | true | The token ID of the market outcome to trade |
| `price` | number | true | The limit price for the order (between 0 and 1). This is the probability/price per share. |
| `size` | number | true | Number of shares to trade. For both BUY and SELL orders, this is always the number of outcome tokens/shares. |
| `side` | string | true | The side of the order: BUY or SELL |
| `orderType` | string | false | Order type: GTC (Good Till Cancelled) or GTD (Good Till Date). Default: GTC |

### `redeem_positions`
Redeem all winning outcome tokens from a resolved Polymarket market into pUSD. Provide the conditionId and set negRisk=true for negative-risk markets.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `conditionId` | string | true |  | The condition ID for the resolved market. This is typically a 32-byte hex string. |
| `negRisk` | boolean | false | false | Whether this is a negative-risk market. Selects the V2 NegRisk collateral adapter when true. Default: false |

### `search_markets`
Search for markets, events, and profiles using text search.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | true | Search query text |

### `update_balance_allowance`
Update balance and allowance for the authenticated account. Required before trading.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `assetType` | string | true | Asset type to update allowance for: COLLATERAL or CONDITIONAL |
| `tokenID` | string | false | Optional token ID for conditional token |

<!-- AUTO-GENERATED TOOLS END -->

## 👨‍💻 Development

### 🏗️ Build Project
```bash
pnpm run build
```

### 👁️ Development Mode (Watch)
```bash
pnpm run watch
```

### ✅ Linting & Formatting
```bash
pnpm run lint
pnpm run format
```

### 📁 Project Structure
*   `src/tools/`: Individual tool definitions
*   `src/services/`: API client and business logic
*   `src/index.ts`: Server entry point

## 📚 Resources

*   [Polymarket API Documentation](https://docs.polymarket.com)
*   [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
*   [Polymarket Platform](https://polymarket.com)

## ⚠️ Disclaimer

This project is an unofficial tool and is not directly affiliated with Polymarket. It interacts with financial and prediction market data. Users should exercise caution and verify all data independently. Trading in prediction markets involves risk.

## 📄 License

[MIT](LICENSE)
