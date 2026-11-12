import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Wallet } from "ethers";
import {
	getOrderLimitsFromEnv,
	OrderLimitError,
	OrderLimitGuard,
} from "../src/services/order-limits.js";
import { PolymarketTrading } from "../src/services/trading.js";

describe("getOrderLimitsFromEnv", () => {
	it("returns no limits when unset or blank", () => {
		assert.deepEqual(getOrderLimitsFromEnv({}), {
			maxOrderUsd: undefined,
			maxSessionUsd: undefined,
		});
		assert.deepEqual(getOrderLimitsFromEnv({ POLYMARKET_MAX_ORDER_USD: " " }), {
			maxOrderUsd: undefined,
			maxSessionUsd: undefined,
		});
	});

	it("parses positive numbers", () => {
		assert.deepEqual(
			getOrderLimitsFromEnv({
				POLYMARKET_MAX_ORDER_USD: "25",
				POLYMARKET_MAX_SESSION_USD: "100.5",
			}),
			{ maxOrderUsd: 25, maxSessionUsd: 100.5 },
		);
	});

	for (const bad of ["abc", "0", "-5", "Infinity", "NaN"]) {
		it(`rejects malformed value ${JSON.stringify(bad)}`, () => {
			assert.throws(
				() => getOrderLimitsFromEnv({ POLYMARKET_MAX_ORDER_USD: bad }),
				/POLYMARKET_MAX_ORDER_USD must be a positive number/,
			);
		});
	}
});

describe("OrderLimitGuard", () => {
	it("allows anything when no limits are set", () => {
		const guard = new OrderLimitGuard({});
		guard.reserve(1_000_000);
		assert.equal(guard.sessionCommittedUsd, 1_000_000);
	});

	it("enforces the per-order limit inclusively", () => {
		const guard = new OrderLimitGuard({ maxOrderUsd: 10 });
		guard.reserve(10);
		assert.throws(() => guard.reserve(10.01), OrderLimitError);
	});

	it("enforces the cumulative session limit and frees released reservations", () => {
		const guard = new OrderLimitGuard({ maxSessionUsd: 20 });
		guard.reserve(15);
		const second = guard.reserve(5);
		assert.throws(() => guard.reserve(1), /session limit/);
		second.release();
		second.release(); // idempotent
		assert.equal(guard.sessionCommittedUsd, 15);
		guard.reserve(5);
	});
});

/** Fake CLOB client that records what would have been posted. */
function fakeClient() {
	const posted: unknown[] = [];
	return {
		posted,
		client: {
			getTickSize: async () => "0.01",
			getNegRisk: async () => false,
			getFeeRateBps: async () => 0,
			getBalanceAllowance: async () => ({ balance: "1000000000000" }),
			getOrderBook: async () => ({
				bids: [
					{ price: "0.40", size: "100" },
					{ price: "0.55", size: "100" },
				],
				asks: [],
			}),
			createAndPostOrder: async (order: unknown) => {
				posted.push(order);
				return { success: true, orderID: "0xabc" };
			},
			createAndPostMarketOrder: async (order: unknown) => {
				posted.push(order);
				return { success: true, orderID: "0xdef" };
			},
		},
	};
}

function tradingWith(
	limits: { maxOrderUsd?: number; maxSessionUsd?: number },
	client: object,
) {
	const trading = new PolymarketTrading({
		privateKey: Wallet.createRandom().privateKey,
		// A funder skips the on-chain approval check, which needs an RPC.
		funderAddress: "0x0000000000000000000000000000000000000001",
		orderLimits: limits,
	});
	Object.assign(trading as unknown as Record<string, unknown>, { client });
	return trading;
}

describe("PolymarketTrading order limits", () => {
	let fake: ReturnType<typeof fakeClient>;
	beforeEach(() => {
		fake = fakeClient();
	});

	it("rejects an oversized limit order before posting it", async () => {
		const trading = tradingWith({ maxOrderUsd: 50 }, fake.client);
		await assert.rejects(
			trading.placeOrder({ tokenId: "t", price: 0.6, size: 1000, side: "BUY" }),
			(err: unknown) =>
				err instanceof OrderLimitError &&
				err.details.orderUsd === 600 &&
				err.details.limit === "maxOrderUsd",
		);
		assert.equal(fake.posted.length, 0);
	});

	it("posts a limit order within the limit", async () => {
		const trading = tradingWith({ maxOrderUsd: 50 }, fake.client);
		await trading.placeOrder({
			tokenId: "t",
			price: 0.6,
			size: 10,
			side: "SELL",
		});
		assert.equal(fake.posted.length, 1);
	});

	it("caps a market BUY by its pUSD amount", async () => {
		const trading = tradingWith({ maxOrderUsd: 5 }, fake.client);
		await assert.rejects(
			trading.placeMarketOrder({ tokenId: "t", amount: 6, side: "BUY" }),
			OrderLimitError,
		);
		await trading.placeMarketOrder({ tokenId: "t", amount: 5, side: "BUY" });
		assert.equal(fake.posted.length, 1);
	});

	it("values a market SELL at shares * best bid", async () => {
		const trading = tradingWith({ maxOrderUsd: 10 }, fake.client);
		// 20 shares * 0.55 best bid = 11 pUSD > 10
		await assert.rejects(
			trading.placeMarketOrder({ tokenId: "t", amount: 20, side: "SELL" }),
			(err: unknown) =>
				err instanceof OrderLimitError &&
				Math.abs(err.details.orderUsd - 11) < 1e-9,
		);
		assert.equal(fake.posted.length, 0);
	});

	it("enforces the session limit across order types, including concurrent calls", async () => {
		const trading = tradingWith({ maxSessionUsd: 10 }, fake.client);
		const results = await Promise.allSettled([
			trading.placeMarketOrder({ tokenId: "t", amount: 6, side: "BUY" }),
			trading.placeOrder({ tokenId: "t", price: 0.5, size: 12, side: "BUY" }),
		]);
		assert.equal(
			results.filter((r) => r.status === "fulfilled").length,
			1,
			"only one of two 6 pUSD orders fits a 10 pUSD session",
		);
		assert.equal(fake.posted.length, 1);
	});

	it("releases the reservation when the exchange rejects the order", async () => {
		const failing = {
			...fake.client,
			createAndPostOrder: async () => {
				throw new Error("not enough balance");
			},
		};
		const trading = tradingWith({ maxSessionUsd: 10 }, failing);
		await assert.rejects(
			trading.placeOrder({ tokenId: "t", price: 0.5, size: 20, side: "BUY" }),
			/not enough balance/,
		);
		// The failed 10 pUSD order didn't consume the budget.
		Object.assign(trading as unknown as Record<string, unknown>, {
			client: fake.client,
		});
		await trading.placeOrder({
			tokenId: "t",
			price: 0.5,
			size: 20,
			side: "BUY",
		});
		assert.equal(fake.posted.length, 1);
	});
});
