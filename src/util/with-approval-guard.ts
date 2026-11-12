import { ApprovalRequiredError } from "../services/approvals.js";
import { OrderLimitError } from "../services/order-limits.js";

export async function withApprovalGuard(
	fn: () => Promise<unknown>,
): Promise<string> {
	try {
		const result = await fn();
		return JSON.stringify(result, null, 2);
	} catch (err) {
		if (
			err instanceof ApprovalRequiredError ||
			err instanceof OrderLimitError
		) {
			return JSON.stringify(err, null, 2);
		}
		throw err;
	}
}
