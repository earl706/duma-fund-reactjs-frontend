import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Ban, RefreshCw } from 'lucide-react';

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

function purchaseSummary(primary) {
	return [
		`Last ${formatMoney(primary.typical_price)}`,
		`qty ${primary.typical_qty ?? '—'}`,
		primary.last_merchant || 'Unknown',
		primary.days_since_last != null ? `${primary.days_since_last}d ago` : primary.last_purchased_at
	]
		.filter(Boolean)
		.join(' · ');
}

function PurchaseHintInfo({ primary, matches = [], onInteractStart }) {
	const extraCount = matches.length > 1 ? matches.length - 1 : 0;
	const summary = purchaseSummary(primary);

	return (
		<div className="w-full min-w-0 text-xs">
			<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
				<span className="text-fg font-semibold">{primary.display_title}</span>
				<span className="text-muted">{statusLabel(primary.status)}</span>
				{primary.match_kind === 'related' && (
					<span className="text-muted">· related size/pack</span>
				)}
			</div>
			<p className="text-muted mt-1 leading-relaxed">{summary}</p>
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
										className="text-primary pointer-events-auto hover:underline"
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
		</div>
	);
}

/**
 * Scan-review row actions: icon-only exclude / mark-regular with hover info tooltip.
 */
export function ScanPurchaseActions({ query, buttonClassName = 'h-8 w-8' }) {
	const { data } = usePurchaseLookup(query);
	const { markRegular, exclude } = usePurchaseActions();
	const isOwner = useIsProfileOwner();
	const matches = data?.matches || [];
	const primary = matches[0];
	const wrapRef = useRef(null);
	const tipRef = useRef(null);
	const [tipOpen, setTipOpen] = useState(false);
	const [pos, setPos] = useState(null);
	const hideTimer = useRef(null);

	useLayoutEffect(() => {
		if (!tipOpen || !wrapRef.current) {
			setPos(null);
			return undefined;
		}
		const place = () => {
			const rect = wrapRef.current.getBoundingClientRect();
			const width = Math.min(300, window.innerWidth - 16);
			const pad = 8;
			let left = rect.right - width;
			if (left < pad) left = pad;
			const tipH = tipRef.current?.offsetHeight || 160;
			const spaceBelow = window.innerHeight - rect.bottom - pad;
			const spaceAbove = rect.top - pad;
			const flipUp = spaceBelow < tipH && spaceAbove > spaceBelow;
			let top = flipUp ? rect.top - tipH - 4 : rect.bottom + 4;
			if (top < pad) top = pad;
			setPos({ top, left, width });
		};
		place();
		const raf = requestAnimationFrame(place);
		window.addEventListener('resize', place);
		window.addEventListener('scroll', place, true);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
		};
	}, [tipOpen, primary]);

	const clearHide = () => {
		if (hideTimer.current) {
			clearTimeout(hideTimer.current);
			hideTimer.current = null;
		}
	};

	const scheduleHide = () => {
		clearHide();
		hideTimer.current = setTimeout(() => setTipOpen(false), 120);
	};

	if (!primary || !isOwner) return null;

	const handleExclude = () => {
		exclude.mutate(
			{ queryTitle: query, matchedTitle: primary.display_title },
			{
				onSuccess: () => toast.info('Won’t match those titles again.'),
				onError: () => toast.error('Could not save exclusion.')
			}
		);
	};

	const handleMarkRegular = () => {
		markRegular.mutate(primary.display_title, {
			onSuccess: () => toast.success('Marked as regular buy.'),
			onError: () => toast.error('Could not mark as regular.')
		});
	};

	return (
		<>
			<span
				ref={wrapRef}
				className="inline-flex items-center"
				onMouseEnter={() => {
					clearHide();
					setTipOpen(true);
				}}
				onMouseLeave={scheduleHide}
			>
				<Button
					variant="ghost"
					size="icon"
					type="button"
					className={cn('text-muted hover:text-danger', buttonClassName)}
					aria-label="Not the same product"
					title="Not the same product"
					disabled={exclude.isPending}
					onClick={handleExclude}
				>
					<Ban size={15} />
				</Button>
				{primary.status !== 'regular' && (
					<Button
						variant="ghost"
						size="icon"
						type="button"
						className={cn('text-muted hover:text-primary', buttonClassName)}
						aria-label="Mark as regular"
						title="Mark as regular"
						disabled={markRegular.isPending}
						onClick={handleMarkRegular}
					>
						<RefreshCw size={15} />
					</Button>
				)}
			</span>
			{tipOpen &&
				pos &&
				createPortal(
					<div
						ref={tipRef}
						className="border-line bg-surface pointer-events-auto fixed z-[81] rounded-md border px-2.5 py-2 shadow-lg"
						style={{ top: pos.top, left: pos.left, width: pos.width }}
						role="tooltip"
						onMouseEnter={clearHide}
						onMouseLeave={scheduleHide}
					>
						<PurchaseHintInfo primary={primary} matches={matches} />
					</div>,
					document.body
				)}
		</>
	);
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
			<div className="flex flex-col gap-2 md:flex-col md:items-start md:justify-between md:gap-4">
				<PurchaseHintInfo primary={primary} matches={matches} onInteractStart={onInteractStart} />
				{isOwner && (
					<div className="flex w-full flex-col gap-1.5 sm:flex-row md:w-auto md:shrink-0">
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
