import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format, parseISO, startOfMonth, startOfWeek } from 'date-fns';

import { cn, formatCost, formatDateShort } from '../../lib/format';
import { usePurchaseHistory } from '../../lib/purchases';
import { Button, EmptyState, LoadingSwap, Modal } from '../ui';
import { priceDeltaParts } from './purchasePriceDelta';

const GRAINS = [
	{ value: 'daily', label: 'D', title: 'Each purchase' },
	{ value: 'weekly', label: 'W', title: 'Weekly average' },
	{ value: 'monthly', label: 'M', title: 'Monthly average' }
];

const COMPARE_MODES = [
	{ value: 'previous', label: 'Prev', title: 'Vs previous purchase' },
	{ value: 'average', label: 'Avg', title: 'Vs average price' },
	{ value: 'first', label: 'First', title: 'Vs first purchase' }
];

function tooltipStyle() {
	return {
		background: 'var(--surface)',
		border: '1px solid var(--line)',
		borderRadius: 8,
		color: 'var(--fg)',
		fontSize: 12
	};
}

function GrainToggle({ grain, onGrain }) {
	return (
		<div className="border-line bg-surface-2 inline-flex rounded-md border p-0.5">
			{GRAINS.map((g) => (
				<Button
					key={g.value}
					type="button"
					size="sm"
					variant={grain === g.value ? 'primary' : 'ghost'}
					className="h-8"
					title={g.title}
					aria-label={g.title}
					onClick={() => onGrain(g.value)}
				>
					{g.label}
				</Button>
			))}
		</div>
	);
}

function CompareToggle({ mode, onMode }) {
	return (
		<div className="border-line bg-surface-2 inline-flex rounded-md border p-0.5">
			{COMPARE_MODES.map((g) => (
				<Button
					key={g.value}
					type="button"
					size="sm"
					variant={mode === g.value ? 'primary' : 'ghost'}
					className="h-8"
					title={g.title}
					aria-label={g.title}
					onClick={() => onMode(g.value)}
				>
					{g.label}
				</Button>
			))}
		</div>
	);
}

function binKey(dateStr, grain) {
	const date = parseISO(dateStr);
	if (grain === 'monthly') return format(startOfMonth(date), 'yyyy-MM');
	if (grain === 'weekly') return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
	return dateStr;
}

function binLabel(key, grain) {
	if (grain === 'monthly') {
		const [y, m] = key.split('-');
		return format(new Date(Number(y), Number(m) - 1, 1), 'MMM yyyy');
	}
	if (grain === 'weekly') return `W ${formatDateShort(key)}`;
	return formatDateShort(key);
}

/** Discrete purchase points; weekly/monthly average only bins that have buys. */
export function buildPriceSeries(purchases, grain = 'daily') {
	const rows = purchases ?? [];
	if (grain === 'daily') {
		return rows.map((p, index) => ({
			key: `${p.transaction_id}-${p.item_id ?? 'h'}-${index}`,
			label: formatDateShort(p.date_effective),
			price: Number(p.cost),
			date: p.date_effective,
			merchant: p.merchant
		}));
	}

	const bins = new Map();
	for (const p of rows) {
		const key = binKey(p.date_effective, grain);
		const entry = bins.get(key) || { key, sum: 0, count: 0, date: p.date_effective };
		entry.sum += Number(p.cost);
		entry.count += 1;
		entry.date = p.date_effective;
		bins.set(key, entry);
	}

	return [...bins.values()].map((b) => ({
		key: b.key,
		label: binLabel(b.key, grain),
		price: b.sum / b.count,
		date: b.date,
		merchant: null
	}));
}

function PriceChart({ points, loading }) {
	return (
		<div className="relative h-full min-h-0 w-full overflow-hidden">
			<div className="absolute inset-0">
				<LoadingSwap loading={loading} compact label="" className="h-full min-h-0">
					{!points.length ? (
						<p className="text-muted flex h-full min-h-0 items-center justify-center text-sm">
							No purchase prices yet.
						</p>
					) : (
						<div className="h-full min-h-0 w-full">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={points}
									margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
									barCategoryGap="12%"
								>
									<CartesianGrid stroke="var(--line)" strokeDasharray="3 6" vertical={false} />
									<XAxis
										dataKey="label"
										tick={{ fill: 'var(--muted)', fontSize: 10 }}
										axisLine={false}
										tickLine={false}
										interval={points.length <= 8 ? 0 : Math.ceil(points.length / 7) - 1}
										minTickGap={8}
									/>
									<YAxis hide domain={['auto', 'auto']} />
									<Tooltip
										cursor={{ fill: 'var(--surface-2)', fillOpacity: 0.6 }}
										contentStyle={tooltipStyle()}
										formatter={(value) => [formatCost(value), 'Price']}
										labelFormatter={(label, payload) => {
											const row = payload?.[0]?.payload;
											return row?.date ? `${label} · ${row.date}` : label;
										}}
									/>
									<Bar dataKey="price" name="Price" fill="var(--primary)" maxBarSize={28} />
								</BarChart>
							</ResponsiveContainer>
						</div>
					)}
				</LoadingSwap>
			</div>
		</div>
	);
}

export function PurchasePriceDetailModal({
	open,
	onClose,
	title,
	compareMode = 'previous',
	onCompareMode
}) {
	const [grain, setGrain] = useState('daily');
	const { data, isLoading, isError } = usePurchaseHistory(title, {
		enabled: open && Boolean(title)
	});

	const points = useMemo(() => buildPriceSeries(data?.purchases, grain), [data?.purchases, grain]);

	const lastPrice = data?.last_price ?? null;
	const delta = priceDeltaParts(data, compareMode);

	return (
		<Modal open={open} onClose={onClose} title={title || 'Purchase history'} size="lg">
			{isError ? (
				<EmptyState title="Could not load history" description="Try again from the list." />
			) : (
				<div className="flex flex-col gap-4">
					<div className="border-line bg-surface flex min-h-0 flex-col overflow-hidden rounded-lg border p-4">
						<div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
							<div>
								<p className="text-muted text-xs font-medium tracking-wide uppercase">Last price</p>
								<p className="text-fg flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tabular-nums">
									<span>{formatCost(lastPrice)}</span>
									{delta ? (
										<span className={cn('text-sm font-medium', delta.className)}>{delta.text}</span>
									) : null}
								</p>
							</div>
							<div className="text-muted flex flex-col items-end gap-2 pt-1 text-[11px] font-medium">
								<GrainToggle grain={grain} onGrain={setGrain} />
								{onCompareMode ? <CompareToggle mode={compareMode} onMode={onCompareMode} /> : null}
							</div>
						</div>
						<div className="mt-1 h-56 min-h-[14rem] shrink-0">
							<PriceChart points={points} loading={isLoading} />
						</div>
					</div>

					{data?.last_transaction_id ? (
						<p className="text-sm">
							<Link
								to={`/transactions/${data.last_transaction_id}`}
								className="text-primary hover:underline"
								onClick={onClose}
							>
								Open last transaction
							</Link>
						</p>
					) : null}
				</div>
			)}
		</Modal>
	);
}

export { COMPARE_MODES };
