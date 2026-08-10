import { z } from "zod";
import { tradeApi } from "../services/trading.js";
import { withApprovalGuard } from "../util/with-approval-guard.js";

const placeMarketOrderSchema = z.object({
	tokenId: z.string().describe("The token ID of the market outcome to trade"),
	amount: z
		.number()
		.positive()
		.describe(
			"BUY orders: pUSD amount to spend. SELL orders: Number of shares to sell. Minimum 1 pUSD for BUY orders.",
		),
	side: z.enum(["BUY", "SELL"]).describe("The side of the order: BUY or SELL"),
	orderType: z
		.enum(["FOK", "FAK"])
		.optional()
		.describe(
			"Order type: FOK (Fill or Kill) or FAK (Fill and Kill). Default: FOK",
		),
});

export const placeMarketOrderTool = {
	name: "place_market_order",
	description:
		"Place a market order that executes immediately at the current market price. For BUY orders, amount is the pUSD amount to spend. For SELL orders, amount is the number of shares to sell. Example: amount=5, side=BUY spends 5 pUSD. Minimum 1 pUSD for BUY orders.",
	parameters: placeMarketOrderSchema,
	execute: async (args: z.infer<typeof placeMarketOrderSchema>) =>
		withApprovalGuard(() =>
			tradeApi.placeMarketOrder({
				tokenId: args.tokenId,
				amount: args.amount,
				side: args.side,
				...(args.orderType && { orderType: args.orderType }),
			}),
		),
};
