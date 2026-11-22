import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn, costParts } from '../../lib/format';
import { Button, EmptyState, IconChoiceGroup, LoadingSwap, Tooltip } from '../ui';
import { LedgerAmount } from './txnDisplay';
import { TransactionDayDetailBody, TransactionDayDetailModal } from './TransactionDayDetailModal';
import {
	CAL_GRAINS,
	dayTotals,
	groupByDate,
	latestPreview,
	monthGridDays,
	monthTotals,
	monthTxnStats,
	rangeTitle,
	sameDay,
	sameMonth,
	shiftAnchor,
	toISODate,
	weekDays,
	weekTotals,
	yearMonths,
	yearTotals
} from './transactionCalendar';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function NetLabel({ value, className }) {
	const amount = Number(value);
	if (!Number.isFinite(amount) || amount === 0) return null;
	const { display, full, compact } = costParts(Math.abs(amount));
	if (display === '—') return null;
	const prefix = amount > 0 ? '+' : '−';
	const label = (
		<span className={cn('tabular-nums', className)}>
			{prefix}
			{display}
		</span>
	);
	if (!compact) return label;
	return <Tooltip content={`${prefix}${full}`}>{label}</Tooltip>;
}

function SignedMoney({ value, tone, className }) {
	const amount = Number(value) || 0;
	const { display, full, compact } = costParts(Math.abs(amount));
	const prefix = tone === 'in' ? '+' : '−';
	const label = (
		<span className={cn('tabular-nums', tone === 'in' ? 'text-success' : 'text-danger', className)}>
			{prefix}
			{display}
		</span>
	);
	if (!compact || display === '—') return label;
	return <Tooltip content={`${prefix}${full}`}>{label}</Tooltip>;
}

/** Two-column period aggregate: net, then +/− stacked. */
function PeriodAggregate({ totals, label = 'Period totals' }) {
	const net = Number(totals.net) || 0;
	const { display: netDisplay, full: netFull, compact: netCompact } = costParts(Math.abs(net));
	const netPrefix = net > 0 ? '+' : net < 0 ? '−' : '';
	const netLabel = (
		<span
			className={cn(
				'text-[12px] font-semibold tabular-nums sm:text-[24px]',
				net > 0 ? 'text-success' : net < 0 ? 'text-danger' : 'text-muted'
			)}
		>
			{netPrefix}
			{netDisplay}
		</span>
	);
	return (
		<div
			className="border-line ml-2 flex shrink-0 items-center gap-2 border-l pl-2"
			aria-label={label}
		>
			{netCompact && netDisplay !== '—' ? (
				<Tooltip content={`${netPrefix}${netFull}`}>{netLabel}</Tooltip>
			) : (
				netLabel
			)}
			<div className="flex flex-col items-start leading-tight">
				<SignedMoney value={totals.moneyIn} tone="in" className="text-[10px] font-semibold" />
				<SignedMoney value={totals.moneyOut} tone="out" className="text-[10px] font-semibold" />
			</div>
		</div>
	);
}

