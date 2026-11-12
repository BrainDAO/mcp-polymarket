import { z } from "zod";
import { tradeApi } from "../services/trading.js";
import { withApprovalGuard } from "../util/with-approval-guard.js";

const cancelAllOrdersSchema = z.object({});

export const cancelAllOrdersTool = {
	name: "cancel_all_orders",
	description: "Cancel all open orders for the authenticated account.",
	annotations: {
		title: "Cancel All Orders",
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: false,
		openWorldHint: true,
	},
	parameters: cancelAllOrdersSchema,
	execute: async (_args: z.infer<typeof cancelAllOrdersSchema>) =>
		withApprovalGuard(() => tradeApi.cancelAllOrders()),
};
