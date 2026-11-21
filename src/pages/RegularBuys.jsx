import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, RefreshCw } from 'lucide-react';

import { cn, formatDateLong } from '../lib/format';
import { usePurchaseActions, usePurchaseInsights } from '../lib/purchases';
import { toast } from '../stores/toastStore';
import { useCanEditLedger, useIsProfileOwner } from '../stores/profileStore';
import { PageHeader } from '../components/layout/PageHeader';
import { StickyPageChrome } from '../components/layout/StickyPageChrome';
import { CostAmount } from '../components/finance/CostAmount';
import {
	COMPARE_MODES,
	PurchasePriceDetailModal
} from '../components/finance/PurchasePriceDetailModal';
import { priceDeltaParts } from '../components/finance/purchasePriceDelta';
import { Button, EmptyState, LoadingSwap } from '../components/ui';

const INSIGHT_TABS = [
	{
		id: 'all',
		label: 'All',
		rowsKey: 'all',
		description: 'Every tracked product, ranked by buy frequency and how recently you bought it.',
		empty: 'No purchase history yet.'
	},
	{
		id: 'due-soon',
		label: 'Due soon',
		rowsKey: 'due_soon',
		description: 'Approaching your usual repurchase interval.',
		empty: 'Nothing due based on your recent buying rhythm.'
	},
	{
		id: 'regular',
		label: 'Regular',
		rowsKey: 'regular',
		description: 'Bought at least twice in the last 30 days, or marked by you.',
		empty: 'No regular items yet. Log a few repeats or mark items while typing.'
	},
	{
		id: 'lapsed',
		label: 'Lapsed',
		rowsKey: 'lapsed',
		description: 'Used to be regular but haven’t bought in a while.',
		empty: 'No lapsed staples.'
	},
	{
		id: 'recently-seen',
		label: 'Recently seen',
		rowsKey: 'recently_seen',
		description: 'Other items with purchase history, ranked by frequency and recency.',
		empty: 'No other purchase history yet.'
	}
];

function resolveInsightTab(raw) {
	if (INSIGHT_TABS.some((tab) => tab.id === raw)) return raw;
	return INSIGHT_TABS[0].id;
}

function rowId(row) {
	return row.normalized_title || row.display_title;
}

function statusLabel(status) {
	if (status === 'regular') return 'Regular';
	if (status === 'lapsed') return 'Lapsed';
	if (status === 'related') return 'Related';
	return 'Seen';
}

/** Empty string = backend/default tab order (activity rank, etc.). */
const DEFAULT_ORDERING = '';

const SORTABLE_COLUMNS = [
	{ key: 'display_title', label: 'Product', align: 'left', width: 'w-[22%]', type: 'string' },
	{ key: 'status', label: 'Status', align: 'left', width: 'w-[9%]', type: 'string' },
	{ key: 'last_price', label: 'Last price', align: 'right', width: 'w-[14%]', type: 'number' },
	{ key: 'purchase_count', label: 'Buys', align: 'right', width: 'w-[8%]', type: 'number' },
	{ key: 'typical_qty', label: 'Qty', align: 'right', width: 'w-[8%]', type: 'number' },
	{ key: 'last_merchant', label: 'Merchant', align: 'left', width: 'w-[14%]', type: 'string' },
	{ key: 'last_purchased_at', label: 'Last bought', align: 'left', width: 'w-[14%]', type: 'date' }
];

function parseOrdering(ordering) {
	if (!ordering) return { key: '', dir: null };
	const primary = String(ordering).split(',')[0].trim();
	if (primary.startsWith('-')) return { key: primary.slice(1), dir: 'desc' };
	return { key: primary, dir: 'asc' };
}

/** none → asc → desc → defaultOrdering (DataSheet cycle). */
function nextOrdering(current, sortKey, defaultOrdering = DEFAULT_ORDERING) {
	const asc = sortKey;
	const desc = `-${sortKey}`;
	const primary = String(current || '')
		.split(',')[0]
		.trim();
	if (primary === asc) return desc;
	if (primary === desc) {
		return current === defaultOrdering || primary === defaultOrdering ? asc : defaultOrdering;
	}
	return asc;
}

