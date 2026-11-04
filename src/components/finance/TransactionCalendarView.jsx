import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn, formatCost } from '../../lib/format';
import { Button, EmptyState, LoadingSwap } from '../ui';
import { amountToneClass, formatSignedAmount } from './txnDisplay';
import { TransactionDayDetailBody, TransactionDayDetailModal } from './TransactionDayDetailModal';
import {
	CAL_GRAINS,
	dayTotals,
	groupByDate,
	latestFive,
	monthGridDays,
	rangeTitle,
	sameDay,
	sameMonth,
	shiftAnchor,
	toISODate,
	weekDays
} from './transactionCalendar';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SegmentedToggle({ options, value, onChange, ariaLabel }) {
	return (
		<div
			className="border-line bg-surface-2 inline-flex rounded-md border p-0.5"
			role="group"
			aria-label={ariaLabel}
		>
			{options.map((opt) => (
				<Button
					key={opt.value}
					type="button"
					size="sm"
					variant={value === opt.value ? 'primary' : 'ghost'}
					className="h-8 shrink-0"
					title={opt.title || opt.label}
					aria-label={opt.title || opt.label}
					aria-pressed={value === opt.value}
					onClick={() => onChange(opt.value)}
				>
					{opt.label}
				</Button>
			))}
		</div>
	);
}

function formatNet(value) {
	const amount = Number(value);
	if (!Number.isFinite(amount) || amount === 0) return null;
	const formatted = formatCost(Math.abs(amount));
	if (formatted === '—') return null;
	return amount > 0 ? `+${formatted}` : `−${formatted}`;
}

function DayCell({ day, anchor, txns, compact, aggregateOnly, onOpen }) {
	const iso = toISODate(day);
	const inMonth = sameMonth(day, anchor);
	const today = sameDay(day, new Date());
	const totals = dayTotals(txns);
	const txnCount = txns?.length || 0;
	const preview = aggregateOnly ? [] : latestFive(txns);
	const more = aggregateOnly ? 0 : Math.max(0, txnCount - preview.length);
	const netLabel = formatNet(totals.net);
	const countLabel = txnCount > 100 ? '99+' : String(txnCount);

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
					{netLabel ? (
						<span
							className={cn(
								'w-full truncate text-[9px] leading-tight font-semibold tabular-nums',
								totals.net > 0 ? 'text-success' : 'text-danger'
							)}
						>
							{netLabel}
						</span>
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
						{netLabel ? (
							<span
								className={cn(
									'truncate text-[10px] font-semibold tabular-nums',
									totals.net > 0 ? 'text-success' : 'text-danger'
								)}
							>
								{netLabel}
							</span>
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
								<span className={cn('shrink-0 tabular-nums', amountToneClass(txn.type))}>
									{formatSignedAmount(txn.amount, txn.type)}
								</span>
							</li>
						))}
						{more > 0 ? <li className="text-muted text-[10px]">+{more} more</li> : null}
					</ul>
				</>
			)}
		</button>
	);
}

/**
 * Apple-style month / week / day calendar for the ledger.
 * Month & week cells open a day modal; day grain shows detail inline.
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
	aggregateOnly = false
}) {
	const [modalDate, setModalDate] = useState(null);
	const byDate = useMemo(() => groupByDate(transactions), [transactions]);
	const title = rangeTitle(anchor, grain);

	const monthDays = useMemo(
		() => (grain === 'month' ? monthGridDays(anchor) : []),
		[anchor, grain]
	);
	const week = useMemo(() => (grain === 'week' ? weekDays(anchor) : []), [anchor, grain]);
	const dayISO = toISODate(anchor);
	const dayTxns = byDate.get(dayISO) || [];

	return (
		<div className="flex min-h-0 flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-1">
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
					<SegmentedToggle
						options={CAL_GRAINS}
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
					<TransactionDayDetailBody dateISO={dayISO} transactions={dayTxns} />
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
			/>
		</div>
	);
}

export { SegmentedToggle };
