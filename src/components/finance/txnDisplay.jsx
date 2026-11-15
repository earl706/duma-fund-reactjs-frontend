import {
	ArrowDownLeft,
	ArrowLeftRight,
	ArrowUpRight,
	CircleDashed,
	ScanLine,
	ShoppingBag
} from 'lucide-react';

import { cn, costParts, formatCost, formatCostFull } from '../../lib/format';
import { Tooltip } from '../ui/Tooltip';

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

/** Compact from 1k when fee is shown so principal−fee fits Amount cells. */
function formatMovePart(value) {
	return formatCost(value, { minCompact: 1000 });
}

/** Plain-text fallback: principal, or `amount-fee` when fee > 0. */
export function formatInternalTransferAmount(row) {
	const fee = internalFee(row);
	const principal = fee > 0 ? formatMovePart(row?.amount) : formatCost(row?.amount);
	if (principal === '—') return principal;
	if (fee <= 0) return principal;
	const feeLabel = formatMovePart(fee);
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

function signedFullAmount(amount, type) {
	const full = formatCostFull(amount);
	if (full === '—') return full;
	const inflow = type === 'income' || type === 'transfer_in';
	return `${inflow ? '+' : '−'}${full}`;
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
 * Compact values get a styled full-amount tooltip.
 */
export function LedgerAmount({ amount, type, row, className, bold = false }) {
	const weight = bold ? 'font-bold' : 'font-semibold';
	if (isInternalTransfer(row)) {
		const fee = internalFee(row);
		const principalParts = costParts(row.amount, { minCompact: fee > 0 ? 1000 : 10000 });
		const feeParts = fee > 0 ? costParts(fee, { minCompact: 1000 }) : null;
		const tip =
			fee > 0
				? `${formatCostFull(row.amount)}-${formatCostFull(fee)}`
				: principalParts.compact
					? formatCostFull(row.amount)
					: null;
		const body = (
			<span
				className={cn(
					'inline-flex max-w-full items-baseline whitespace-nowrap tabular-nums',
					weight,
					className
				)}
			>
				<span className="text-muted">{principalParts.display}</span>
				{feeParts && feeParts.display !== '—' ? (
					<span className="text-danger">-{feeParts.display}</span>
				) : null}
			</span>
		);
		if (!tip) return body;
		return <Tooltip content={tip}>{body}</Tooltip>;
	}
	const display = formatSignedAmount(amount, type, row);
	const tip = costParts(amount).compact && display !== '—' ? signedFullAmount(amount, type) : null;
	const body = (
		<span className={cn('tabular-nums', weight, amountToneClass(type, row), className)}>
			{display}
		</span>
	);
	if (!tip) return body;
	return <Tooltip content={tip}>{body}</Tooltip>;
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

/**
 * Non-layout corner chip: partial wins over scanned/full; never both.
 */
export function TxnCornerBadges({ row, className }) {
	const partial = Boolean(row?.is_partial);
	const scanned = Boolean(row?.receipt_image);
	if (!partial && !scanned) return null;
	if (partial) {
		return (
			<span
				className={cn(
					'bg-warning/15 text-warning pointer-events-none absolute top-2 right-2 z-[1] inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm',
					className
				)}
				title="Partial receipt"
				aria-label="Partial receipt"
			>
				<CircleDashed size={9} strokeWidth={2.5} aria-hidden />
			</span>
		);
	}
	return (
		<span
			className={cn(
				'bg-primary/12 text-primary pointer-events-none absolute top-2 right-2 z-[1] inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm',
				className
			)}
			title="Scanned receipt"
			aria-label="Scanned receipt"
		>
			<ScanLine size={9} strokeWidth={2.5} aria-hidden />
		</span>
	);
}

/** Compact partial marker for mobile list glyphs (no layout shift). */
export function PartialReceiptMark({ className }) {
	return (
		<span
			className={cn(
				'bg-warning/15 text-warning pointer-events-none absolute -top-0.5 -right-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm',
				className
			)}
			title="Partial receipt"
			aria-label="Partial receipt"
		>
			<CircleDashed size={9} strokeWidth={2.5} aria-hidden />
		</span>
	);
}
