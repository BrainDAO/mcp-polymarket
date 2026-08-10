import { z } from "zod";
import { redemptionApi } from "../services/redemption.js";

const redeemPositionsSchema = z.object({
	conditionId: z
		.string()
		.describe(
			"The condition ID for the resolved market. This is typically a 32-byte hex string.",
		),
	negRisk: z
		.boolean()
		.optional()
		.default(false)
		.describe(
			"Whether this is a negative-risk market. Selects the V2 NegRisk collateral adapter when true. Default: false",
		),
});

export const redeemPositionsTool = {
	name: "redeem_positions",
	description:
		"Redeem all winning outcome tokens from a resolved Polymarket market into pUSD. Provide the conditionId and set negRisk=true for negative-risk markets.",
	parameters: redeemPositionsSchema,
	execute: async (args: z.infer<typeof redeemPositionsSchema>) => {
		try {
			const result = await redemptionApi.redeemPositions({
				conditionId: args.conditionId,
				negRisk: args.negRisk,
			});

			if (result.success) {
				return JSON.stringify(
					{
						success: true,
						message: "Position redeemed successfully",
						txHash: result.txHash,
						polygonscanUrl: `https://polygonscan.com/tx/${result.txHash}`,
					},
					null,
					2,
				);
			}

			return JSON.stringify(
				{
					success: false,
					error: result.error,
					...(result.txHash && {
						txHash: result.txHash,
						polygonscanUrl: `https://polygonscan.com/tx/${result.txHash}`,
					}),
				},
				null,
				2,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return JSON.stringify(
				{
					success: false,
					error: errorMessage,
				},
				null,
				2,
			);
		}
	},
};
