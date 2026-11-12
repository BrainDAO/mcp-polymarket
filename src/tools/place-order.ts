import { z } from "zod";
import { tradeApi } from "../services/trading.js";
import { withApprovalGuard } from "../util/with-approval-guard.js";

const placeOrderSchema = z.object({
	tokenId: z.string().describe("The token ID of the market outcome to trade"),
	price: z
		.number()
		.min(0)
		.max(1)
		.describe(
			"The limit price for the order (between 0 and 1). This is the probability/price per share.",
		),
	size: z
		.number()
		.positive()
		.describe(
			"Number of shares to trade. For both BUY and SELL orders, this is always the number of outcome tokens/shares.",
		),
	side: z.enum(["BUY", "SELL"]).describe("The side of the order: BUY or SELL"),
	orderType: z
		.enum(["GTC", "GTD"])
		.optional()
		.describe(
			"Order type: GTC (Good Till Cancelled) or GTD (Good Till Date). Default: GTC",
		),
});

export const placeOrderTool = {
	name: "place_order",
	description:
		"Place a limit order on Polymarket at a specific price. Specify the number of shares (size) and price (0-1). For both BUY and SELL, you specify the number of shares you want to trade. Example: size=10, price=0.6 means buy/sell 10 shares at $0.60 per share (total: $6). Rejected without being sent if it exceeds the server spending limits (POLYMARKET_MAX_ORDER_USD / POLYMARKET_MAX_SESSION_USD).",
	annotations: {
		title: "Place Limit Order",
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: false,
		openWorldHint: true,
	},
	parameters: placeOrderSchema,
	execute: async (args: z.infer<typeof placeOrderSchema>) =>
		withApprovalGuard(() =>
			tradeApi.placeOrder({
				tokenId: args.tokenId,
				price: args.price,
				size: args.size,
				side: args.side,
				...(args.orderType && { orderType: args.orderType }),
			}),
		),
};
