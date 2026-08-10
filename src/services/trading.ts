import type {
	BalanceAllowanceParams,
	OpenOrderParams,
	TickSize,
	TradeParams,
	UserMarketOrderV2,
	UserOrderV2,
} from "@polymarket/clob-client-v2";
import {
	AssetType,
	ClobClient,
	OrderType,
	Side,
} from "@polymarket/clob-client-v2";
import { providers, utils, Wallet } from "ethers";
import { log } from "../util/log.js";
import { PolymarketApprovals } from "./approvals.js";
import { getConfig } from "./config.js";

/** * Interface for trading configuration */
export interface TradingConfig {
	privateKey: string;
	chainId?: number;
	funderAddress?: string;
	signatureType?: number;
	rpcUrl?: string;
	host?: string;
}

/**
 * Cache for market parameters to avoid repeated API calls
 */
interface MarketParams {
	tickSize: string;
	negRisk: boolean;
	feeRateBps?: number;
}

/** * Class to handle Polymarket trading operations */
export class PolymarketTrading {
	private client: ClobClient | null = null;
	private initPromise: Promise<void> | null = null;
	private signer: Wallet | null = null;
	private config: TradingConfig;
	private marketParamsCache: Map<string, MarketParams> = new Map();

	constructor(config: TradingConfig) {
		this.config = {
			chainId: 137, // Polygon mainnet
			...config,
			// Apply detected signature type AFTER spread, so it's not overwritten by undefined
			signatureType: this.detectSignatureType(config),
		};
	}

	/**
	 * Automatically detect the signature type based on configuration
	 * - Type 2 (POLY_GNOSIS_SAFE): When funderAddress is provided (most common for browser wallets)
	 * - Type 1 (POLY_PROXY): For Magic/Email login (legacy)
	 * - Type 0 (EOA): Direct wallet usage (no proxy)
	 */
	private detectSignatureType(config: TradingConfig): number {
		// If explicitly provided, use it
		if (config.signatureType !== undefined) {
			return config.signatureType;
		}

		// Auto-detect based on funderAddress presence
		if (config.funderAddress) {
			// Most browser wallet users have Gnosis Safe proxies
			// Type 2 is the most common for Polymarket proxy wallets
			return 2; // POLY_GNOSIS_SAFE
		}

		// Default to EOA (direct wallet)
		return 0;
	}

	/**
	 * Initialize the CLOB client with credentials.
	 * Uses the v2 SDK (post-April-2026 migration). The constructor takes an options
	 * object with `chain` (not `chainId`), and createOrDeriveApiKey is now a single call.
	 */
	async initialize(): Promise<void> {
		if (this.client) return;
		const cfg = getConfig(this.config);
		// Use StaticJsonRpcProvider to skip network auto-detection.
		const provider = new providers.StaticJsonRpcProvider(
			cfg.rpcUrl,
			cfg.chainId,
		);
		const ethersSigner = new Wallet(this.config.privateKey, provider);
		this.signer = ethersSigner;
		const clientOptions = {
			host: cfg.host,
			chain: cfg.chainId,
			signer: ethersSigner,
			signatureType: cfg.signatureType,
			funderAddress: cfg.funderAddress,
		};

		// The SDK helper intentionally suppresses create-key errors before deriving,
		// but it can also return empty credentials after a transient CLOB failure.
		const bootstrapClient = new ClobClient(clientOptions);
		let apiCreds = await bootstrapClient.createOrDeriveApiKey();
		if (!apiCreds.key || !apiCreds.secret || !apiCreds.passphrase) {
			apiCreds = await new ClobClient({
				...clientOptions,
				throwOnError: true,
			}).deriveApiKey();
		}
		if (!apiCreds.key || !apiCreds.secret || !apiCreds.passphrase) {
			throw new Error("CLOB returned incomplete API credentials");
		}

		// Strict error handling prevents API error payloads from masquerading as
		// successful method results.
		this.client = new ClobClient({
			...clientOptions,
			creds: apiCreds,
			throwOnError: true,
		});

		log("Polymarket trading client initialized (v2 SDK)");
		log(`  - Signer: ${await ethersSigner.getAddress()}`);
		log(`  - Signature Type: ${cfg.signatureType}`);
		if (cfg.funderAddress) {
			log(`  - Funder/Proxy: ${cfg.funderAddress}`);
		}
	}

