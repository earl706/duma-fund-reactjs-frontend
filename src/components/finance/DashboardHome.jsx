import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis
} from 'recharts';
import { ArrowDownLeft, ArrowUpRight, LayoutDashboard, ScanLine } from 'lucide-react';

import { cn, formatActivityDate, formatCost } from '../../lib/format';
import { Button, EmptyState, LoadingScreen } from '../ui';
import { TypeGlyph, amountToneClass, formatSignedAmount } from './txnDisplay';

const PERIODS = [
	{ value: 'day', label: 'Daily' },
	{ value: 'week', label: 'Weekly' },
	{ value: 'month', label: 'Monthly' }
];

const CATEGORY_COLORS = [
	'var(--primary)',
	'var(--accent)',
	'#c4a35a',
	'#8a8f98',
	'#a67c52',
	'#d17c83'
];

function PeriodToggle({ period, onPeriod }) {
	return (
		<div className="border-line bg-surface-2 inline-flex rounded-full border p-0.5">
			{PERIODS.map((g) => (
				<button
					key={g.value}
					type="button"
					onClick={() => onPeriod(g.value)}
					className={cn(
						'h-8 cursor-pointer rounded-full px-3 text-sm font-medium transition-colors',
						period === g.value ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg'
					)}
				>
					{g.label}
				</button>
			))}
		</div>
	);
}

