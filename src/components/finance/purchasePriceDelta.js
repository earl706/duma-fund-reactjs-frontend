import { formatCost } from '../../lib/format';

/** Baseline for last-price delta: previous buy, average, or first buy. */
export function resolveCompareBaseline(row, mode = 'previous') {
	if (!row) return null;
	if (mode === 'average') return row.avg_price ?? null;
	if (mode === 'first') return row.first_price ?? null;
	return row.prev_price ?? null;
}

/**
 * Signed price change of last_price vs baseline.
 * Increase = danger (costs more); decrease = success.
 */
export function priceDeltaParts(row, mode = 'previous') {
	if ((row?.purchase_count ?? 0) < 2) return null;
	const last = Number(row?.last_price);
	const baseline = Number(resolveCompareBaseline(row, mode));
	if (!Number.isFinite(last) || !Number.isFinite(baseline)) return null;
	const delta = last - baseline;
	if (Math.abs(delta) < 0.005) {
		return { text: '±0.00', className: 'text-muted', delta: 0 };
	}
	const up = delta > 0;
	return {
		text: `${up ? '+' : '−'}${formatCost(Math.abs(delta))}`,
		className: up ? 'text-danger' : 'text-success',
		delta
	};
}