	/**
	 * Ensures the client is initialized (lazy-init on first use).
	 * Safe to call multiple times; concurrent calls share the same promise.
	 */
	private async ensureInitialized(): Promise<void> {
		if (this.client) return;

		if (!this.initPromise) {
			this.initPromise = this.initialize().catch((err) => {
				// Reset so future attempts can retry after a failure
				this.initPromise = null;
				throw err;
			});
		}

		await this.initPromise;
	}

	/** Returns the initialized client or throws if not ready (should be called after ensureInitialized). */
	private getClient(): ClobClient {
		if (!this.client) {
			throw new Error("Client not initialized");
		}
		return this.client;
	}

	/** Returns the signer or throws if not ready (should be set during initialize). */
	private getSigner(): Wallet {
		if (!this.signer) {
			throw new Error("Signer not initialized");
		}
		return this.signer;
	}

	/**
	 * Require direct EOA approvals before trading.
	 * Account-wallet approvals are managed by Polymarket and cannot be submitted
	 * by the signer EOA used for CLOB authentication.
	 */
	private async assertApprovals(): Promise<void> {
		if (this.config.funderAddress) return;

		const approvals = new PolymarketApprovals(this.getSigner());
		await approvals.assertTradingApproved();
	}

	/**
	 * Get market parameters (tickSize, negRisk, feeRateBps) for a token.
	 * Results are cached to avoid repeated API calls.
	 */
	private async getMarketParams(tokenId: string): Promise<MarketParams> {
		// Check cache first
		const cached = this.marketParamsCache.get(tokenId);
		if (cached) {
			return cached;
		}

		const client = this.getClient();

		// Fetch market parameters in parallel
		const [tickSize, negRisk, feeRateBps] = await Promise.all([
			client.getTickSize(tokenId),
			client.getNegRisk(tokenId),
			client.getFeeRateBps(tokenId).catch(() => 0), // Fee rate might not be available for all markets
		]);

		const params: MarketParams = {
			tickSize,
			negRisk,
			feeRateBps,
		};

		// Cache the results
		this.marketParamsCache.set(tokenId, params);

		return params;
	}

	private async getBuyCollateralBalance(
		side: Side,
	): Promise<number | undefined> {
		if (side !== Side.BUY) return undefined;

		const { balance } = await this.getClient().getBalanceAllowance({
			asset_type: AssetType.COLLATERAL,
		});
		return Number(utils.formatUnits(balance, 6));
	}

	/**
	 * Clear the market parameters cache (useful if market settings change)
	 */
	clearMarketCache(tokenId?: string): void {
		if (tokenId) {
			this.marketParamsCache.delete(tokenId);
		} else {
			this.marketParamsCache.clear();
		}
	}

