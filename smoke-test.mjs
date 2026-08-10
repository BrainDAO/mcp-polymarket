#!/usr/bin/env node
// Live regression checks for the Polymarket V2 / pUSD migration.
// Supplying POLYMARKET_PRIVATE_KEY also derives credentials and signs an order,
// but this script never posts an order or sends an on-chain transaction.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const envCandidates = [join(scriptDir, ".env"), join(scriptDir, "..", ".env")];
for (const envPath of envCandidates) {
	if (!existsSync(envPath)) continue;
	const content = readFileSync(envPath, "utf8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const separator = trimmed.indexOf("=");
		if (separator < 0) continue;
		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim();
		if (!(key in process.env)) process.env[key] = value;
	}
	console.log(
		`Loaded environment from ${envPath.replace(process.env.HOME ?? "", "~")}`,
	);
	break;
}

const results = [];
let failures = 0;

async function test(name, fn) {
	const start = Date.now();
	try {
		const summary = await fn();
		const ms = Date.now() - start;
		results.push({ name, status: "PASS", ms, summary });
		console.log(`PASS ${name} (${ms}ms)`);
		if (summary) console.log(`     ${summary}`);
	} catch (error) {
		failures++;
		const ms = Date.now() - start;
		const message = error?.message || String(error);
		results.push({ name, status: "FAIL", ms, error: message });
		console.log(`FAIL ${name} (${ms}ms)`);
		console.log(`     ${message}`);
		if (error?.stack) {
			console.log(error.stack.split("\n").slice(1, 4).join("\n"));
		}
	}
}

function isTransientNetworkError(error) {
	const message = error?.message ?? String(error);
	return (
		message.includes("fetch failed") ||
		message.includes("ECONNRESET") ||
		message.includes("ETIMEDOUT") ||
		message.includes("certificate") ||
		message.includes("Client network socket")
	);
}

async function withNetworkRetry(fn, attempts = 4) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			if (!isTransientNetworkError(error) || attempt === attempts) throw error;
			await new Promise((resolve) => setTimeout(resolve, attempt * 250));
		}
	}
}

function getFirstTokenId(markets) {
	for (const market of markets) {
		const tokenIds =
			typeof market.clobTokenIds === "string"
				? JSON.parse(market.clobTokenIds)
				: market.clobTokenIds;
		if (tokenIds?.[0]) return tokenIds[0];
	}
	return null;
}

console.log("=== mcp-polymarket V2 smoke test ===\n");

const { api } = await import("./dist/services/api.js");
const { getConfig } = await import("./dist/services/config.js");

let activeMarkets = [];
let tokenId = null;

await test("api.listActiveMarkets returns active markets", async () => {
	activeMarkets = await withNetworkRetry(() => api.listActiveMarkets(20, 0));
	if (!Array.isArray(activeMarkets)) {
		throw new Error(`expected array, got ${typeof activeMarkets}`);
	}
	if (activeMarkets.length === 0) throw new Error("no active markets returned");
	tokenId = getFirstTokenId(activeMarkets);
	if (!tokenId)
		throw new Error("active markets did not include a CLOB token ID");
	return `${activeMarkets.length} markets; token ${tokenId.slice(0, 20)}...`;
});

await test("api.searchMarkets returns matching results", async () => {
	const result = await withNetworkRetry(() =>
		api.searchMarkets("counter strike"),
	);
	const eventCount = result?.events?.length ?? 0;
	const marketCount = result?.markets?.length ?? 0;
	if (eventCount + marketCount === 0) {
		throw new Error("search returned no events or markets");
	}
	return `${eventCount} events, ${marketCount} markets`;
});

await test("api.getMarketsByTag returns an array", async () => {
	const markets = await withNetworkRetry(() =>
		api.getMarketsByTag("100196", 5, false),
	);
	if (!Array.isArray(markets)) {
		throw new Error(`expected array, got ${typeof markets}`);
	}
	return `${markets.length} active esports markets`;
});

await test("api.getOrderBook returns a V2 order book", async () => {
	if (!tokenId) throw new Error("no token ID available");
	const book = await withNetworkRetry(() => api.getOrderBook(tokenId));
	if (!Array.isArray(book?.bids) || !Array.isArray(book?.asks)) {
		throw new Error("order book did not include bid and ask arrays");
	}
	return `${book.bids.length} bids, ${book.asks.length} asks`;
});

