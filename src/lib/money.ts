export function currencyDigits(currency: string): number {
	try {
		return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
			.maximumFractionDigits ?? 2;
	} catch {
		return 2;
	}
}

/** "377.05" + SGD -> 37705 */
export function toMinor(amount: string | number | null | undefined, currency: string): number | null {
	if (amount === null || amount === undefined || amount === '') return null;
	const n = typeof amount === 'number' ? amount : Number(String(amount).replace(/[, ]/g, ''));
	if (!Number.isFinite(n)) return null;
	return Math.round(n * 10 ** currencyDigits(currency));
}

/** 37705 + SGD -> "377.05" */
export function fromMinor(minor: number | null | undefined, currency: string): string {
	if (minor === null || minor === undefined) return '';
	const digits = currencyDigits(currency);
	return (minor / 10 ** digits).toFixed(digits);
}

/** 37705 + SGD -> "377.05 SGD" (grouped) */
export function formatMoney(minor: number | null | undefined, currency: string | null | undefined): string {
	if (minor === null || minor === undefined || !currency) return '';
	const digits = currencyDigits(currency);
	const value = (minor / 10 ** digits).toLocaleString('en', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
	return `${value} ${currency}`;
}

export function sumByCurrency(rows: { priceMinor: number | null; currency: string | null }[]) {
	const totals: Record<string, number> = {};
	for (const r of rows) {
		if (r.priceMinor === null || !r.currency) continue;
		totals[r.currency] = (totals[r.currency] ?? 0) + r.priceMinor;
	}
	return totals;
}