	/**
	 * Place a new order with automatic market parameter detection
	 */
	async placeOrder(args: {
		tokenId: string;
		price: number;
		size: number;
		side: "BUY" | "SELL";
		orderType?: "GTC" | "GTD";
		expiration?: number;
		// Optional overrides (if you know the market params)
		tickSize?: string;
		negRisk?: boolean;
	}): Promise<unknown> {
		await this.ensureInitialized();
		await this.assertApprovals();

		const side: Side = args.side === "BUY" ? Side.BUY : Side.SELL;
		const orderTypeStr = args.orderType || "GTC";
		const orderType: OrderType.GTC | OrderType.GTD =
			orderTypeStr === "GTD" ? OrderType.GTD : OrderType.GTC;

		const marketParams = await this.getMarketParams(args.tokenId);
		const userCollateralBalance = await this.getBuyCollateralBalance(side);

		const userOrder: UserOrderV2 = {
			tokenID: args.tokenId,
			price: args.price,
			size: args.size,
			side,
			...(args.expiration !== undefined && { expiration: args.expiration }),
			...(userCollateralBalance !== undefined && {
				userUSDCBalance: userCollateralBalance,
			}),
		};

		const client = this.getClient();

		log(`Placing ${args.side} order:`);
		log(`   Token: ${args.tokenId}`);
		log(`   Price: ${args.price}`);
		log(`   Size: ${args.size}`);
		log(
			`   Market: negRisk=${marketParams.negRisk}, tickSize=${marketParams.tickSize}`,
		);

		return client.createAndPostOrder(
			userOrder,
			{
				tickSize: (args.tickSize ?? marketParams.tickSize) as TickSize,
				negRisk: args.negRisk ?? marketParams.negRisk,
			},
			orderType,
		);
	}

	/**
	 * Place a market order (FOK or FAK) with automatic market parameter detection
	 */
	async placeMarketOrder(args: {
		tokenId: string;
		amount: number;
		side: "BUY" | "SELL";
		orderType?: "FOK" | "FAK";
		// Optional overrides
		tickSize?: string;
		negRisk?: boolean;
	}): Promise<unknown> {
		await this.ensureInitialized();
		await this.assertApprovals();

		const side: Side = args.side === "BUY" ? Side.BUY : Side.SELL;
		const orderTypeStr = args.orderType || "FOK";
		const orderType: OrderType.FOK | OrderType.FAK =
			orderTypeStr === "FAK" ? OrderType.FAK : OrderType.FOK;

		const marketParams = await this.getMarketParams(args.tokenId);
		const userCollateralBalance = await this.getBuyCollateralBalance(side);

		const userMarketOrder: UserMarketOrderV2 = {
			tokenID: args.tokenId,
			amount: args.amount,
			side,
			...(userCollateralBalance !== undefined && {
				userUSDCBalance: userCollateralBalance,
			}),
		};

		const client = this.getClient();

		log(`Placing ${args.side} market order:`);
		log(`   Token: ${args.tokenId}`);
		log(`   Amount: ${args.amount}`);
		log(
			`   Market: negRisk=${marketParams.negRisk}, tickSize=${marketParams.tickSize}`,
		);

		return client.createAndPostMarketOrder(
			userMarketOrder,
			{
				tickSize: (args.tickSize ?? marketParams.tickSize) as TickSize,
				negRisk: args.negRisk ?? marketParams.negRisk,
			},
			orderType,
		);
	}

	/**
	 * Get market information for a token
	 */
	async getMarketInfo(tokenId: string): Promise<MarketParams> {
		await this.ensureInitialized();
		return this.getMarketParams(tokenId);
	}

	/**
	 * Get all open orders
	 */
	async getOpenOrders(params?: OpenOrderParams): Promise<unknown> {
		await this.ensureInitialized();
		const client = this.getClient();
		return client.getOpenOrders(params);
	}

	/**
	 * Get a specific order by ID
	 */
	async getOrder(orderId: string): Promise<unknown> {
		await this.ensureInitialized();
		const client = this.getClient();
		return client.getOrder(orderId);
	}

	/**
	 * Cancel a specific order by ID
	 */
	async cancelOrder(orderId: string): Promise<unknown> {
		await this.ensureInitialized();
		await this.assertApprovals();
		const client = this.getClient();
		return client.cancelOrder({ orderID: orderId });
	}

	/**
	 * Cancel multiple orders by their IDs
	 */
	async cancelOrders(orderIds: string[]): Promise<unknown> {
		await this.ensureInitialized();
		await this.assertApprovals();
		const client = this.getClient();
		return client.cancelOrders(orderIds);
	}

