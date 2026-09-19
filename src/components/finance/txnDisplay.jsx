import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ShoppingBag } from 'lucide-react';

import { cn, formatCost } from '../../lib/format';

export const TYPE_ICON = {
	expense: { Icon: ShoppingBag, wrap: 'bg-accent/15 text-accent' },
	income: { Icon: ArrowDownLeft, wrap: 'bg-success/15 text-success' },
	transfer_in: { Icon: ArrowDownLeft, wrap: 'bg-primary/15 text-primary' },
	transfer_out: { Icon: ArrowUpRight, wrap: 'bg-warning/15 text-warning' }
};

export function formatSignedAmount(amount, type) {
	const formatted = formatCost(amount);
	if (formatted === '—') return formatted;
	const inflow = type === 'income' || type === 'transfer_in';
	return `${inflow ? '+' : '−'}${formatted}`;
}

export function amountToneClass(type) {
	if (type === 'income' || type === 'transfer_in') return 'text-success';
	if (type === 'expense' || type === 'transfer_out') return 'text-danger';
	return 'text-fg';
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
