import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

import { formatCost } from '../lib/format';
import { usePurchaseActions, usePurchaseInsights } from '../lib/purchases';
import { paginateClient } from '../hooks/useListControls';
import { toast } from '../stores/toastStore';
import { useIsProfileOwner } from '../stores/profileStore';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, EmptyState, LoadingScreen, Pagination } from '../components/ui';

const SECTION_PAGE_SIZE = 12;

const INSIGHT_TABS = [
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
		<div className="mb-4 overflow-x-auto">
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
	return `${formatCost(row.typical_price)} · qty ${row.typical_qty ?? '—'} · ${
		row.last_merchant || 'Unknown'
	} · ${when}${ago}`;
}

function ItemCard({ row, onMarkRegular }) {
	const showMark = Boolean(onMarkRegular) && row.status !== 'regular';
	const stats = itemStats(row);

	return (
		<Card as="li" className="flex h-full min-w-0 flex-col gap-2 p-3">
			<div className="text-fg min-w-0 truncate font-medium" title={row.display_title}>
				{row.display_title}
			</div>
			<p className="text-muted truncate text-sm" title={stats}>
				{stats}
			</p>
			<div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
				{row.last_transaction_id ? (
					<Link
						to={`/transactions/${row.last_transaction_id}`}
						className="text-primary text-sm hover:underline"
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
						onClick={() => onMarkRegular(row.display_title)}
					>
						Mark regular
					</Button>
				) : null}
			</div>
		</Card>
	);
}

function Section({ description, rows, empty, onMarkRegular }) {
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
							<ItemCard key={row.normalized_title} row={row} onMarkRegular={onMarkRegular} />
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
			<PageHeader
				title="Regular buys"
				icon={RefreshCw}
				description="Items you buy consistently — history, due soon, and lapsed staples."
				actions={
					<Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
						Refresh
					</Button>
				}
			/>

			{isLoading ? (
				<LoadingScreen />
			) : isError ? (
				<EmptyState
					title="Could not load purchase insights"
					description="Try refreshing the page."
				/>
			) : (
				<>
					<InsightTabBar tabs={INSIGHT_TABS} active={activeTab} onChange={setActiveTab} />
					{INSIGHT_TABS.map((tab) => (
						<InsightPanel key={tab.id} id={tab.id} active={activeTab}>
							<Section
								description={tab.description}
								rows={data?.[tab.rowsKey]}
								empty={tab.empty}
								onMarkRegular={isOwner ? onMarkRegular : undefined}
							/>
						</InsightPanel>
					))}
				</>
			)}
		</div>
	);
}