	/**
	 * Cancel all open orders
	 */
	async cancelAllOrders(): Promise<unknown> {
		await this.ensureInitialized();
		await this.assertApprovals();
		const client = this.getClient();
		return client.cancelAll();
	}

	/**
	 * Cancel all orders for a specific market
	 */
	async cancelMarketOrders(tokenId: string): Promise<unknown> {
		await this.ensureInitialized();
		await this.assertApprovals();
		const client = this.getClient();
		return client.cancelMarketOrders({ asset_id: tokenId });
	}

	/**
	 * Get trade history
	 */
	async getTradeHistory(params?: TradeParams): Promise<unknown> {
		await this.ensureInitialized();
		const client = this.getClient();
		return client.getTrades(params);
	}

	/**
	 * Get balance and allowance information
	 */
	async getBalanceAllowance(params?: BalanceAllowanceParams): Promise<unknown> {
		await this.ensureInitialized();
		const client = this.getClient();
		return client.getBalanceAllowance(params);
	}

	/**
	 * Update balance and allowance
	 */
	async updateBalanceAllowance(params?: BalanceAllowanceParams): Promise<void> {
		await this.ensureInitialized();
		const client = this.getClient();
		return client.updateBalanceAllowance(params);
	}

	/**
	 * Get orderbook for a token
	 */
	async getOrderbook(tokenId: string): Promise<unknown> {
		await this.ensureInitialized();
		const client = this.getClient();
		return client.getOrderBook(tokenId);
	}

	/**
	 * Get current price for a token
	 */
	async getPrice(tokenId: string, side: "BUY" | "SELL"): Promise<unknown> {
		await this.ensureInitialized();
		const client = this.getClient();
		return client.getPrice(tokenId, side);
	}

	/**
	 * Get midpoint price for a token
	 */
	async getMidpoint(tokenId: string): Promise<unknown> {
		await this.ensureInitialized();
		const client = this.getClient();
		return client.getMidpoint(tokenId);
	}

	/**
	 * Get server time
	 */
	async getServerTime(): Promise<number> {
		await this.ensureInitialized();
		const client = this.getClient();
		return client.getServerTime();
	}

	/**
	 * Get the signer address (EOA address)
	 */
	async getSignerAddress(): Promise<string> {
		await this.ensureInitialized();
		return this.getSigner().getAddress();
	}

	/**
	 * Get the funder address (proxy wallet address, if configured)
	 */
	getFunderAddress(): string | undefined {
		return this.config.funderAddress;
	}

	/**
	 * Get the current signature type
	 */
	getSignatureType(): number {
		return this.config.signatureType ?? 0;
	}
}

// Singleton instance for trading
let tradingInstance: PolymarketTrading | null = null;

/** * Get or create the trading instance */
export function getTradingInstance(): PolymarketTrading {
	if (!tradingInstance) {
		const cfg = getConfig();
		if (!cfg.privateKey) {
			throw new Error(
				"POLYMARKET_PRIVATE_KEY environment variable is required for trading operations",
			);
		}
		tradingInstance = new PolymarketTrading({
			privateKey: cfg.privateKey,
			chainId: cfg.chainId,
			signatureType: cfg.signatureType,
			funderAddress: cfg.funderAddress,
			rpcUrl: cfg.rpcUrl,
			host: cfg.host,
		});
	}
	return tradingInstance;
}

// Lazy proxy facade for easy consumption without triggering env checks at import time
// Usage: await tradeApi.getOrder("...")
export const tradeApi: PolymarketTrading = new Proxy({} as PolymarketTrading, {
	get(_target, prop, _receiver) {
		const instance = getTradingInstance() as unknown as Record<
			string | symbol,
			unknown
		>;
		const value = instance[prop as keyof PolymarketTrading] as unknown;
		if (typeof value === "function") {
			return value.bind(instance);
		}
		return value;
	},
});