function SortIndicator({ direction }) {
	return (
		<span className="inline-flex shrink-0 flex-col leading-none" aria-hidden>
			<span className={cn('text-[7px]', direction === 'asc' ? 'text-fg' : 'text-muted/35')}>▲</span>
			<span className={cn('-mt-px text-[7px]', direction === 'desc' ? 'text-fg' : 'text-muted/35')}>
				▼
			</span>
		</span>
	);
}

function sortValue(row, key, type) {
	if (key === 'last_price') {
		const n = Number(row.last_price ?? row.typical_price);
		return Number.isFinite(n) ? n : null;
	}
	if (type === 'number') {
		const n = Number(row[key]);
		return Number.isFinite(n) ? n : null;
	}
	if (type === 'date') {
		const raw = row[key];
		if (!raw) return null;
		const t = Date.parse(raw);
		return Number.isFinite(t) ? t : null;
	}
	if (key === 'status') return statusLabel(row.status).toLowerCase();
	if (key === 'last_merchant') return (row.last_merchant || '').toLowerCase();
	return (row[key] || '').toString().toLowerCase();
}

function sortInsightRows(rows, ordering) {
	const { key, dir } = parseOrdering(ordering);
	if (!key || !dir) return rows;
	const col = SORTABLE_COLUMNS.find((c) => c.key === key);
	if (!col) return rows;
	const mul = dir === 'desc' ? -1 : 1;
	return [...rows].sort((a, b) => {
		const av = sortValue(a, key, col.type);
		const bv = sortValue(b, key, col.type);
		if (av == null && bv == null) return 0;
		if (av == null) return 1;
		if (bv == null) return -1;
		if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
		return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' }) * mul;
	});
}

function SortableTh({ col, ordering, onOrderingChange }) {
	const { key: activeKey, dir } = parseOrdering(ordering);
	const active = activeKey === col.key;
	const ariaSort = active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none';

	return (
		<th
			scope="col"
			aria-sort={ariaSort}
			className={cn(
				'text-muted px-1.5 py-1 text-[10px] font-semibold tracking-wide uppercase',
				col.width,
				col.align === 'right' ? 'text-right' : 'text-left'
			)}
		>
			<button
				type="button"
				className={cn(
					'inline-flex max-w-full cursor-pointer items-center gap-0.5 select-none',
					col.align === 'right' && 'ml-auto',
					active ? 'text-fg' : 'hover:text-fg'
				)}
				onClick={() => onOrderingChange(nextOrdering(ordering, col.key))}
				aria-label={`Sort by ${col.label}`}
			>
				<span className="min-w-0 truncate">{col.label}</span>
				<SortIndicator direction={active ? dir : null} />
			</button>
		</th>
	);
}

function InsightTabBar({ tabs, active, onChange }) {
	return (
		<div className="overflow-x-auto">
			<div
				className="border-line bg-surface-2 inline-flex rounded-md border p-0.5"
				role="tablist"
				aria-label="Regular buy sections"
			>
				{tabs.map((tab) => {
					const selected = active === tab.id;
					return (
						<Button
							key={tab.id}
							type="button"
							size="sm"
							variant={selected ? 'primary' : 'ghost'}
							className="h-8 shrink-0 whitespace-nowrap"
							role="tab"
							id={`regular-buys-tab-${tab.id}`}
							aria-selected={selected}
							aria-controls={`regular-buys-panel-${tab.id}`}
							onClick={() => onChange(tab.id)}
						>
							{tab.label}
						</Button>
					);
				})}
			</div>
		</div>
	);
}

