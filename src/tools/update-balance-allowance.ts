import { AssetType } from "@polymarket/clob-client-v2";
import { z } from "zod";
import { tradeApi } from "../services/trading.js";
import { withApprovalGuard } from "../util/with-approval-guard.js";

const updateBalanceAllowanceSchema = z.object({
	assetType: z
		.enum(["COLLATERAL", "CONDITIONAL"])
		.describe("Asset type to update allowance for: COLLATERAL or CONDITIONAL"),
	tokenID: z
		.string()
		.optional()
		.describe("Optional token ID for conditional token"),
});

export const updateBalanceAllowanceTool = {
	name: "update_balance_allowance",
	description:
		"Update balance and allowance for the authenticated account. Required before trading.",
	parameters: updateBalanceAllowanceSchema,
	execute: async (args: z.infer<typeof updateBalanceAllowanceSchema>) => {
		const params: { asset_type: AssetType; token_id?: string } = {
			asset_type: AssetType[args.assetType],
		};
		if (args.tokenID) params.token_id = args.tokenID;
		return withApprovalGuard(async () => {
			await tradeApi.updateBalanceAllowance(params);
			return {
				success: true,
				message: "Balance allowance updated successfully",
			};
		});
	},
};