function DayCell({ day, anchor, txns, compact, aggregateOnly, onOpen }) {
	const iso = toISODate(day);
	const inMonth = sameMonth(day, anchor);
	const today = sameDay(day, new Date());
	const totals = dayTotals(txns);
	const txnCount = txns?.length || 0;
	const preview = aggregateOnly ? [] : latestPreview(txns);
	const more = aggregateOnly ? 0 : Math.max(0, txnCount - preview.length);
	const countLabel = txnCount > 100 ? '99+' : String(txnCount);
	const hasNet = Number.isFinite(Number(totals.net)) && Number(totals.net) !== 0;
	return (
		<button
			type="button"
			onClick={() => onOpen(iso)}
			className={cn(
				'border-line flex min-h-0 cursor-pointer flex-col border-r border-b text-left transition-colors',
				'hover:bg-surface-2/80 focus-visible:bg-surface-2 focus-visible:outline-none',
				!inMonth && 'bg-surface-2/40',
				aggregateOnly
					? 'min-h-[3.35rem] gap-0.5 p-1'
					: cn('gap-0.5 p-1.5', compact ? 'min-h-[5.5rem]' : 'min-h-[12rem]')
			)}
		>
			{aggregateOnly ? (
				<>
					<div className="flex items-center justify-between gap-0.5">
						<span
							className={cn(
								'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-0.5 text-[11px] font-semibold tabular-nums',
								today ? 'bg-primary text-primary-fg' : inMonth ? 'text-fg' : 'text-muted'
							)}
						>
							{day.getDate()}
						</span>
						{txnCount > 0 ? (
							<span className="text-muted shrink-0 text-[9px] leading-none font-medium tabular-nums">
								{countLabel}
							</span>
						) : null}
					</div>
					{hasNet ? (
						<NetLabel
							value={totals.net}
							className={cn(
								'w-full truncate text-[9px] leading-tight font-semibold',
								totals.net > 0 ? 'text-success' : 'text-danger'
							)}
						/>
					) : null}
				</>
			) : (
				<>
					<div className="flex items-center justify-between gap-1">
						<span
							className={cn(
								'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums',
								today ? 'bg-primary text-primary-fg' : inMonth ? 'text-fg' : 'text-muted'
							)}
						>
							{day.getDate()}
						</span>
						{hasNet ? (
							<NetLabel
								value={totals.net}
								className={cn(
									'truncate text-[10px] font-[1000]',
									totals.net > 0 ? 'text-success' : 'text-danger'
								)}
							/>
						) : null}
					</div>
					<ul className={cn('min-h-0 flex-1 space-y-0.5 overflow-hidden', compact && 'max-h-16')}>
						{preview.map((txn) => (
							<li
								key={txn.id}
								className="flex items-baseline justify-between gap-1 text-[10px] leading-tight"
							>
								<span className={cn('min-w-0 truncate', inMonth ? 'text-fg' : 'text-muted')}>
									{txn.title || 'Untitled'}
								</span>
								<LedgerAmount
									amount={txn.amount}
									type={txn.type}
									row={txn}
									className="shrink-0 text-[10px] font-[150]"
								/>
							</li>
						))}
						{more > 0 ? <li className="text-muted text-[10px]">+{more} more</li> : null}
					</ul>
				</>
			)}
		</button>
	);
}

function YearMonthCard({ monthAnchor, transactions, onOpenMonth }) {
	const days = useMemo(() => monthGridDays(monthAnchor), [monthAnchor]);
	const stats = useMemo(
		() => monthTxnStats(transactions, monthAnchor),
		[transactions, monthAnchor]
	);
	const today = new Date();
	const hasNet = Number.isFinite(Number(stats.net)) && Number(stats.net) !== 0;
	const monthLabel = monthAnchor.toLocaleString(undefined, { month: 'long' });

	return (
		<button
			type="button"
			onClick={() => onOpenMonth(monthAnchor)}
			className={cn(
				'hover:bg-surface-2/60 focus-visible:bg-surface-2 flex cursor-pointer flex-col gap-1 rounded-md p-1.5',
				'text-left transition-colors focus-visible:outline-none'
			)}
			aria-label={`Open ${monthLabel}`}
		>
			<div className="flex items-baseline justify-between gap-1">
				<span className="text-primary text-sm font-semibold">{monthLabel}</span>
				<div className="flex min-w-0 items-baseline gap-1">
					{hasNet ? (
						<NetLabel
							value={stats.net}
							className={cn(
								'truncate text-[10px] font-semibold',
								stats.net > 0 ? 'text-success' : 'text-danger'
							)}
						/>
					) : null}
					{stats.count > 0 ? (
						<span className="text-muted-fg p-1 text-[10px] tabular-nums">{stats.count}</span>
					) : null}
				</div>
			</div>
			<div className="grid grid-cols-7 gap-y-0.5">
				{WEEKDAY_LETTERS.map((letter, i) => (
					<span
						key={`${letter}-${i}`}
						className="text-muted text-center text-[9px] leading-none font-medium"
					>
						{letter}
					</span>
				))}
				{days.map((day) => {
					const inMonth = sameMonth(day, monthAnchor);
					const isToday = sameDay(day, today);
					return (
						<span
							key={toISODate(day)}
							className={cn(
								'inline-flex h-5 items-center justify-center text-[10px] leading-none tabular-nums',
								isToday &&
									'bg-primary text-primary-fg mx-auto aspect-square w-5 rounded-full font-semibold',
								!isToday && (inMonth ? 'text-fg' : 'text-muted/45')
							)}
						>
							{day.getDate()}
						</span>
					);
				})}
			</div>
		</button>
	);
}

/**
 * Apple-style month / week / day / year calendar for the ledger.
 * Month & week cells open a day modal; day grain shows detail inline;
 * year mini-months open the month grain.
 */