function SpendChart({ points, loading }) {
	if (loading) return <LoadingScreen />;
	if (!points.length) {
		return (
			<p className="text-muted flex h-full min-h-0 items-center justify-center text-sm">
				No expense activity in this range.
			</p>
		);
	}

	return (
		<div className="h-full min-h-0 w-full">
			<ResponsiveContainer width="100%" height="100%">
				<AreaChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
					<defs>
						<linearGradient id="homeSpendFill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
							<stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid stroke="var(--line)" strokeDasharray="3 6" vertical={false} />
					<XAxis
						dataKey="label"
						tick={{ fill: 'var(--muted)', fontSize: 11 }}
						axisLine={false}
						tickLine={false}
						interval="preserveStartEnd"
					/>
					<YAxis hide />
					<Tooltip
						contentStyle={{
							background: 'var(--surface)',
							border: '1px solid var(--line)',
							borderRadius: 8,
							color: 'var(--fg)',
							fontSize: 12
						}}
						formatter={(value) => [formatCost(value), 'Expenses']}
					/>
					<Area
						type="monotone"
						dataKey="spend"
						stroke="var(--primary)"
						strokeWidth={2.2}
						fill="url(#homeSpendFill)"
						dot={false}
						activeDot={{ r: 5, fill: 'var(--primary)', stroke: 'var(--surface)', strokeWidth: 2 }}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}

function CategoryBars({ rows }) {
	if (!rows.length) {
		return (
			<p className="text-muted flex h-full items-center justify-center text-sm">
				No category spend in this period.
			</p>
		);
	}

	return (
		<ul className="flex h-full min-h-0 flex-col justify-evenly gap-2">
			{rows.map((row, index) => (
				<li key={row.id ?? row.name}>
					<div className="mb-1 flex items-baseline justify-between gap-2">
						<p className="text-fg min-w-0 truncate text-sm font-medium">{row.name}</p>
						<p className="text-fg shrink-0 text-sm font-semibold tabular-nums">
							{row.percent}% · {formatCost(row.amount)}
						</p>
					</div>
					<div className="bg-surface-2 flex h-2 overflow-hidden rounded-full">
						<div
							className="h-full rounded-full"
							style={{
								width: `${Math.max(row.percent, 2)}%`,
								background: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
							}}
						/>
					</div>
				</li>
			))}
		</ul>
	);
}

function DashboardPane({
	balance,
	income,
	expense,
	chips,
	selectedChip,
	onChip,
	recent,
	recentLoading
}) {
	return (
		<div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
			<section className="border-line bg-surface shrink-0 rounded-lg border px-4 py-4">
				<p className="text-muted text-sm font-medium">Your balance</p>
				<p className="text-fg mt-1 text-[2rem] leading-none font-semibold tracking-tight tabular-nums">
					{balance ? formatCost(balance.balance) : '—'}
				</p>
				<p className="text-muted mt-2 text-sm">
					Starting{' '}
					<span className="text-fg tabular-nums">
						{balance ? formatCost(balance.starting_balance) : '—'}
					</span>
				</p>
			</section>

			<div className="grid shrink-0 grid-cols-2 gap-3">
				<div className="border-line bg-surface rounded-lg border px-4 py-3">
					<p className="text-success flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
						<ArrowDownLeft size={14} /> Income
					</p>
					<p className="text-success mt-1 text-lg font-semibold tabular-nums">
						+{formatCost(income)}
					</p>
				</div>
				<div className="border-line bg-surface rounded-lg border px-4 py-3">
					<p className="text-danger flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
						<ArrowUpRight size={14} /> Expenses
					</p>
					<p className="text-danger mt-1 text-lg font-semibold tabular-nums">
						−{formatCost(expense)}
					</p>
				</div>
			</div>

			{chips.length > 0 && (
				<div className="flex shrink-0 flex-wrap gap-2">
					<button
						type="button"
						onClick={() => onChip(null)}
						className={cn(
							'cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
							selectedChip == null
								? 'border-primary bg-primary/12 text-primary'
								: 'border-line text-muted hover:text-fg'
						)}
					>
						All
					</button>
					{chips.map((chip) => (
						<button
							key={chip.id}
							type="button"
							onClick={() => onChip(chip.id)}
							className={cn(
								'cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
								selectedChip === chip.id
									? 'border-primary bg-primary/12 text-primary'
									: 'border-line text-muted hover:text-fg'
							)}
						>
							{chip.name}
						</button>
					))}
				</div>
			)}

			<section className="flex min-h-0 flex-1 flex-col">
				<div className="mb-1 flex shrink-0 items-baseline justify-between gap-3">
					<h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
						Latest transactions
					</h2>
					<Link to="/transactions" className="text-primary text-sm font-medium hover:underline">
						See all
					</Link>
				</div>
				{recentLoading ? (
					<LoadingScreen />
				) : recent.length === 0 ? (
					<p className="text-muted py-6 text-center text-sm">
						{selectedChip == null
							? 'No transactions yet.'
							: 'No recent transactions in this category.'}
					</p>
				) : (
					<ul className="divide-line min-h-0 flex-1 divide-y overflow-hidden">
						{recent.map((row) => (
							<li key={row.id}>
								<Link
									to={`/transactions/${row.id}`}
									className="flex cursor-pointer items-center gap-3 py-2.5"
								>
									<TypeGlyph type={row.type} />
									<div className="min-w-0 flex-1">
										<p className="text-fg truncate text-[15px] leading-tight font-medium">
											{row.title || 'Untitled'}
										</p>
										<p className="text-muted truncate text-xs leading-tight">
											{row.merchant || 'Unknown'}
											{row.date_effective ? ` · ${formatActivityDate(row.date_effective)}` : ''}
										</p>
									</div>
									<span
										className={cn(
											'shrink-0 text-[15px] font-semibold tabular-nums',
											amountToneClass(row.type)
										)}
									>
										{formatSignedAmount(row.amount, row.type)}
									</span>
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

function AnalyticsPane({
	period,
	onPeriod,
	expense,
	chartPoints,
	chartLoading,
	barRows,
	breakdownLoading,
	breakdownError
}) {
	return (
		<div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
			<div className="flex shrink-0 items-center justify-between gap-3">
				<div>
					<h2 className="text-fg text-base font-semibold">Analytics</h2>
					<p className="text-muted text-xs">Expense trend and category mix</p>
				</div>
				<PeriodToggle period={period} onPeriod={onPeriod} />
			</div>

			{breakdownError ? (
				<EmptyState
					icon={LayoutDashboard}
					title="Could not load analytics"
					description="Something went wrong while fetching spend data."
				/>
			) : breakdownLoading ? (
				<LoadingScreen />
			) : (
				<div className="grid min-h-0 flex-1 grid-rows-2 gap-3">
					<div className="border-line bg-surface flex min-h-0 flex-col rounded-lg border p-4">
						<p className="text-muted text-xs font-medium tracking-wide uppercase">Total expenses</p>
						<p className="text-fg text-xl font-semibold tabular-nums">{formatCost(expense)}</p>
						<div className="mt-1 min-h-0 flex-1">
							<SpendChart points={chartPoints} loading={chartLoading} />
						</div>
					</div>
					<div className="border-line bg-surface flex min-h-0 flex-col rounded-lg border p-4">
						<p className="text-fg mb-2 text-sm font-semibold">Breakdown</p>
						<div className="min-h-0 flex-1">
							<CategoryBars rows={barRows} />
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function PagerPane({ swiping, children }) {
	return (
		<section className="bg-bg min-h-0 snap-start snap-always overflow-hidden">
			<div className={cn('home-pager-pane h-full min-h-0', swiping && 'is-swiping')}>{children}</div>
		</section>
	);
}

function PagerDots({ page, onPage }) {
	return (
		<div className="flex shrink-0 justify-center gap-1.5 py-1">
			{[0, 1].map((i) => (
				<button
					key={i}
					type="button"
					aria-label={i === 0 ? 'Dashboard' : 'Analytics'}
					aria-current={page === i ? 'true' : undefined}
					onClick={() => onPage(i)}
					className={cn(
						'h-1.5 cursor-pointer rounded-full transition-all',
						page === i ? 'bg-primary w-4' : 'bg-line w-1.5'
					)}
				/>
			))}
		</div>
	);
}

/**
 * Phone: two snap pages (Dashboard | Analytics) with dots under the greeting.
 * Desktop: one roomier two-column page. No vertical page scroll.
 */
export function DashboardHome({
	pager = false,
	greeting,
	name,
	balance,
	period,
	onPeriod,
	rangeLabel,
	income,
	expense,
	chips,
	selectedChip,
	onChip,
	recent,
	recentLoading,
	chartPoints,
	chartLoading,
	barRows,
	breakdownLoading,
	breakdownError,
	showScan,
	onScan
}) {
	const pagerRef = useRef(null);
	const settleTimer = useRef(null);
	const [page, setPage] = useState(0);
	const [swiping, setSwiping] = useState(false);

	const pageOffset = (el) => {
		const width = el.clientWidth;
		if (!width) return 0;
		const progress = el.scrollLeft / width;
		return Math.abs(progress - Math.round(progress));
	};

	const settle = (el) => {
		const width = el.clientWidth;
		if (!width) return;
		const index = Math.min(1, Math.max(0, Math.round(el.scrollLeft / width)));
		const target = index * width;
		setPage(index);
		if (Math.abs(el.scrollLeft - target) > 2) {
			el.scrollTo({ left: target, behavior: 'smooth' });
		}
		setSwiping(false);
	};

	const goTo = (index) => {
		const el = pagerRef.current;
		if (!el) return;
		setSwiping(true);
		el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
		setPage(index);
	};

	const onPagerScroll = (e) => {
		const el = e.currentTarget;
		const width = el.clientWidth;
		if (width) setPage(Math.round(el.scrollLeft / width));
		setSwiping(pageOffset(el) > 0.03);
		clearTimeout(settleTimer.current);
		settleTimer.current = setTimeout(() => settle(el), 70);
	};

	useEffect(() => () => clearTimeout(settleTimer.current), []);

	const dash = (
		<DashboardPane
			balance={balance}
			income={income}
			expense={expense}
			chips={chips}
			selectedChip={selectedChip}
			onChip={onChip}
			recent={recent}
			recentLoading={recentLoading}
		/>
	);

	const stats = (
		<AnalyticsPane
			period={period}
			onPeriod={onPeriod}
			expense={expense}
			chartPoints={chartPoints}
			chartLoading={chartLoading}
			barRows={barRows}
			breakdownLoading={breakdownLoading}
			breakdownError={breakdownError}
		/>
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<header className="mb-1 flex shrink-0 items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="text-fg truncate text-xl leading-tight font-semibold tracking-tight">
						{greeting}, {name}
					</p>
					<p className="text-muted truncate text-xs">{rangeLabel}</p>
				</div>
				{showScan && (
					<Button variant="secondary" size="sm" className="h-8 shrink-0" onClick={onScan}>
						<ScanLine size={16} /> Scan
					</Button>
				)}
			</header>

			{pager && <PagerDots page={page} onPage={goTo} />}

			{pager ? (
				<div
					ref={pagerRef}
					onScroll={onPagerScroll}
					style={{ WebkitOverflowScrolling: 'touch' }}
					className="scrollbar-none grid min-h-0 w-full flex-1 snap-x snap-mandatory auto-cols-[100%] grid-flow-col grid-rows-1 overflow-x-auto overflow-y-hidden overscroll-x-contain"
				>
					<PagerPane swiping={swiping}>{dash}</PagerPane>
					<PagerPane swiping={swiping}>{stats}</PagerPane>
				</div>
			) : (
				<div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-2">
					{dash}
					{stats}
				</div>
			)}
		</div>
	);
}
