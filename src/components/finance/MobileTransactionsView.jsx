import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';

import { cn, formatCost, formatDate } from '../../lib/format';
import { Button, EmptyState, LoadingScreen, Modal } from '../ui';
import { TypeGlyph, amountToneClass, formatSignedAmount } from './txnDisplay';

const TYPE_FILTER = [
	{ value: '', label: 'All types' },
	{ value: 'expense', label: 'Expense' },
	{ value: 'income', label: 'Income' },
	{ value: 'transfer_in', label: 'Transfer in' },
	{ value: 'transfer_out', label: 'Transfer out' }
];

const STATUS_FILTER = [
	{ value: 'active', label: 'Active' },
	{ value: '', label: 'All' },
	{ value: 'archived', label: 'Archived' }
];

function FilterChip({ selected, onClick, children }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
				selected
					? 'border-primary bg-primary/12 text-primary'
					: 'border-line text-muted hover:text-fg'
			)}
		>
			{children}
		</button>
	);
}

/**
 * iOS ledger: balance hero + tappable rows. Editors get a per-row delete.
 */
export function MobileTransactionsView({
	balance,
	rows,
	isLoading,
	isError,
	search,
	setSearch,
	filters,
	setFilter,
	onAdd,
	adding,
	onRequestDelete
}) {
	const [filterOpen, setFilterOpen] = useState(false);
	const typeValue = filters.type || '';
	const statusValue = filters.status ?? '';
	const extraFilters = Boolean(typeValue) || statusValue !== 'active';

	return (
		<div className="relative pb-24">
			<header className="mb-5">
				<p className="text-muted text-sm font-medium">Current balance</p>
				<p className="text-fg mt-1 text-[2.15rem] leading-none font-semibold tracking-tight tabular-nums">
					{balance ? formatCost(balance.balance) : '—'}
				</p>
				<p className="text-muted mt-2 text-sm">
					Starting{' '}
					<span className="text-fg tabular-nums">
						{balance ? formatCost(balance.starting_balance) : '—'}
					</span>
				</p>
			</header>

			<div className="mb-5 flex items-center gap-2">
				<label className="border-line bg-surface-2 focus-within:border-primary relative flex min-h-11 flex-1 items-center gap-2 rounded-full border px-3.5">
					<Search size={16} className="text-muted shrink-0" />
					<input
						type="search"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search title or store"
						className="text-fg placeholder:text-muted h-11 w-full bg-transparent text-sm outline-none"
						aria-label="Search transactions"
					/>
				</label>
				<Button
					variant="secondary"
					size="icon"
					className="relative h-11 w-11 shrink-0 rounded-full"
					onClick={() => setFilterOpen(true)}
					aria-label="Filter transactions"
				>
					<SlidersHorizontal size={18} />
					{extraFilters && (
						<span className="bg-primary absolute top-1.5 right-1.5 h-2 w-2 rounded-full" />
					)}
				</Button>
			</div>

			<div className="mb-2 flex items-baseline justify-between">
				<h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
					Last transactions
				</h2>
				<p className="text-muted text-xs tabular-nums">{isLoading ? '…' : `${rows.length}`}</p>
			</div>

			{isLoading ? (
				<LoadingScreen />
			) : isError ? (
				<EmptyState
					icon={ArrowLeftRight}
					title="Could not load transactions"
					description="Something went wrong while fetching your ledger."
				/>
			) : rows.length === 0 ? (
				<EmptyState
					icon={ArrowLeftRight}
					title="No transactions yet"
					description="Scan a receipt or add an expense."
					action={
						<Button onClick={onAdd} loading={adding}>
							<Plus size={16} /> New expense
						</Button>
					}
				/>
			) : (
				<ul className="divide-line divide-y">
					{rows.map((row) => (
						<li key={row.id} className="flex items-center gap-0.5">
							<Link
								to={`/transactions/${row.id}`}
								className={cn(
									'flex min-h-17 min-w-0 flex-1 cursor-pointer items-center gap-3 py-3',
									row.status === 'archived' && 'opacity-55'
								)}
							>
								<TypeGlyph type={row.type} />
								<div className="min-w-0 flex-1">
									<p className="text-fg truncate text-[15px] font-medium">
										{row.title || 'Untitled'}
									</p>
									<p className="text-muted mt-0.5 truncate text-xs">
										{row.merchant || 'Unknown'}
										{row.date_effective ? ` · ${formatDate(row.date_effective)}` : ''}
										{row.status === 'archived' ? ' · Archived' : ''}
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
							{onRequestDelete && (
								<Button
									variant="ghost"
									size="icon"
									className="text-muted hover:text-danger h-11 w-11 shrink-0 rounded-full"
									onClick={() => onRequestDelete(row)}
									aria-label={`Delete ${row.title || 'transaction'}`}
								>
									<Trash2 size={18} />
								</Button>
							)}
						</li>
					))}
				</ul>
			)}

			{onAdd && (
				<button
					type="button"
					onClick={onAdd}
					disabled={adding}
					aria-label="New expense"
					className="bg-primary text-primary-fg shadow-primary/30 fixed right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full shadow-lg disabled:opacity-50"
				>
					<Plus size={26} strokeWidth={2.4} />
				</button>
			)}

			<Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filters" size="sm">
				<div className="space-y-5">
					<div>
						<p className="text-fg mb-2 text-sm font-medium">Type</p>
						<div className="flex flex-wrap gap-2">
							{TYPE_FILTER.map((opt) => (
								<FilterChip
									key={opt.value || 'all-types'}
									selected={typeValue === opt.value}
									onClick={() => setFilter('type', opt.value)}
								>
									{opt.label}
								</FilterChip>
							))}
						</div>
					</div>
					<div>
						<p className="text-fg mb-2 text-sm font-medium">Status</p>
						<div className="flex flex-wrap gap-2">
							{STATUS_FILTER.map((opt) => (
								<FilterChip
									key={opt.value || 'all-status'}
									selected={statusValue === opt.value}
									onClick={() => setFilter('status', opt.value)}
								>
									{opt.label}
								</FilterChip>
							))}
						</div>
					</div>
					<Button className="w-full" onClick={() => setFilterOpen(false)}>
						Done
					</Button>
				</div>
			</Modal>
		</div>
	);
}
