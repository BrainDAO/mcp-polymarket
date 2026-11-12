/**
 * Server-side spending limits for order placement.
 *
 * MCP hosts can be configured to auto-approve tool calls, so the agent's
 * requested size can't be the only thing standing between a prompt and the
 * wallet. These limits are enforced here, next to the private key, regardless
 * of which host or agent is calling.
 *
 * All values are pUSD notional:
 * - limit orders: price * size
 * - market BUY: amount (pUSD to spend)
 * - market SELL: shares * best bid (upper bound on proceeds)
 */

export type OrderLimits = {
	/** Max pUSD notional for a single order. */
	maxOrderUsd?: number;
	/** Max cumulative pUSD notional across all orders for this server process. */
	maxSessionUsd?: number;
};

export class OrderLimitError extends Error {
	code = "ORDER_LIMIT_EXCEEDED" as const;

	constructor(
		message: string,
		readonly details: {
			limit: "maxOrderUsd" | "maxSessionUsd";
			limitUsd: number;
			orderUsd: number;
			sessionCommittedUsd: number;
		},
	) {
		super(message);
		this.name = "OrderLimitError";
	}

	toJSON() {
		return {
			rejected: true,
			code: this.code,
			message: this.message,
			details: this.details,
		};
	}
}

const ENV_VARS = {
	maxOrderUsd: "POLYMARKET_MAX_ORDER_USD",
	maxSessionUsd: "POLYMARKET_MAX_SESSION_USD",
} as const;

function parseLimit(name: string, raw: string | undefined): number | undefined {
	if (raw === undefined || raw.trim() === "") return undefined;
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a positive number of pUSD, got "${raw}"`);
	}
	return value;
}

/** Reads limits from the environment. Throws on malformed values so a typo can't silently disable a limit. */
export function getOrderLimitsFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): OrderLimits {
	return {
		maxOrderUsd: parseLimit(ENV_VARS.maxOrderUsd, env[ENV_VARS.maxOrderUsd]),
		maxSessionUsd: parseLimit(
			ENV_VARS.maxSessionUsd,
			env[ENV_VARS.maxSessionUsd],
		),
	};
}

const fmt = (usd: number) => `${Number(usd.toFixed(6))} pUSD`;

export class OrderLimitGuard {
	private committedUsd = 0;

	constructor(readonly limits: OrderLimits) {}

	get sessionCommittedUsd(): number {
		return this.committedUsd;
	}

	/**
	 * Checks an order against the limits and reserves its notional against the
	 * session budget. Reservation is synchronous, so concurrent tool calls can't
	 * both pass the session check. Call the returned `release` if the order was
	 * not accepted by the exchange.
	 */
	reserve(orderUsd: number): { release: () => void } {
		if (!Number.isFinite(orderUsd) || orderUsd < 0) {
			throw new Error(`Invalid order notional: ${orderUsd}`);
		}

		const { maxOrderUsd, maxSessionUsd } = this.limits;

		if (maxOrderUsd !== undefined && orderUsd > maxOrderUsd) {
			throw new OrderLimitError(
				`Order rejected: notional ${fmt(orderUsd)} exceeds the per-order limit of ${fmt(maxOrderUsd)} (${ENV_VARS.maxOrderUsd}).`,
				{
					limit: "maxOrderUsd",
					limitUsd: maxOrderUsd,
					orderUsd,
					sessionCommittedUsd: this.committedUsd,
				},
			);
		}

		if (
			maxSessionUsd !== undefined &&
			this.committedUsd + orderUsd > maxSessionUsd
		) {
			const remaining = Math.max(0, maxSessionUsd - this.committedUsd);
			throw new OrderLimitError(
				`Order rejected: notional ${fmt(orderUsd)} would exceed the session limit of ${fmt(maxSessionUsd)} (${ENV_VARS.maxSessionUsd}); ${fmt(remaining)} remaining. Restart the server to reset.`,
				{
					limit: "maxSessionUsd",
					limitUsd: maxSessionUsd,
					orderUsd,
					sessionCommittedUsd: this.committedUsd,
				},
			);
		}

		this.committedUsd += orderUsd;
		let released = false;
		return {
			release: () => {
				if (released) return;
				released = true;
				this.committedUsd -= orderUsd;
			},
		};
	}

	describe(): string {
		const { maxOrderUsd, maxSessionUsd } = this.limits;
		if (maxOrderUsd === undefined && maxSessionUsd === undefined) {
			return `No order limits set. Set ${ENV_VARS.maxOrderUsd} and/or ${ENV_VARS.maxSessionUsd} to cap what an auto-approving host can spend.`;
		}
		return [
			maxOrderUsd !== undefined && `per-order ${fmt(maxOrderUsd)}`,
			maxSessionUsd !== undefined && `per-session ${fmt(maxSessionUsd)}`,
		]
			.filter(Boolean)
			.join(", ");
	}
}
