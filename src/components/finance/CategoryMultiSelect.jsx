import {
	Car,
	Clapperboard,
	HeartPulse,
	Home,
	MoreHorizontal,
	ShoppingBag,
	Star,
	Tag,
	UtensilsCrossed,
	Zap
} from 'lucide-react';

import { cn } from '../../lib/format';
import { IconChoice } from '../ui/IconChoice';

export const MAX_EXPENSE_CATEGORIES = 5;

/** Icons for system expense seeds (exact name). Custom / renamed → Tag. */
export const EXPENSE_SEED_ICONS = {
	Food: UtensilsCrossed,
	Transport: Car,
	Housing: Home,
	Utilities: Zap,
	Health: HeartPulse,
	Entertainment: Clapperboard,
	Shopping: ShoppingBag,
	Other: MoreHorizontal
};

export function categoryChoiceIcon(category) {
	if (!category?.is_system) return Tag;
	return EXPENSE_SEED_ICONS[category.name] || Tag;
}

/** Map category records to IconChoice options (`value`, `label`, `icon`). */
export function expenseCategoryOptions(categories = []) {
	return categories.map((c) => ({
		value: String(c.id),
		label: c.name,
		icon: categoryChoiceIcon(c)
	}));
}

/**
 * Multi-select for expense header categories (unordered labels, one primary).
 * IconChoice grid matching TransactionDetail (4 / 8 columns) with a primary star.
 */
export function CategoryMultiSelect({
	options = [],
	value = [],
	primaryId = null,
	max = MAX_EXPENSE_CATEGORIES,
	disabled = false,
	className,
	gridClassName,
	showCount = false,
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
		if (disabled) return;
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
		if (disabled) return;
		const n = Number(id);
		if (!selected.includes(n)) return;
		emit([n, ...selected.filter((x) => x !== n)], n);
	};

	return (
		<div
			className={cn(disabled && 'pointer-events-none opacity-60', className)}
			role="group"
			aria-label="Expense categories"
		>
			{options.length === 0 ? (
				<p className="text-muted px-0.5 py-1 text-xs">No expense categories.</p>
			) : (
				<div
					className={cn('grid grid-cols-4 gap-1.5 overflow-y-auto md:grid-cols-8', gridClassName)}
				>
					{options.map((opt) => {
						const id = Number(opt.value);
						const checked = selected.includes(id);
						const isPrimary = checked && primary === id;
						const atCap = !checked && selected.length >= max;
						const Icon = opt.icon || Tag;
						return (
							<div
								key={opt.value}
								className={cn(
									'relative flex min-w-0 flex-col items-center',
									checked && 'bg-primary/8 rounded-md'
								)}
							>
								<IconChoice
									icon={Icon}
									label={opt.label}
									selected={checked}
									disabled={disabled || atCap}
									onClick={() => toggle(id)}
									ariaLabel={
										checked ? `Deselect category ${opt.label}` : `Select category ${opt.label}`
									}
								/>
								{checked && (
									<button
										type="button"
										className={cn(
											'absolute top-0.5 right-0.5 cursor-pointer rounded p-0.5',
											'text-muted hover:text-primary',
											'focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-1',
											isPrimary && 'text-primary'
										)}
										title={isPrimary ? 'Primary category' : 'Set as primary'}
										aria-label={isPrimary ? 'Primary category' : `Set ${opt.label} as primary`}
										disabled={disabled}
										onClick={() => setPrimary(id)}
									>
										<Star size={11} fill={isPrimary ? 'currentColor' : 'none'} />
									</button>
								)}
							</div>
						);
					})}
				</div>
			)}
			{showCount ? (
				<p className="text-muted mt-1 text-[10px]">
					{selected.length}/{max} · star = primary
				</p>
			) : null}
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
