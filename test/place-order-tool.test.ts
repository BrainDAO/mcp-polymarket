import assert from "node:assert/strict";
import { it } from "node:test";
import { Wallet } from "ethers";

// Configure the env the way an MCP host would, before the tools load.
process.env.POLYMARKET_PRIVATE_KEY = Wallet.createRandom().privateKey;
process.env.POLYMARKET_FUNDER = "0x0000000000000000000000000000000000000001";
process.env.POLYMARKET_MAX_ORDER_USD = "25";

const { getTradingInstance } = await import("../src/services/trading.js");
const { placeOrderTool } = await import("../src/tools/place-order.js");

it("place_order returns a rejection instead of posting an oversized order", async () => {
	const posted: unknown[] = [];
	Object.assign(getTradingInstance() as unknown as Record<string, unknown>, {
		client: {
			getTickSize: async () => "0.01",
			getNegRisk: async () => false,
			getFeeRateBps: async () => 0,
			getBalanceAllowance: async () => ({ balance: "1000000000000" }),
			createAndPostOrder: async (order: unknown) => {
				posted.push(order);
				return { success: true };
			},
		},
	});

	const out = JSON.parse(
		await placeOrderTool.execute({
			tokenId: "t",
			price: 0.9,
			size: 100_000,
			side: "BUY",
		}),
	);
	assert.equal(out.rejected, true);
	assert.equal(out.code, "ORDER_LIMIT_EXCEEDED");
	assert.equal(posted.length, 0);

	await placeOrderTool.execute({
		tokenId: "t",
		price: 0.5,
		size: 50,
		side: "BUY",
	});
	assert.equal(posted.length, 1);
});
