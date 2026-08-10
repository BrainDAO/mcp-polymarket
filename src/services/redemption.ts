/**
 * Position Redemption Service
 * Handles redemption of resolved market positions on Polymarket
 */

import { type BigNumber, Contract, providers, Wallet } from "ethers";
import { log } from "../util/log.js";
import { getConfig, POLYGON_ADDRESSES } from "./config.js";

// Parent collection ID for Polymarket (constant)
const PARENT_COLLECTION_ID =
	"0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * CTF (Conditional Tokens Framework) ABI for redemption operations
 */
const CTF_ABI = [
	"function payoutDenominator(bytes32 conditionId) view returns (uint256)",
	"function isApprovedForAll(address owner, address operator) view returns (bool)",
];

const COLLATERAL_ADAPTER_ABI = [
	"function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
];

export interface RedeemResult {
	success: boolean;
	txHash?: string;
	error?: string;
}

export interface RedeemParams {
	conditionId: string;
	negRisk?: boolean;
}

/**
 * Redemption service class
 */
export class PolymarketRedemption {
	private signer: Wallet;
	private provider: providers.JsonRpcProvider;

	constructor(signer?: Wallet) {
		const cfg = getConfig();
		if (!cfg.privateKey) {
			throw new Error(
				"POLYMARKET_PRIVATE_KEY environment variable is required for redemption",
			);
		}
		// Use StaticJsonRpcProvider to completely skip network auto-detection
		this.provider = new providers.StaticJsonRpcProvider(
			cfg.rpcUrl,
			cfg.chainId,
		);
		this.signer = signer ?? new Wallet(cfg.privateKey, this.provider);
	}

	/**
	 * Get the wallet address (funder/proxy or signer address)
	 */
	getWalletAddress(): string {
		const cfg = getConfig();
		return cfg.funderAddress ?? this.signer.address;
	}

	/**
	 * Get CTF contract instance
	 */
	private getCtfContract(): Contract {
		return new Contract(POLYGON_ADDRESSES.CTF_ADDRESS, CTF_ABI, this.signer);
	}

	/**
	 * Get the V2 collateral adapter for a market type.
	 */
	private getCollateralAdapterContract(negRisk: boolean): Contract {
		return new Contract(
			this.getCollateralAdapterAddress(negRisk),
			COLLATERAL_ADAPTER_ABI,
			this.signer,
		);
	}

	private getCollateralAdapterAddress(negRisk: boolean): string {
		return negRisk
			? POLYGON_ADDRESSES.NEG_RISK_CTF_COLLATERAL_ADAPTER_ADDRESS
			: POLYGON_ADDRESSES.CTF_COLLATERAL_ADAPTER_ADDRESS;
	}

	/**
	 * Check if a market condition has been resolved
	 */
	async isMarketResolved(conditionId: string): Promise<boolean> {
		const ctf = this.getCtfContract();
		const conditionIdBytes32 = this.formatConditionId(conditionId);
		const payoutDenominator: BigNumber =
			await ctf.payoutDenominator(conditionIdBytes32);
		return payoutDenominator.gt(0);
	}

	/**
	 * Check whether the V2 collateral adapter can transfer the signer's CTF tokens.
	 */
	async isCollateralAdapterApproved(negRisk: boolean): Promise<boolean> {
		const ctf = this.getCtfContract();
		return ctf.isApprovedForAll(
			this.signer.address,
			this.getCollateralAdapterAddress(negRisk),
		);
	}

	/**
	 * Format condition ID as bytes32
	 */
	private formatConditionId(conditionId: string): string {
		return conditionId.startsWith("0x") ? conditionId : `0x${conditionId}`;
	}

	/**
	 * Redeem resolved positions
	 * Claims winnings from markets that have been resolved
	 */
	async redeemPositions(params: RedeemParams): Promise<RedeemResult> {
		const { conditionId, negRisk = false } = params;

		try {
			const conditionIdBytes32 = this.formatConditionId(conditionId);

			const resolved = await this.isMarketResolved(conditionIdBytes32);
			if (!resolved) {
				return {
					success: false,
					error: "Market has not been resolved yet. Cannot redeem positions.",
				};
			}

			const adapterApproved = await this.isCollateralAdapterApproved(negRisk);
			if (!adapterApproved) {
				return {
					success: false,
					error:
						"Collateral adapter is not approved to spend CTF tokens. Please run approve_allowances first.",
				};
			}

			const adapterAddress = this.getCollateralAdapterAddress(negRisk);
			log(`Redeeming ${negRisk ? "NegRisk" : "standard"} position:`);
			log(`  Condition ID: ${conditionIdBytes32}`);
			log(`  Adapter: ${adapterAddress}`);

			const adapter = this.getCollateralAdapterContract(negRisk);
			const tx: providers.TransactionResponse = await adapter.redeemPositions(
				POLYGON_ADDRESSES.COLLATERAL_ADDRESS,
				PARENT_COLLECTION_ID,
				conditionIdBytes32,
				[1n, 2n],
				{
					gasLimit: 300_000,
				},
			);

			log(`Transaction submitted: ${tx.hash}`);

			const receipt = await tx.wait(1);
			if (receipt.status === 0) {
				return {
					success: false,
					txHash: tx.hash,
					error:
						"Transaction reverted on-chain. Position may have already been redeemed.",
				};
			}

			return {
				success: true,
				txHash: receipt.transactionHash,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: errorMessage,
			};
		}
	}
}

// Singleton instance
let redemptionInstance: PolymarketRedemption | null = null;

/**
 * Get or create the redemption service instance
 */
export function getRedemptionInstance(): PolymarketRedemption {
	if (!redemptionInstance) {
		redemptionInstance = new PolymarketRedemption();
	}
	return redemptionInstance;
}

// Lazy proxy facade for easy consumption
export const redemptionApi: PolymarketRedemption = new Proxy(
	{} as PolymarketRedemption,
	{
		get(_target, prop, _receiver) {
			const instance = getRedemptionInstance() as unknown as Record<
				string | symbol,
				unknown
			>;
			const value = instance[prop as keyof PolymarketRedemption] as unknown;
			if (typeof value === "function") {
				return value.bind(instance);
			}
			return value;
		},
	},
);