function CompareModeBar({ mode, onChange }) {
	return (
		<div
			className="border-line bg-surface-2 inline-flex rounded-md border p-0.5"
			role="group"
			aria-label="Price change baseline"
		>
			{COMPARE_MODES.map((g) => (
				<Button
					key={g.value}
					type="button"
					size="sm"
					variant={mode === g.value ? 'primary' : 'ghost'}
					className="h-8 shrink-0"
					title={g.title}
					aria-label={g.title}
					aria-pressed={mode === g.value}
					onClick={() => onChange(g.value)}
				>
					{g.label}
				</Button>
			))}
		</div>
	);
}

function InsightPanel({ id, active, children }) {
	return (
		<div
			role="tabpanel"
			id={`regular-buys-panel-${id}`}
			aria-labelledby={`regular-buys-tab-${id}`}
			hidden={active !== id}
		>
			{children}
		</div>
	);
}

function lastBoughtLabel(row) {
	if (!row.last_purchased_at) return '—';
	const when = formatDateLong(row.last_purchased_at);
	if (row.days_since_last == null) return when;
	return `${when} (${row.days_since_last}d)`;
}

function InsightRow({
	row,
	compareMode,
	selected,
	selectable,
	onToggleSelect,
	onOpen,
	onMarkRegular
}) {
	const showMark = Boolean(onMarkRegular) && row.status !== 'regular';
	const lastPrice = row.last_price ?? row.typical_price;
	const delta = priceDeltaParts(row, compareMode);

	return (
		<tr
			role="button"
			tabIndex={0}
			className={cn(
				'border-line hover:bg-surface-2/80 focus-visible:bg-surface-2 cursor-pointer border-b last:border-b-0 focus-visible:outline-none',
				selected && 'bg-primary/5'
			)}
			onClick={() => onOpen?.(row)}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onOpen?.(row);
				}
			}}
		>
			{selectable ? (
				<td className="w-8 px-1.5 py-0.5 text-center" onClick={(e) => e.stopPropagation()}>
					<input
						type="checkbox"
						className="accent-primary h-3.5 w-3.5 cursor-pointer"
						checked={selected}
						onChange={(e) => onToggleSelect?.(rowId(row), { shiftKey: e.nativeEvent.shiftKey })}
						aria-label={`Select ${row.display_title}`}
					/>
				</td>
			) : null}
			<td
				className="text-fg max-w-[14rem] truncate px-1.5 py-0.5 font-medium"
				title={row.display_title}
			>
				{row.display_title}
			</td>
			<td className="text-muted px-1.5 py-0.5 whitespace-nowrap">{statusLabel(row.status)}</td>
			<td className="px-1.5 py-0.5 text-right tabular-nums">
				<span className="text-fg inline-flex flex-wrap items-baseline justify-end gap-x-1.5">
					<CostAmount value={lastPrice} className="font-medium" />
					{delta ? (
						<span className={cn('text-[10px] font-medium', delta.className)}>{delta.text}</span>
					) : null}
				</span>
			</td>
			<td className="text-fg px-1.5 py-0.5 text-right whitespace-nowrap tabular-nums">
				{row.purchase_count ?? '—'}
			</td>
			<td className="text-muted px-1.5 py-0.5 text-right whitespace-nowrap tabular-nums">
				{row.typical_qty ?? '—'}
			</td>
			<td
				className="text-muted max-w-[9rem] truncate px-1.5 py-0.5"
				title={row.last_merchant || 'Unknown'}
			>
				{row.last_merchant || 'Unknown'}
			</td>
			<td className="text-muted px-1.5 py-0.5 whitespace-nowrap">{lastBoughtLabel(row)}</td>
			<td className="px-0.5 py-0.5 text-right">
				{/* Fixed h-7 so rows with/without action icons share the same height */}
				<div className="inline-flex h-7 w-full items-center justify-end gap-0.5">
					{row.last_transaction_id ? (
						<Link
							to={`/transactions/${row.last_transaction_id}`}
							className="text-muted hover:text-fg hover:bg-surface-2 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md"
							aria-label={`Open last transaction for ${row.display_title}`}
							title="Open last transaction"
							onClick={(e) => e.stopPropagation()}
						>
							<ExternalLink size={14} />
						</Link>
					) : null}
					{showMark ? (
						<Button
							variant="ghost"
							size="icon"
							type="button"
							className="h-7 w-7 shrink-0"
							aria-label={`Mark ${row.display_title} as regular`}
							title="Mark regular"
							onClick={(e) => {
								e.stopPropagation();
								onMarkRegular(row.display_title);
							}}
						>
							<RefreshCw size={14} />
						</Button>
					) : null}
				</div>
			</td>
		</tr>
	);
}

