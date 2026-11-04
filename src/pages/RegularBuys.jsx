import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

import { cn, formatCost } from '../lib/format';
import { usePurchaseActions, usePurchaseInsights } from '../lib/purchases';
import { paginateClient } from '../hooks/useListControls';
import { toast } from '../stores/toastStore';
import { useIsProfileOwner } from '../stores/profileStore';
import { PageHeader } from '../components/layout/PageHeader';
import { StickyPageChrome } from '../components/layout/StickyPageChrome';
import {
	COMPARE_MODES,
	PurchasePriceDetailModal
} from '../components/finance/PurchasePriceDetailModal';
import { priceDeltaParts } from '../components/finance/purchasePriceDelta';
import { Button, Card, EmptyState, LoadingSwap, Pagination } from '../components/ui';

const SECTION_PAGE_SIZE = 12;

const INSIGHT_TABS = [
	{
		id: 'all',
		label: 'All',
		rowsKey: 'all',
		description: 'Every tracked product, newest purchases first.',
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
		description: 'Other items with purchase history (not auto-regular).',
		empty: 'No other purchase history yet.'
	}
];

function resolveInsightTab(raw) {
	if (INSIGHT_TABS.some((tab) => tab.id === raw)) return raw;
	return INSIGHT_TABS[0].id;
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

function itemStats(row) {
	const when = row.last_purchased_at || '—';
	const ago = row.days_since_last != null ? ` (${row.days_since_last}d ago)` : '';
	return `qty ${row.typical_qty ?? '—'} · ${row.last_merchant || 'Unknown'} · ${when}${ago}`;
}

function ItemCard({ row, compareMode, onOpen, onMarkRegular }) {
	const showMark = Boolean(onMarkRegular) && row.status !== 'regular';
	const stats = itemStats(row);
	const lastPrice = row.last_price ?? row.typical_price;
	const delta = priceDeltaParts(row, compareMode);

	return (
		<Card
			as="li"
			role="button"
			tabIndex={0}
			className="hover:border-primary/40 focus-visible:ring-primary flex h-full min-w-0 cursor-pointer flex-col gap-2 p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
			onClick={() => onOpen?.(row)}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onOpen?.(row);
				}
			}}
		>
			<div className="text-fg min-w-0 truncate font-medium" title={row.display_title}>
				{row.display_title}
			</div>
			<p className="text-fg flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
				<span className="font-medium">{formatCost(lastPrice)}</span>
				{delta ? (
					<span className={cn('text-xs font-medium', delta.className)}>{delta.text}</span>
				) : null}
			</p>
			<p className="text-muted truncate text-sm" title={stats}>
				{stats}
			</p>
			<div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
				{row.last_transaction_id ? (
					<Link
						to={`/transactions/${row.last_transaction_id}`}
						className="text-primary text-sm hover:underline"
						onClick={(e) => e.stopPropagation()}
					>
						Open last transaction
					</Link>
				) : (
					<span />
				)}
				{showMark ? (
					<Button
						variant="secondary"
						size="sm"
						type="button"
						className="shrink-0"
						onClick={(e) => {
							e.stopPropagation();
							onMarkRegular(row.display_title);
						}}
					>
						Mark regular
					</Button>
				) : null}
			</div>
		</Card>
	);
}

function Section({ description, rows, empty, compareMode, onOpen, onMarkRegular }) {
	const [page, setPage] = useState(1);
	const items = rows ?? [];
	const paged = paginateClient(items, page, SECTION_PAGE_SIZE);

	useEffect(() => {
		if (paged.page !== page) setPage(paged.page);
	}, [paged.page, page]);

	return (
		<section>
			{description ? <p className="text-muted mb-3 text-sm">{description}</p> : null}
			{!items.length ? (
				<p className="text-muted text-sm">{empty}</p>
			) : (
				<>
					<ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
						{paged.results.map((row) => (
							<ItemCard
								key={row.normalized_title}
								row={row}
								compareMode={compareMode}
								onOpen={onOpen}
								onMarkRegular={onMarkRegular}
							/>
						))}
					</ul>
					<Pagination
						page={paged.page}
						totalPages={paged.total_pages}
						count={paged.count}
						pageSize={SECTION_PAGE_SIZE}
						onPageChange={setPage}
					/>
				</>
			)}
		</section>
	);
}

export default function RegularBuysPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { data, isLoading, isError, refetch, isFetching } = usePurchaseInsights();
	const { markRegular } = usePurchaseActions();
	const isOwner = useIsProfileOwner();
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

			<LoadingSwap loading={isLoading}>
				{isError ? (
					<EmptyState
						title="Could not load purchase insights"
						description="Try refreshing the page."
					/>
				) : (
					INSIGHT_TABS.map((tab) => (
						<InsightPanel key={tab.id} id={tab.id} active={activeTab}>
							<Section
								description={tab.description}
								rows={data?.[tab.rowsKey]}
								empty={tab.empty}
								compareMode={compareMode}
								onOpen={setDetailRow}
								onMarkRegular={isOwner ? onMarkRegular : undefined}
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
