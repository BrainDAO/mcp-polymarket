import {
	type BigNumber,
	Contract,
	constants,
	providers,
	utils,
	Wallet,
} from "ethers";
import { log } from "../util/log.js";
import { getConfig, POLYGON_ADDRESSES } from "./config.js";

type ApprovalKey =
	| "COLLATERAL_ALLOWANCE_FOR_EXCHANGE"
	| "CTF_APPROVAL_FOR_EXCHANGE"
	| "COLLATERAL_ALLOWANCE_FOR_NEG_RISK_EXCHANGE"
	| "CTF_APPROVAL_FOR_NEG_RISK_EXCHANGE"
	| "COLLATERAL_ALLOWANCE_FOR_CTF_ADAPTER"
	| "CTF_APPROVAL_FOR_CTF_ADAPTER"
	| "COLLATERAL_ALLOWANCE_FOR_NEG_RISK_CTF_ADAPTER"
	| "CTF_APPROVAL_FOR_NEG_RISK_CTF_ADAPTER";

export type ApprovalCheck = {
	collateralAllowanceForExchange: string;
	ctfApprovedForExchange: boolean;
	collateralAllowanceForNegRiskExchange: string;
	ctfApprovedForNegRiskExchange: boolean;
	collateralAllowanceForCtfAdapter: string;
	ctfApprovedForCtfAdapter: boolean;
	collateralAllowanceForNegRiskCtfAdapter: string;
	ctfApprovedForNegRiskCtfAdapter: boolean;
	missing: ApprovalKey[];
	addresses: typeof POLYGON_ADDRESSES;
	owner: string;
};

function isTradingApproval(key: ApprovalKey): boolean {
	return (
		key === "COLLATERAL_ALLOWANCE_FOR_EXCHANGE" ||
		key === "CTF_APPROVAL_FOR_EXCHANGE" ||
		key === "COLLATERAL_ALLOWANCE_FOR_NEG_RISK_EXCHANGE" ||
		key === "CTF_APPROVAL_FOR_NEG_RISK_EXCHANGE"
	);
}

/**
 * Class-style approvals service for consistency with other services.
 */
export class PolymarketApprovals {
	private signer: Wallet;

	constructor(signer?: Wallet) {
		this.signer = signer ?? getSignerFromEnv();
	}

	/** Get the next pending nonce for this signer */
	private async getPendingNonce(): Promise<number> {
		return this.signer.getTransactionCount("pending");
	}

	/**
	 * Send transaction with nonce management and retry logic.
	 */
	private async sendTx(
		send: (
			overrides: providers.TransactionRequest,
		) => Promise<providers.TransactionResponse>,
		nonce: number,
		waitConfs: number,
	): Promise<string> {
		const overrides = {
			nonce,
			gasPrice: utils.parseUnits("100", "gwei"),
			gasLimit: 200_000,
		};

		try {
			const tx = await send(overrides);
			if (waitConfs > 0) {
				const receipt = await tx.wait(waitConfs);
				return receipt.transactionHash;
			}
			return tx.hash;
		} catch (e) {
			const msg = (e as Error).message || "";
			const isNonceErr =
				msg.toLowerCase().includes("nonce") || msg.includes("replace");
			if (!isNonceErr) throw e;

			// Retry with fresh nonce
			const freshNonce = await this.getPendingNonce();
			const tx = await send({ ...overrides, nonce: freshNonce });
			if (waitConfs > 0) {
				const receipt = await tx.wait(waitConfs);
				return receipt.transactionHash;
			}
			return tx.hash;
		}
	}

	static rationale(): string {
		return [
			"Polymarket V2 requires limited pUSD and Conditional Token permissions:",
			"- pUSD allowances let the V2 exchanges and collateral adapters move collateral.",
			"- CTF setApprovalForAll lets those contracts move position tokens.",
			"Standard ERC20/ERC1155 approvals set to MaxUint. Revocable anytime in your wallet.",
		].join("\n");
	}