await test("config detects EOA and Safe signature defaults", async () => {
	const previousSignatureType = process.env.SIGNATURE_TYPE;
	const previousPolymarketFunder = process.env.POLYMARKET_FUNDER;
	const previousFunderAddress = process.env.FUNDER_ADDRESS;
	try {
		delete process.env.SIGNATURE_TYPE;
		delete process.env.POLYMARKET_FUNDER;
		delete process.env.FUNDER_ADDRESS;

		const eoaConfig = getConfig();
		if (eoaConfig.signatureType !== 0) {
			throw new Error(
				`expected EOA signature type 0, got ${eoaConfig.signatureType}`,
			);
		}

		const safeConfig = getConfig({
			funderAddress: "0x0000000000000000000000000000000000000001",
		});
		if (safeConfig.signatureType !== 2) {
			throw new Error(
				`expected Safe signature type 2, got ${safeConfig.signatureType}`,
			);
		}
	} finally {
		if (previousSignatureType === undefined) delete process.env.SIGNATURE_TYPE;
		else process.env.SIGNATURE_TYPE = previousSignatureType;
		if (previousPolymarketFunder === undefined)
			delete process.env.POLYMARKET_FUNDER;
		else process.env.POLYMARKET_FUNDER = previousPolymarketFunder;
		if (previousFunderAddress === undefined) delete process.env.FUNDER_ADDRESS;
		else process.env.FUNDER_ADDRESS = previousFunderAddress;
	}
	return "EOA=0, Safe=2";
});

if (process.env.POLYMARKET_PRIVATE_KEY) {
	console.log("\nPrivate key detected; running authenticated signing checks\n");

	const { ClobClient, Side } = await import("@polymarket/clob-client-v2");
	const { Wallet } = await import("ethers");
	const { tradeApi } = await import("./dist/services/trading.js");

	await test("trading.getSignerAddress returns an address", async () => {
		const address = await tradeApi.getSignerAddress();
		if (!address?.startsWith("0x")) throw new Error(`bad address: ${address}`);
		return address;
	});

	await test("trading.getServerTime reaches CLOB V2", async () => {
		const serverTime = await withNetworkRetry(() => tradeApi.getServerTime());
		if (typeof serverTime !== "number") {
			throw new Error(`expected number, got ${typeof serverTime}`);
		}
		const drift = Math.abs(Date.now() / 1000 - serverTime);
		return `${drift.toFixed(1)}s clock drift`;
	});

	await test("trading.getBalanceAllowance returns pUSD state", async () => {
		const balance = await withNetworkRetry(() =>
			tradeApi.getBalanceAllowance({
				asset_type: "COLLATERAL",
			}),
		);
		if (
			typeof balance?.balance !== "string" ||
			typeof balance?.allowances !== "object"
		) {
			throw new Error("unexpected balance/allowance response");
		}
		return `balance=${balance.balance}`;
	});

	let marketInfo = null;
	await test("trading.getMarketInfo returns V2 parameters", async () => {
		if (!tokenId) throw new Error("no token ID available");
		marketInfo = await withNetworkRetry(() => tradeApi.getMarketInfo(tokenId));
		if (!marketInfo?.tickSize || typeof marketInfo.negRisk !== "boolean") {
			throw new Error("missing tick size or NegRisk flag");
		}
		return `tickSize=${marketInfo.tickSize}, negRisk=${marketInfo.negRisk}`;
	});

	await test("V2 client constructs and signs without posting", async () => {
		if (!tokenId || !marketInfo) throw new Error("market metadata unavailable");
		const config = getConfig();
		const signer = new Wallet(config.privateKey);
		const clientOptions = {
			host: config.host,
			chain: config.chainId,
			signer,
			signatureType: config.signatureType,
			funderAddress: config.funderAddress,
		};
		const credentials = await withNetworkRetry(() =>
			new ClobClient({
				...clientOptions,
				throwOnError: true,
			}).deriveApiKey(),
		);
		const client = new ClobClient({
			...clientOptions,
			creds: credentials,
			throwOnError: true,
		});
		const order = await client.createOrder(
			{
				tokenID: tokenId,
				price: 0.5,
				size: 1,
				side: Side.BUY,
			},
			{
				tickSize: marketInfo.tickSize,
				negRisk: marketInfo.negRisk,
			},
		);
		if (!order.signature || !("timestamp" in order)) {
			throw new Error("client did not construct a signed V2 order");
		}
		if (order.signatureType !== config.signatureType) {
			throw new Error(
				`expected signature type ${config.signatureType}, got ${order.signatureType}`,
			);
		}
		return `signed as type ${order.signatureType}; order was not posted`;
	});
} else {
	console.log("\nNo private key; authenticated checks skipped");
}

console.log("\n=== SUMMARY ===");
console.log(
	`Total: ${results.length}, Pass: ${results.length - failures}, Fail: ${failures}`,
);
process.exit(failures > 0 ? 1 : 0);
