import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

import { formatCost } from '../lib/format';
import { usePurchaseActions, usePurchaseInsights } from '../lib/purchases';
import { toast } from '../stores/toastStore';
import { useIsProfileOwner } from '../stores/profileStore';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, EmptyState, LoadingScreen } from '../components/ui';

function Section({ title, description, rows, empty, onMarkRegular }) {
	return (
		<section className="mb-8">
			<div className="mb-3">
				<h2 className="text-fg text-base font-semibold">{title}</h2>
				{description ? <p className="text-muted mt-0.5 text-sm">{description}</p> : null}
			</div>
			{!rows?.length ? (
				<p className="text-muted text-sm">{empty}</p>
			) : (
				<ul className="divide-line border-line divide-y border-y">
					{rows.map((row) => (
						<li
							key={row.normalized_title}
							className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
						>
							<div className="min-w-0">
								<div className="text-fg font-medium">{row.display_title}</div>
								<p className="text-muted mt-0.5 text-sm">
									{formatCost(row.typical_price)} · qty {row.typical_qty ?? '—'} ·{' '}
									{row.last_merchant || 'Unknown'} · {row.last_purchased_at || '—'}
									{row.days_since_last != null ? ` (${row.days_since_last}d ago)` : ''}
								</p>
								<p className="text-muted text-sm">
									Avg {formatCost(row.avg_price)} · {row.purchase_count} buys
									{row.usual_interval_days != null
										? ` · ~${Math.round(row.usual_interval_days)}d apart`
										: ''}
								</p>
								{row.last_transaction_id ? (
									<Link
										to={`/transactions/${row.last_transaction_id}`}
										className="text-primary mt-1 inline-block text-sm hover:underline"
									>
										Open last transaction
									</Link>
								) : null}
							</div>
							{onMarkRegular && row.status !== 'regular' && (
								<div className="flex shrink-0 flex-wrap gap-1.5">
									<Button
										variant="secondary"
										size="sm"
										type="button"
										onClick={() => onMarkRegular(row.display_title)}
									>
										Mark regular
									</Button>
								</div>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

export default function RegularBuysPage() {
	const { data, isLoading, isError, refetch, isFetching } = usePurchaseInsights();
	const { markRegular } = usePurchaseActions();
	const isOwner = useIsProfileOwner();

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
					<Section
						title="Due soon"
						description="Approaching your usual repurchase interval."
						rows={data?.due_soon}
						empty="Nothing due based on your recent buying rhythm."
						onMarkRegular={isOwner ? onMarkRegular : undefined}
					/>
					<Section
						title="Regular"
						description="Bought at least twice in the last 30 days, or marked by you."
						rows={data?.regular}
						empty="No regular items yet. Log a few repeats or mark items while typing."
						onMarkRegular={isOwner ? onMarkRegular : undefined}
					/>
					<Section
						title="Lapsed"
						description="Used to be regular but haven’t bought in a while."
						rows={data?.lapsed}
						empty="No lapsed staples."
						onMarkRegular={isOwner ? onMarkRegular : undefined}
					/>
					<Section
						title="Recently seen"
						description="Other items with purchase history (not auto-regular)."
						rows={data?.recently_seen}
						empty="No other purchase history yet."
						onMarkRegular={isOwner ? onMarkRegular : undefined}
					/>
				</>
			)}
		</div>
	);
}
