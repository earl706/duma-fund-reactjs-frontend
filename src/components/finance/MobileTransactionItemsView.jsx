import { Plus, ShoppingBag, Trash2 } from 'lucide-react';

import { cn } from '../../lib/format';
import { Button, EmptyState } from '../ui';
import { CostAmount } from './CostAmount';

function formatQty(value) {
	return Number(value ?? 0).toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	});
}

function lineTotal(item) {
	return Number(item.cost || 0) * Number(item.quantity || 0);
}

function itemSubtitleParts(row) {
	const qty = `${formatQty(row.quantity)} ${row.unit || 'pcs'}`;
	const archived = row.status === 'archived' ? ' · Archived' : '';
	return { qty, cost: row.cost, archived };
}

/**
 * iOS line-item ledger: tappable rows (title + qty/price · total), trailing delete.
 */
export function MobileTransactionItemsView({
	rows,
	canEdit = false,
	adding = false,
	onAdd,
	onOpenItem,
	onRequestDelete
}) {
	if (rows.length === 0) {
		return (
			<EmptyState
				icon={ShoppingBag}
				title="No line items"
				description="Add rows or scan a receipt."
				action={
					canEdit && onAdd ? (
						<Button onClick={onAdd} loading={adding}>
							<Plus size={16} /> Add item
						</Button>
					) : null
				}
			/>
		);
	}

	return (
		<ul className="divide-line divide-y">
			{rows.map((row) => (
				<li key={row.id} className="flex items-center gap-0.5">
					<button
						type="button"
						onClick={() => onOpenItem?.(row)}
						className={cn(
							'flex min-h-17 min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 text-left select-none',
							row.status === 'archived' && 'opacity-55'
						)}
					>
						<div className="min-w-0 flex-1">
							<p className="text-fg truncate text-[15px] font-medium">{row.title || 'Untitled'}</p>
							<p className="text-muted mt-0.5 truncate text-xs">
								{(() => {
									const parts = itemSubtitleParts(row);
									return (
										<>
											{parts.qty} · <CostAmount value={parts.cost} className="text-muted" />
											{parts.archived}
										</>
									);
								})()}
							</p>
						</div>
						<CostAmount
							value={lineTotal(row)}
							className="text-fg shrink-0 text-[15px] font-semibold"
						/>
					</button>
					{canEdit && onRequestDelete && (
						<Button
							variant="ghost"
							size="icon"
							className="text-muted hover:text-danger h-11 w-11 shrink-0 rounded-full"
							onClick={() => onRequestDelete(row)}
							aria-label={`Delete ${row.title || 'item'}`}
						>
							<Trash2 size={18} />
						</Button>
					)}
				</li>
			))}
		</ul>
	);
}