	/** Check current approval state for the signer's wallet address */
	async check(): Promise<ApprovalCheck> {
		const {
			EXCHANGE_ADDRESS,
			NEG_RISK_EXCHANGE_ADDRESS,
			CTF_COLLATERAL_ADAPTER_ADDRESS,
			NEG_RISK_CTF_COLLATERAL_ADAPTER_ADDRESS,
		} = POLYGON_ADDRESSES;
		const collateral = getCollateralContract(this.signer);
		const ctf = getCtfContract(this.signer);
		const addr = this.signer.address;

		const [
			collateralExchange,
			ctfExchange,
			collateralNegRiskExchange,
			ctfNegRiskExchange,
			collateralCtfAdapter,
			ctfAdapter,
			collateralNegRiskCtfAdapter,
			ctfNegRiskAdapter,
		] = await Promise.all([
			collateral.allowance(addr, EXCHANGE_ADDRESS) as Promise<BigNumber>,
			ctf.isApprovedForAll(addr, EXCHANGE_ADDRESS) as Promise<boolean>,
			collateral.allowance(
				addr,
				NEG_RISK_EXCHANGE_ADDRESS,
			) as Promise<BigNumber>,
			ctf.isApprovedForAll(addr, NEG_RISK_EXCHANGE_ADDRESS) as Promise<boolean>,
			collateral.allowance(
				addr,
				CTF_COLLATERAL_ADAPTER_ADDRESS,
			) as Promise<BigNumber>,
			ctf.isApprovedForAll(
				addr,
				CTF_COLLATERAL_ADAPTER_ADDRESS,
			) as Promise<boolean>,
			collateral.allowance(
				addr,
				NEG_RISK_CTF_COLLATERAL_ADAPTER_ADDRESS,
			) as Promise<BigNumber>,
			ctf.isApprovedForAll(
				addr,
				NEG_RISK_CTF_COLLATERAL_ADAPTER_ADDRESS,
			) as Promise<boolean>,
		]);

		const missing: ApprovalKey[] = [];
		if (!collateralExchange.gt(constants.Zero))
			missing.push("COLLATERAL_ALLOWANCE_FOR_EXCHANGE");
		if (!ctfExchange) missing.push("CTF_APPROVAL_FOR_EXCHANGE");
		if (!collateralNegRiskExchange.gt(constants.Zero))
			missing.push("COLLATERAL_ALLOWANCE_FOR_NEG_RISK_EXCHANGE");
		if (!ctfNegRiskExchange) missing.push("CTF_APPROVAL_FOR_NEG_RISK_EXCHANGE");
		if (!collateralCtfAdapter.gt(constants.Zero))
			missing.push("COLLATERAL_ALLOWANCE_FOR_CTF_ADAPTER");
		if (!ctfAdapter) missing.push("CTF_APPROVAL_FOR_CTF_ADAPTER");
		if (!collateralNegRiskCtfAdapter.gt(constants.Zero))
			missing.push("COLLATERAL_ALLOWANCE_FOR_NEG_RISK_CTF_ADAPTER");
		if (!ctfNegRiskAdapter)
			missing.push("CTF_APPROVAL_FOR_NEG_RISK_CTF_ADAPTER");

		return {
			collateralAllowanceForExchange: collateralExchange.toString(),
			ctfApprovedForExchange: ctfExchange,
			collateralAllowanceForNegRiskExchange:
				collateralNegRiskExchange.toString(),
			ctfApprovedForNegRiskExchange: ctfNegRiskExchange,
			collateralAllowanceForCtfAdapter: collateralCtfAdapter.toString(),
			ctfApprovedForCtfAdapter: ctfAdapter,
			collateralAllowanceForNegRiskCtfAdapter:
				collateralNegRiskCtfAdapter.toString(),
			ctfApprovedForNegRiskCtfAdapter: ctfNegRiskAdapter,
			missing,
			addresses: POLYGON_ADDRESSES,
			owner: addr,
		};
	}

	/**
	 * Throw a structured error when exchange approvals required for trading are missing.
	 */
	async assertTradingApproved(): Promise<void> {
		const status = await this.check();
		const missing = status.missing.filter(isTradingApproval);

		if (missing.length > 0) {
			throw new ApprovalRequiredError({ ...status, missing });
		}
	}

