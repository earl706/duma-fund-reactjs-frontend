import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ShoppingBag } from 'lucide-react';

import { cn, formatCost } from '../../lib/format';

export const TYPE_ICON = {
	expense: { Icon: ShoppingBag, wrap: 'bg-accent/15 text-accent' },
	income: { Icon: ArrowDownLeft, wrap: 'bg-success/15 text-success' },
	transfer_in: { Icon: ArrowDownLeft, wrap: 'bg-primary/15 text-primary' },
	transfer_out: { Icon: ArrowUpRight, wrap: 'bg-warning/15 text-warning' },
	transfer: { Icon: ArrowLeftRight, wrap: 'bg-surface-2 text-muted' }
};

/** One-row wallet move: transfer_out with a destination source. */
export function isInternalTransfer(row) {
	return row?.type === 'transfer_out' && row?.to_source != null;
}

function internalFee(row) {
	const fee = Number(row?.fee);
	return Number.isFinite(fee) && fee > 0 ? fee : 0;
}

/** Plain-text fallback: principal, or `amount-fee` when fee > 0. */
export function formatInternalTransferAmount(row) {
	const principal = formatCost(row?.amount);
	if (principal === '—') return principal;
	const fee = internalFee(row);
	if (fee <= 0) return principal;
	const feeLabel = formatCost(fee);
	if (feeLabel === '—') return principal;
	return `${principal}-${feeLabel}`;
}

export function formatSignedAmount(amount, type, row) {
	if (isInternalTransfer(row)) return formatInternalTransferAmount(row);
	const formatted = formatCost(amount);
	if (formatted === '—') return formatted;
	const inflow = type === 'income' || type === 'transfer_in';
	return `${inflow ? '+' : '−'}${formatted}`;
}

export function amountToneClass(type, row) {
	if (isInternalTransfer(row)) return 'text-muted';
	if (type === 'income' || type === 'transfer_in') return 'text-success';
	if (type === 'expense' || type === 'transfer_out') return 'text-danger';
	return 'text-fg';
}

/**
 * Ledger amount with dual tone for internal moves:
 * grey principal always; red `-fee` only when fee > 0.
 */
export function LedgerAmount({ amount, type, row, className, bold = false }) {
	const weight = bold ? 'font-bold' : 'font-semibold';
	if (isInternalTransfer(row)) {
		const principal = formatCost(row.amount);
		const fee = internalFee(row);
		const feeLabel = fee > 0 ? formatCost(fee) : null;
		return (
			<span className={cn('tabular-nums', weight, className)}>
				<span className="text-muted">{principal}</span>
				{feeLabel && feeLabel !== '—' ? <span className="text-danger">-{feeLabel}</span> : null}
			</span>
		);
	}
	return (
		<span className={cn('tabular-nums', weight, amountToneClass(type, row), className)}>
			{formatSignedAmount(amount, type, row)}
		</span>
	);
}

export function TypeGlyph({ type, size = 18, className }) {
	const meta = TYPE_ICON[type] || { Icon: ArrowLeftRight, wrap: 'bg-surface-2 text-muted' };
	const Icon = meta.Icon;
	return (
		<span
			className={cn(
				'flex shrink-0 items-center justify-center rounded-full',
				meta.wrap,
				className || 'h-11 w-11'
			)}
		>
			<Icon size={size} strokeWidth={2.1} />
		</span>
	);
}
