import { AssetType } from "@polymarket/clob-client-v2";
import { z } from "zod";
import { tradeApi } from "../services/trading.js";
import { withApprovalGuard } from "../util/with-approval-guard.js";

const getBalanceAllowanceSchema = z.object({
	assetType: z
		.enum(["COLLATERAL", "CONDITIONAL"])
		.describe("Asset type to check balance for: COLLATERAL or CONDITIONAL"),
	tokenID: z
		.string()
		.optional()
		.describe("Optional token ID for conditional token balance"),
});

export const getBalanceAllowanceTool = {
	name: "get_balance_allowance",
	description:
		"Get balance and allowance information for the authenticated account. Can check COLLATERAL or CONDITIONAL tokens.",
	parameters: getBalanceAllowanceSchema,
	execute: async (args: z.infer<typeof getBalanceAllowanceSchema>) => {
		const params: { asset_type: AssetType; token_id?: string } = {
			asset_type: AssetType[args.assetType],
		};
		if (args.tokenID) params.token_id = args.tokenID;
		return withApprovalGuard(() => tradeApi.getBalanceAllowance(params));
	},
};
