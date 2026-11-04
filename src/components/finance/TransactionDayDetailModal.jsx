import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { cn, formatCost, formatDate } from '../../lib/format';
import { Button, EmptyState, Modal } from '../ui';
import { amountToneClass, formatSignedAmount } from './txnDisplay';
import { dayTotals, hourSeries } from './transactionCalendar';

function tooltipStyle() {
	return {
		background: 'var(--surface)',
		border: '1px solid var(--line)',
		borderRadius: 8,
		color: 'var(--fg)',
		fontSize: 12
	};
}

function formatNet(value) {
	const amount = Number(value);
	if (!Number.isFinite(amount)) return '—';
	const formatted = formatCost(Math.abs(amount));
	if (formatted === '—') return formatted;
	if (amount > 0) return `+${formatted}`;
	if (amount < 0) return `−${formatted}`;
	return formatted;
}

function netToneClass(value) {
	const amount = Number(value);
	if (amount > 0) return 'text-success';
	if (amount < 0) return 'text-danger';
	return 'text-fg';
}

function HourlyFlowChart({ points }) {
	const hasData = points.some((p) => p.moneyIn > 0 || p.moneyOut > 0);
	return (
		<div className="relative h-full min-h-0 w-full overflow-hidden">
			<div className="absolute inset-0">
				{!hasData ? (
					<p className="text-muted flex h-full min-h-0 items-center justify-center text-sm">
						No timed activity for this day.
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
									interval={2}
									minTickGap={4}
								/>
								<YAxis hide />
								<Tooltip
									cursor={{ fill: 'var(--surface-2)', fillOpacity: 0.6 }}
									contentStyle={tooltipStyle()}
									formatter={(value, name) => [formatCost(value), name]}
									labelFormatter={(label) => `${label}:00`}
								/>
								<Bar
									dataKey="moneyIn"
									name="Money in"
									stackId="flow"
									fill="var(--success)"
									maxBarSize={18}
								/>
								<Bar
									dataKey="moneyOut"
									name="Money out"
									stackId="flow"
									fill="var(--danger)"
									maxBarSize={18}
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
				)}
			</div>
		</div>
	);
}

/** Shared day summary: totals, fixed-height hourly chart, full txn list. */
export function TransactionDayDetailBody({ dateISO, transactions, onNavigate }) {
	const txns = transactions || [];
	const totals = dayTotals(txns);
	const points = hourSeries(txns);
	const label = dateISO ? formatDate(dateISO) : '—';

	return (
		<div className="flex flex-col gap-4">
			<div className="border-line bg-surface flex min-h-0 flex-col overflow-hidden rounded-lg border p-4">
				<div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
					<div>
						<p className="text-muted text-xs font-medium tracking-wide uppercase">Net</p>
						<p className={cn('text-xl font-semibold tabular-nums', netToneClass(totals.net))}>
							{formatNet(totals.net)}
						</p>
						<p className="text-muted mt-1 text-xs">
							<span className="text-success">In {formatCost(totals.moneyIn)}</span>
							<span className="mx-1.5">·</span>
							<span className="text-danger">Out {formatCost(totals.moneyOut)}</span>
						</p>
					</div>
					<p className="text-muted pt-1 text-sm font-medium">{label}</p>
				</div>
				<div className="mt-1 h-56 min-h-[14rem] shrink-0">
					<HourlyFlowChart points={points} />
				</div>
			</div>

			<div>
				<p className="text-fg mb-2 text-sm font-semibold">
					Transactions{txns.length ? ` (${txns.length})` : ''}
				</p>
				{!txns.length ? (
					<p className="text-muted text-sm">No transactions on this day.</p>
				) : (
					<ul className="divide-line border-line divide-y overflow-hidden rounded-lg border">
						{txns.map((txn) => (
							<li key={txn.id}>
								<Link
									to={`/transactions/${txn.id}`}
									className="hover:bg-surface-2 flex items-center justify-between gap-3 px-3 py-2.5"
									onClick={() => onNavigate?.()}
								>
									<span className="text-fg min-w-0 truncate text-sm font-medium">
										{txn.title || 'Untitled'}
									</span>
									<span
										className={cn(
											'shrink-0 text-sm font-semibold tabular-nums',
											amountToneClass(txn.type)
										)}
									>
										{formatSignedAmount(txn.amount, txn.type)}
									</span>
								</Link>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

export function TransactionDayDetailModal({ open, onClose, dateISO, transactions }) {
	return (
		<Modal
			open={open}
			onClose={onClose}
			title={dateISO ? formatDate(dateISO) : 'Day'}
			size="lg"
			footer={
				<Button variant="secondary" onClick={onClose}>
					Close
				</Button>
			}
		>
			{open && !dateISO ? (
				<EmptyState title="No day selected" />
			) : (
				<TransactionDayDetailBody
					dateISO={dateISO}
					transactions={transactions}
					onNavigate={onClose}
				/>
			)}
		</Modal>
	);
}
