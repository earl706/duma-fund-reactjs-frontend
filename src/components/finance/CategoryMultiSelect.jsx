import { Star } from 'lucide-react';

import { cn } from '../../lib/format';

export const MAX_EXPENSE_CATEGORIES = 5;

/**
 * Multi-select for expense header categories (unordered labels, one primary).
 * `value` is the full selected id list; `primaryId` must be one of them.
 */
export function CategoryMultiSelect({
	options = [],
	value = [],
	primaryId = null,
	max = MAX_EXPENSE_CATEGORIES,
	disabled = false,
	className,
	onChange
}) {
	const selected = (value || []).map(Number).filter((id) => !Number.isNaN(id));
	const primary = primaryId != null ? Number(primaryId) : (selected[0] ?? null);

	const emit = (ids, nextPrimary) => {
		const unique = [];
		const seen = new Set();
		for (const id of ids) {
			const n = Number(id);
			if (seen.has(n)) continue;
			seen.add(n);
			unique.push(n);
		}
		const capped = unique.slice(0, max);
		let p = nextPrimary != null ? Number(nextPrimary) : primary;
		if (!capped.includes(p)) p = capped[0] ?? null;
		onChange?.({ ids: capped, primaryId: p });
	};

	const toggle = (id) => {
		const n = Number(id);
		if (selected.includes(n)) {
			if (selected.length <= 1) return;
			emit(
				selected.filter((x) => x !== n),
				primary === n ? null : primary
			);
		} else if (selected.length < max) {
			emit([...selected, n], primary ?? n);
		}
	};

	const setPrimary = (id) => {
		const n = Number(id);
		if (!selected.includes(n)) return;
		emit([n, ...selected.filter((x) => x !== n)], n);
	};

	return (
		<div
			className={cn(
				'border-line bg-surface max-h-48 space-y-0.5 overflow-y-auto rounded-md border p-1.5',
				disabled && 'pointer-events-none opacity-60',
				className
			)}
			role="group"
			aria-label="Expense categories"
		>
			{options.length === 0 ? (
				<p className="text-muted px-1.5 py-1 text-xs">No expense categories.</p>
			) : (
				options.map((opt) => {
					const id = Number(opt.value);
					const checked = selected.includes(id);
					const isPrimary = checked && primary === id;
					const atCap = !checked && selected.length >= max;
					return (
						<label
							key={opt.value}
							className={cn(
								'hover:bg-surface-2 flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs',
								atCap && 'opacity-40'
							)}
						>
							<input
								type="checkbox"
								className="accent-primary"
								checked={checked}
								disabled={disabled || atCap}
								onChange={() => toggle(id)}
							/>
							<span className="text-fg min-w-0 flex-1 truncate">{opt.label}</span>
							{checked && (
								<button
									type="button"
									className={cn(
										'text-muted hover:text-primary shrink-0 rounded p-0.5',
										isPrimary && 'text-primary'
									)}
									title={isPrimary ? 'Primary category' : 'Set as primary'}
									aria-label={isPrimary ? 'Primary category' : 'Set as primary'}
									onClick={(e) => {
										e.preventDefault();
										setPrimary(id);
									}}
								>
									<Star size={12} fill={isPrimary ? 'currentColor' : 'none'} />
								</button>
							)}
						</label>
					);
				})
			)}
			<p className="text-muted px-1.5 pt-0.5 text-[10px]">
				{selected.length}/{max} · star = primary
			</p>
		</div>
	);
}

/** Display helper: "Food, Health, Shopping, +2" (up to 3 names, then remainder count). */
export function formatCategoryTags(ids, categoryMap, primaryId = null, maxNames = 3) {
	const list = (ids || []).map(Number).filter(Boolean);
	if (!list.length) return '—';
	const primary = primaryId != null ? Number(primaryId) : list[0];
	const ordered = primary ? [primary, ...list.filter((id) => id !== primary)] : list;
	const names = ordered.map((id) => categoryMap.get(id)?.name || `#${id}`);
	if (names.length <= maxNames) return names.join(', ');
	const shown = names.slice(0, maxNames);
	const rest = names.length - maxNames;
	return `${shown.join(', ')}, +${rest}`;
}
