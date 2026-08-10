export type BaseConfig = {
	host: string;
	chainId: number;
	signatureType: number;
	rpcUrl: string;
	privateKey?: string;
	funderAddress?: string;
};

// Polymarket v2 (post-April-28-2026 migration).
// Collateral is now pUSD (1:1 USDC wrapper), exchanges moved to v2 addresses.
// USDC.e is still around as the underlying for wrap/unwrap via CollateralOnramp/Offramp.
export const POLYGON_ADDRESSES = {
	// Trading collateral after migration (was USDC.e)
	COLLATERAL_ADDRESS: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", // pUSD
	USDCE_ADDRESS: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // bridged USDC.e (underlying)
	COLLATERAL_ONRAMP_ADDRESS: "0x93070a847efEf7F70739046A929D47a521F5B8ee", // USDC.e -> pUSD
	COLLATERAL_OFFRAMP_ADDRESS: "0x2957922Eb93258b93368531d39fAcCA3B4dC5854", // pUSD -> USDC.e
	CTF_ADDRESS: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045", // Conditional Tokens Framework (unchanged)
	EXCHANGE_ADDRESS: "0xE111180000d2663C0091e4f400237545B87B996B", // CTF Exchange v2
	NEG_RISK_EXCHANGE_ADDRESS: "0xe2222d279d744050d28e00520010520000310F59", // NegRisk Exchange v2
	CTF_COLLATERAL_ADAPTER_ADDRESS: "0xAdA100Db00Ca00073811820692005400218FcE1f",
	NEG_RISK_CTF_COLLATERAL_ADAPTER_ADDRESS:
		"0xadA2005600Dec949baf300f4C6120000bDB6eAab",
} as const;

/**
 * Builds configuration from environment variables and optional overrides.
 */
export function getConfig(overrides: Partial<BaseConfig> = {}): BaseConfig {
	const host =
		overrides.host ??
		process.env.CLOB_API_BASE ??
		"https://clob.polymarket.com";

	const chainId = Number(overrides.chainId ?? process.env.CHAIN_ID ?? 137);

	const privateKey = overrides.privateKey ?? process.env.POLYMARKET_PRIVATE_KEY;
	const funderAddress =
		overrides.funderAddress ??
		process.env.POLYMARKET_FUNDER ??
		process.env.FUNDER_ADDRESS;
	const signatureType = Number(
		overrides.signatureType ??
			process.env.SIGNATURE_TYPE ??
			(funderAddress ? 2 : 0),
	);

	const rpcUrl =
		overrides.rpcUrl ??
		process.env.POLYGON_RPC_URL ??
		"https://polygon-rpc.com";

	return {
		host,
		chainId,
		signatureType,
		rpcUrl,
		privateKey,
		funderAddress,
	};
}
