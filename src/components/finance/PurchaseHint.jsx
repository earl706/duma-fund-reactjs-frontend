import { Link } from 'react-router-dom';

import { cn, formatCost } from '../../lib/format';
import { usePurchaseActions, usePurchaseLookup } from '../../lib/purchases';
import { toast } from '../../stores/toastStore';
import { useIsProfileOwner } from '../../stores/profileStore';
import { Button } from '../ui';

function statusLabel(status) {
	if (status === 'regular') return 'Regular';
	if (status === 'lapsed') return 'Lapsed';
	if (status === 'related') return 'Related';
	return 'Seen before';
}

function formatMoney(value) {
	if (value == null || value === '') return '—';
	return formatCost(value);
}

/**
 * Informational purchase-history hint for a typed title.
 * Call onInteractStart on pointer down so parent editors can skip blur-cancel.
 */
export function PurchaseHint({ query, onInteractStart, className = '' }) {
	const { data, isFetching } = usePurchaseLookup(query);
	const { markRegular, exclude } = usePurchaseActions();
	const isOwner = useIsProfileOwner();
	const matches = data?.matches || [];

	if (!(query || '').trim() || (query || '').trim().length < 2) return null;
	if (!isFetching && matches.length === 0) return null;

	const primary = matches[0];
	if (!primary && isFetching) {
		return (
			<div
				className={cn(
					'border-line bg-surface-2 text-muted z-20 mt-1 rounded-md border px-2 py-1.5 text-xs',
					className
				)}
			>
				Checking purchase history…
			</div>
		);
	}
	if (!primary) return null;

	const handleExclude = (matchedTitle) => {
		onInteractStart?.();
		exclude.mutate(
			{ queryTitle: query, matchedTitle },
			{
				onSuccess: () => toast.info('Won’t match those titles again.'),
				onError: () => toast.error('Could not save exclusion.')
			}
		);
	};

	const handleMarkRegular = (title) => {
		onInteractStart?.();
		markRegular.mutate(title, {
			onSuccess: () => toast.success('Marked as regular buy.'),
			onError: () => toast.error('Could not mark as regular.')
		});
	};

	const extraCount = matches.length > 1 ? matches.length - 1 : 0;
	const summary = [
		`Last ${formatMoney(primary.typical_price)}`,
		`qty ${primary.typical_qty ?? '—'}`,
		primary.last_merchant || 'Unknown',
		primary.days_since_last != null ? `${primary.days_since_last}d ago` : primary.last_purchased_at
	]
		.filter(Boolean)
		.join(' · ');

	const extraDetail = (
		<>
			<p className="text-muted mt-0.5 leading-relaxed">
				Avg {formatMoney(primary.avg_price)} · {primary.purchase_count} buys
				{primary.usual_interval_days != null
					? ` · ~${Math.round(primary.usual_interval_days)}d apart`
					: ''}
			</p>
			{primary.recent?.length > 0 && (
				<ul className="text-muted border-line/60 mt-1.5 space-y-0.5 border-t pt-1.5">
					{primary.recent.map((r, i) => (
						<li key={`${r.transaction_id}-${i}`}>
							{r.date_effective}: {formatMoney(r.cost)} × {r.quantity} {r.unit} @ {r.merchant}
							{r.transaction_id ? (
								<>
									{' '}
									<Link
										to={`/transactions/${r.transaction_id}`}
										className="text-primary hover:underline"
										onMouseDown={onInteractStart}
									>
										view
									</Link>
								</>
							) : null}
						</li>
					))}
				</ul>
			)}
			{primary.related?.length > 0 && (
				<p className="text-muted mt-1.5">
					Related: {primary.related.map((r) => r.display_title).join(', ')}
				</p>
			)}
			{extraCount > 0 && (
				<p className="text-muted mt-1.5">
					+{extraCount} other match{extraCount > 1 ? 'es' : ''}
				</p>
			)}
		</>
	);

	return (
		<div
			className={cn(
				'border-line bg-surface z-20 mt-1 rounded-md border px-2.5 py-2 text-xs shadow-sm',
				className || 'max-w-md'
			)}
			onMouseDown={(e) => {
				onInteractStart?.();
				if (onInteractStart) e.preventDefault();
			}}
		>
			<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
				<div className="w-full min-w-0 md:flex-1">
					<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
						<span className="text-fg font-semibold">{primary.display_title}</span>
						<span className="text-muted">{statusLabel(primary.status)}</span>
						{primary.match_kind === 'related' && (
							<span className="text-muted">· related size/pack</span>
						)}
					</div>
					<p className="text-muted mt-1 leading-snug md:hidden">{summary}</p>
					<div className="hidden md:block">
						<p className="text-muted mt-1 leading-relaxed">{summary}</p>
						{extraDetail}
					</div>
					<details className="mt-1 md:hidden">
						<summary className="text-primary cursor-pointer font-medium">History</summary>
						<div className="pt-1">{extraDetail}</div>
					</details>
				</div>
				{isOwner && (
					<div className="flex w-full flex-col gap-1.5 sm:flex-row md:w-auto md:shrink-0 md:flex-col">
						<Button
							variant="secondary"
							size="sm"
							type="button"
							className="h-9 w-full justify-center md:w-auto"
							onClick={() => handleExclude(primary.display_title)}
							disabled={exclude.isPending}
						>
							Not the same product
						</Button>
						{primary.status !== 'regular' && (
							<Button
								variant="secondary"
								size="sm"
								type="button"
								className="h-9 w-full justify-center md:w-auto"
								onClick={() => handleMarkRegular(primary.display_title)}
								disabled={markRegular.isPending}
							>
								Mark as regular
							</Button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