	/**
	 * Execute approvals for contracts that don't already have approvals set.
	 */
	async approveAll(opts?: { waitForConfirmations?: number }): Promise<{
		txHashes: string[];
		message: string;
		waitedConfirmations: number;
	}> {
		const {
			EXCHANGE_ADDRESS,
			NEG_RISK_EXCHANGE_ADDRESS,
			CTF_COLLATERAL_ADAPTER_ADDRESS,
			NEG_RISK_CTF_COLLATERAL_ADAPTER_ADDRESS,
		} = POLYGON_ADDRESSES;
		const collateral = getCollateralContract(this.signer);
		const ctf = getCtfContract(this.signer);
		const current = await this.check();
		const waitConfs = opts?.waitForConfirmations ?? 0;

		const txHashes: string[] = [];
		let nonce = await this.getPendingNonce();

		const approvals = [
			{
				key: "COLLATERAL_ALLOWANCE_FOR_EXCHANGE",
				fn: () => collateral.approve(EXCHANGE_ADDRESS, constants.MaxUint256),
				label: "pUSD->Exchange",
			},
			{
				key: "CTF_APPROVAL_FOR_EXCHANGE",
				fn: () => ctf.setApprovalForAll(EXCHANGE_ADDRESS, true),
				label: "CTF->Exchange",
			},
			{
				key: "COLLATERAL_ALLOWANCE_FOR_NEG_RISK_EXCHANGE",
				fn: () =>
					collateral.approve(NEG_RISK_EXCHANGE_ADDRESS, constants.MaxUint256),
				label: "pUSD->NegRiskExchange",
			},
			{
				key: "CTF_APPROVAL_FOR_NEG_RISK_EXCHANGE",
				fn: () => ctf.setApprovalForAll(NEG_RISK_EXCHANGE_ADDRESS, true),
				label: "CTF->NegRiskExchange",
			},
			{
				key: "COLLATERAL_ALLOWANCE_FOR_CTF_ADAPTER",
				fn: () =>
					collateral.approve(
						CTF_COLLATERAL_ADAPTER_ADDRESS,
						constants.MaxUint256,
					),
				label: "pUSD->CtfCollateralAdapter",
			},
			{
				key: "CTF_APPROVAL_FOR_CTF_ADAPTER",
				fn: () => ctf.setApprovalForAll(CTF_COLLATERAL_ADAPTER_ADDRESS, true),
				label: "CTF->CtfCollateralAdapter",
			},
			{
				key: "COLLATERAL_ALLOWANCE_FOR_NEG_RISK_CTF_ADAPTER",
				fn: () =>
					collateral.approve(
						NEG_RISK_CTF_COLLATERAL_ADAPTER_ADDRESS,
						constants.MaxUint256,
					),
				label: "pUSD->NegRiskCtfCollateralAdapter",
			},
			{
				key: "CTF_APPROVAL_FOR_NEG_RISK_CTF_ADAPTER",
				fn: () =>
					ctf.setApprovalForAll(NEG_RISK_CTF_COLLATERAL_ADAPTER_ADDRESS, true),
				label: "CTF->NegRiskCtfCollateralAdapter",
			},
		] as const;

		for (const { key, fn, label } of approvals) {
			if (current.missing.includes(key)) {
				const hash = await this.sendTx(fn, nonce++, waitConfs);
				txHashes.push(hash);
				log(`Approved ${label}: ${hash}`);
			}
		}

		return {
			txHashes,
			message:
				txHashes.length === 0
					? "No transactions needed; required approvals are already in place."
					: waitConfs > 0
						? `${txHashes.length} approval(s) confirmed. Revocable anytime in your wallet.`
						: `${txHashes.length} approval(s) submitted. Monitor in your wallet.`,
			waitedConfirmations: waitConfs,
		};
	}
}

/**
 * Build a signer using the same config used elsewhere in the SDK
 */
function getSignerFromEnv(): Wallet {
	const cfg = getConfig();
	if (!cfg.privateKey) {
		throw new Error(
			"POLYMARKET_PRIVATE_KEY environment variable is required for approvals",
		);
	}
	// Use StaticJsonRpcProvider to completely skip network auto-detection
	const provider = new providers.StaticJsonRpcProvider(cfg.rpcUrl, cfg.chainId);
	return new Wallet(cfg.privateKey, provider);
}

export class ApprovalRequiredError extends Error {
	code = "APPROVAL_REQUIRED" as const;
	details: ApprovalCheck;

	constructor(details: ApprovalCheck) {
		super(
			[
				"Token approvals required before proceeding.",
				PolymarketApprovals.rationale(),
				"Use 'approve_allowances' tool to grant approvals.",
			].join("\n\n"),
		);
		this.name = "ApprovalRequiredError";
		this.details = details;
	}

	toJSON() {
		return {
			approvalRequired: true,
			code: this.code,
			message: this.message,
			details: this.details,
			nextStep: {
				tool: "approve_allowances",
				name: "Approve Allowances",
				description:
					"Grant pUSD and CTF approvals for Polymarket V2 (revocable anytime).",
			},
		};
	}
}

/**
 * Get the collateral token (pUSD) contract instance.
 * Post April 2026 migration, the collateral is pUSD (1:1 USDC wrapper),
 * not the bridged USDC.e that was used before.
 */
function getCollateralContract(wallet: Wallet): Contract {
	const ERC20_ABI = [
		"function allowance(address owner, address spender) view returns (uint256)",
		"function approve(address spender, uint256 amount) returns (bool)",
	];
	return new Contract(POLYGON_ADDRESSES.COLLATERAL_ADDRESS, ERC20_ABI, wallet);
}

/**
 * Get Conditional Tokens Framework (CTF) contract instance (following Polymarket SDK pattern)
 */
function getCtfContract(wallet: Wallet): Contract {
	const CTF_ABI = [
		"function isApprovedForAll(address owner, address operator) view returns (bool)",
		"function setApprovalForAll(address operator, bool approved)",
	];
	return new Contract(POLYGON_ADDRESSES.CTF_ADDRESS, CTF_ABI, wallet);
}