function Section({
	active,
	description,
	rows,
	empty,
	compareMode,
	selectable,
	onOpen,
	onMarkRegular,
	onMerge,
	merging = false
}) {
	const [ordering, setOrdering] = useState(DEFAULT_ORDERING);
	const [selectedIds, setSelectedIds] = useState(() => new Set());
	const selectionAnchorRef = useRef(null);
	const items = rows ?? [];
	const sortedItems = useMemo(() => sortInsightRows(items, ordering), [items, ordering]);
	const itemIds = useMemo(() => sortedItems.map(rowId), [sortedItems]);
	const idSet = useMemo(() => new Set(itemIds), [itemIds]);

	useEffect(() => {
		if (!active) {
			setOrdering(DEFAULT_ORDERING);
			setSelectedIds(new Set());
			selectionAnchorRef.current = null;
		}
	}, [active]);

	useEffect(() => {
		setSelectedIds((prev) => {
			const next = new Set([...prev].filter((id) => idSet.has(id)));
			return next.size === prev.size ? prev : next;
		});
	}, [idSet]);

	const allSelected =
		sortedItems.length > 0 && sortedItems.every((row) => selectedIds.has(rowId(row)));
	const someSelected = sortedItems.some((row) => selectedIds.has(rowId(row)));

	const toggleRow = (id, { shiftKey = false } = {}) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (shiftKey && selectionAnchorRef.current != null) {
				const a = itemIds.indexOf(selectionAnchorRef.current);
				const b = itemIds.indexOf(id);
				if (a >= 0 && b >= 0) {
					const [lo, hi] = a < b ? [a, b] : [b, a];
					for (let i = lo; i <= hi; i += 1) next.add(itemIds[i]);
					return next;
				}
			}
			if (next.has(id)) next.delete(id);
			else next.add(id);
			selectionAnchorRef.current = id;
			return next;
		});
	};

	const toggleAll = () => {
		if (allSelected) {
			selectionAnchorRef.current = null;
			setSelectedIds(new Set());
			return;
		}
		selectionAnchorRef.current = itemIds[0] ?? null;
		setSelectedIds(new Set(itemIds));
	};

	const clearSelection = () => {
		selectionAnchorRef.current = null;
		setSelectedIds(new Set());
	};

	const selectedRows = useMemo(
		() => sortedItems.filter((row) => selectedIds.has(rowId(row))),
		[sortedItems, selectedIds]
	);

	const handleMerge = () => {
		if (selectedRows.length < 2 || !onMerge) return;
		onMerge(
			selectedRows.map((row) => row.display_title),
			{ onSettled: clearSelection }
		);
	};

	return (
		<section>
			{description ? <p className="text-muted mb-3 text-sm">{description}</p> : null}
			{!sortedItems.length ? (
				<p className="text-muted text-sm">{empty}</p>
			) : (
				<div className="border-line bg-surface overflow-hidden rounded-md border">
					{selectable && selectedIds.size > 0 ? (
						<div className="border-line bg-surface-2 flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
							<span className="text-muted text-xs">{selectedIds.size} selected</span>
							{selectedIds.size >= 2 ? (
								<Button
									variant="secondary"
									size="sm"
									className="h-7 text-xs"
									type="button"
									loading={merging}
									disabled={merging}
									onClick={handleMerge}
								>
									Merge as same item
								</Button>
							) : null}
							<Button
								variant="ghost"
								size="sm"
								className="text-muted h-7 text-xs"
								type="button"
								onClick={clearSelection}
							>
								Clear
							</Button>
						</div>
					) : null}
					<table className="w-full table-fixed border-collapse text-xs">
						<thead>
							<tr className="bg-surface-2 border-line border-b">
								{selectable ? (
									<th scope="col" className="w-8 px-1.5 py-1">
										<input
											type="checkbox"
											className="accent-primary h-3.5 w-3.5 cursor-pointer"
											checked={allSelected}
											ref={(el) => {
												if (el) el.indeterminate = someSelected && !allSelected;
											}}
											onChange={toggleAll}
											aria-label="Select all rows"
										/>
									</th>
								) : null}
								{SORTABLE_COLUMNS.map((col) => (
									<SortableTh
										key={col.key}
										col={col}
										ordering={ordering}
										onOrderingChange={setOrdering}
									/>
								))}
								<th className="text-muted w-[11%] px-1.5 py-1 text-right text-[10px] font-semibold tracking-wide uppercase">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{sortedItems.map((row) => (
								<InsightRow
									key={rowId(row)}
									row={row}
									compareMode={compareMode}
									selected={selectedIds.has(rowId(row))}
									selectable={selectable}
									onToggleSelect={toggleRow}
									onOpen={onOpen}
									onMarkRegular={onMarkRegular}
								/>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}

export default function RegularBuysPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { data, isLoading, isError, refetch, isFetching } = usePurchaseInsights();
	const { markRegular, merge } = usePurchaseActions();
	const isOwner = useIsProfileOwner();
	const canEdit = useCanEditLedger();
	const [compareMode, setCompareMode] = useState('previous');
	const [detailRow, setDetailRow] = useState(null);

	const activeTab = resolveInsightTab(searchParams.get('tab'));
	const setActiveTab = (id) => {
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.set('tab', id);
				return next;
			},
			{ replace: true }
		);
	};

	const onMarkRegular = (title) => {
		markRegular.mutate(title, {
			onSuccess: () => toast.success('Marked as regular buy.'),
			onError: () => toast.error('Could not mark as regular.')
		});
	};

	const onMerge = (titles, { onSettled } = {}) => {
		merge.mutate(titles, {
			onSuccess: (result) => {
				const name = result?.display_title || 'Selected products';
				toast.success(`Merged as “${name}”.`);
			},
			onError: () => toast.error('Could not merge products.'),
			onSettled
		});
	};

	return (
		<div>
			<StickyPageChrome>
				<PageHeader
					title="Regular buys"
					icon={RefreshCw}
					description="Items you buy consistently — history, due soon, and lapsed staples."
					className="mb-0"
					settingsShortcut
					actions={
						<Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
							Refresh
						</Button>
					}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<InsightTabBar tabs={INSIGHT_TABS} active={activeTab} onChange={setActiveTab} />
					<CompareModeBar mode={compareMode} onChange={setCompareMode} />
				</div>
			</StickyPageChrome>

			{/* h-auto: avoid LoadingSwap’s h-full creating a nested scrollport with main */}
			<LoadingSwap loading={isLoading} className="h-auto">
				{isError ? (
					<EmptyState
						title="Could not load purchase insights"
						description="Try refreshing the page."
					/>
				) : (
					INSIGHT_TABS.map((tab) => (
						<InsightPanel key={tab.id} id={tab.id} active={activeTab}>
							<Section
								active={activeTab === tab.id}
								description={tab.description}
								rows={data?.[tab.rowsKey]}
								empty={tab.empty}
								compareMode={compareMode}
								selectable={canEdit}
								onOpen={setDetailRow}
								onMarkRegular={isOwner ? onMarkRegular : undefined}
								onMerge={canEdit ? onMerge : undefined}
								merging={merge.isPending}
							/>
						</InsightPanel>
					))
				)}
			</LoadingSwap>

			<PurchasePriceDetailModal
				open={Boolean(detailRow)}
				onClose={() => setDetailRow(null)}
				title={detailRow?.display_title || detailRow?.normalized_title || ''}
				compareMode={compareMode}
				onCompareMode={setCompareMode}
			/>
		</div>
	);
}
