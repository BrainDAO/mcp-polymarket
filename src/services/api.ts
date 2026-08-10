import { GammaSDK } from "@jsr/hk__polymarket";
import type { OrderBookSummary } from "@polymarket/clob-client-v2";
import { type BaseConfig, getConfig } from "./config.js";

export type PolymarketApiConfig = Partial<BaseConfig>;

export class PolymarketAPI {
	private gamma: GammaSDK;
	private readonly cfg: BaseConfig;

	constructor(config: PolymarketApiConfig = {}) {
		this.cfg = getConfig(config);
		this.gamma = new GammaSDK();
	}

	/**
	 * Retrieves market details by its slug identifier.
	 */
	async getMarketBySlug(slug: string) {
		return this.gamma.getMarketBySlug(slug);
	}

	/**
	 * Retrieves event details by its slug identifier.
	 */
	async getEventBySlug(slug: string) {
		return this.gamma.getEventBySlug(slug);
	}

	/**
	 * Lists active markets with pagination.
	 */
	async listActiveMarkets(limit = 20, offset = 0) {
		return this.gamma.getActiveMarkets({ limit, offset, closed: false });
	}

	/**
	 * Searches markets, events, and profiles using a query string.
	 */
	async searchMarkets(query: string) {
		return this.gamma.search({ q: query });
	}

	/**
	 * Retrieves markets filtered by tag ID.
	 */
	async getMarketsByTag(tagId: string, limit = 20, closed = false) {
		const parsedTagId = Number(tagId);
		if (Number.isNaN(parsedTagId)) {
			throw new Error("tag_id must be a number");
		}
		return this.gamma.getMarkets({ tag_id: parsedTagId, limit, closed });
	}

	/**
	 * Retrieves all available tags.
	 */
	async getAllTags() {
		return this.gamma.getTags({});
	}

	/**
	 * Retrieves the order book for a specific market token.
	 * The CLOB /book endpoint is public, so this works without credentials.
	 */
	async getOrderBook(tokenId: string): Promise<OrderBookSummary> {
		const url = `${this.cfg.host}/book?token_id=${encodeURIComponent(tokenId)}`;
		const res = await fetch(url);
		if (!res.ok) {
			throw new Error(
				`Failed to fetch order book: ${res.status} ${res.statusText}`,
			);
		}
		return (await res.json()) as OrderBookSummary;
	}
}

// Default instance using environment variables
export const api = new PolymarketAPI();