export function TransactionCalendarView({
	anchor,
	grain,
	onAnchorChange,
	onGrainChange,
	transactions,
	loading,
	error,
	/** Mobile: short cells with day ± only (no txn preview lines). */
	aggregateOnly = false,
	canEdit = false,
	onReorder,
	reorderingId = null
}) {
	const [modalDate, setModalDate] = useState(null);
	const byDate = useMemo(() => groupByDate(transactions), [transactions]);
	const title = rangeTitle(anchor, grain);
	const headerTotals = useMemo(() => {
		if (grain === 'day') return null;
		if (grain === 'year') return yearTotals(transactions, anchor);
		if (grain === 'week') return weekTotals(transactions, anchor);
		return monthTotals(transactions, anchor);
	}, [grain, transactions, anchor]);

	const headerTotalsLabel =
		grain === 'year' ? 'Year totals' : grain === 'week' ? 'Week totals' : 'Month totals';

	const monthDays = useMemo(
		() => (grain === 'month' ? monthGridDays(anchor) : []),
		[anchor, grain]
	);
	const week = useMemo(() => (grain === 'week' ? weekDays(anchor) : []), [anchor, grain]);
	const months = useMemo(() => (grain === 'year' ? yearMonths(anchor) : []), [anchor, grain]);
	const dayISO = toISODate(anchor);
	const dayTxns = byDate.get(dayISO) || [];

	const openMonth = (monthAnchor) => {
		onAnchorChange(monthAnchor);
		onGrainChange('month');
	};

	return (
		<div className="flex min-h-0 flex-col gap-1">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Previous"
						onClick={() => onAnchorChange(shiftAnchor(anchor, grain, -1))}
					>
						<ChevronLeft size={18} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Next"
						onClick={() => onAnchorChange(shiftAnchor(anchor, grain, 1))}
					>
						<ChevronRight size={18} />
					</Button>
					<p className="text-fg min-w-0 truncate text-sm font-semibold sm:text-base">{title}</p>
					{headerTotals ? (
						<PeriodAggregate totals={headerTotals} label={headerTotalsLabel} />
					) : null}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={() => onAnchorChange(new Date())}
					>
						Today
					</Button>
					<IconChoiceGroup
						groupKey="grain"
						options={CAL_GRAINS}
						choiceClassName="!px-1 !min-w-[2rem]"
						value={grain}
						onChange={onGrainChange}
						ariaLabel="Calendar grain"
					/>
				</div>
			</div>

			<LoadingSwap loading={loading}>
				{error ? (
					<EmptyState
						title="Could not load calendar"
						description="Try switching views or refreshing."
					/>
				) : grain === 'day' ? (
					<TransactionDayDetailBody
						dateISO={dayISO}
						transactions={dayTxns}
						canEdit={canEdit}
						onReorder={onReorder}
						reorderingId={reorderingId}
					/>
				) : grain === 'week' ? (
					<div className="border-line overflow-hidden rounded-lg border">
						<div className="border-line bg-surface-2 grid grid-cols-7 border-b">
							{WEEKDAYS.map((d) => (
								<div
									key={d}
									className="text-muted px-1.5 py-1.5 text-center text-[11px] font-medium"
								>
									{d}
								</div>
							))}
						</div>
						<div className="bg-surface grid grid-cols-7">
							{week.map((day) => {
								const iso = toISODate(day);
								return (
									<DayCell
										key={iso}
										day={day}
										anchor={anchor}
										txns={byDate.get(iso) || []}
										compact={false}
										aggregateOnly={aggregateOnly}
										onOpen={setModalDate}
									/>
								);
							})}
						</div>
					</div>
				) : grain === 'year' ? (
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
						{months.map((monthAnchor) => (
							<YearMonthCard
								key={toISODate(monthAnchor)}
								monthAnchor={monthAnchor}
								transactions={transactions}
								onOpenMonth={openMonth}
							/>
						))}
					</div>
				) : (
					<div className="border-line overflow-hidden rounded-lg border">
						<div className="border-line bg-surface-2 grid grid-cols-7 border-b">
							{WEEKDAYS.map((d) => (
								<div
									key={d}
									className="text-muted px-1.5 py-1.5 text-center text-[11px] font-medium"
								>
									{d}
								</div>
							))}
						</div>
						<div className="bg-surface grid grid-cols-7">
							{monthDays.map((day) => {
								const iso = toISODate(day);
								return (
									<DayCell
										key={iso}
										day={day}
										anchor={anchor}
										txns={byDate.get(iso) || []}
										compact
										aggregateOnly={aggregateOnly}
										onOpen={setModalDate}
									/>
								);
							})}
						</div>
					</div>
				)}
			</LoadingSwap>

			<TransactionDayDetailModal
				open={Boolean(modalDate)}
				onClose={() => setModalDate(null)}
				dateISO={modalDate}
				transactions={modalDate ? byDate.get(modalDate) || [] : []}
				canEdit={canEdit}
				onReorder={onReorder}
				reorderingId={reorderingId}
			/>
		</div>
	);
}

export { IconChoiceGroup as SegmentedToggle } from '../ui';
