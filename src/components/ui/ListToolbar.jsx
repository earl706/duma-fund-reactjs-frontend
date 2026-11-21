import { Search } from 'lucide-react';

import { cn } from '../../lib/format';
import { IconChoiceGroup } from './IconChoiceGroup';

/**
 * @param {object} props
 * @param {string} [props.search]
 * @param {(value: string) => void} [props.onSearchChange]
 * @param {string} [props.searchPlaceholder]
 * @param {string} [props.ordering]
 * @param {(value: string) => void} [props.onOrderingChange]
 * @param {{ value: string, label: string, icon?: import('lucide-react').LucideIcon }[]} [props.sortOptions]
 * @param {{ key: string, label: string, value: string, onChange: (v: string) => void, options: { value: string, label: string, title?: string, icon?: import('lucide-react').LucideIcon }[] }[]} [props.filters]
 * @param {import('react').ReactNode} [props.trailing] — aligned with filter controls (e.g. view toggle)
 * @param {string} [props.className]
 */
export function ListToolbar({
	search = '',
	onSearchChange,
	searchPlaceholder = 'Search…',
	ordering = '',
	onOrderingChange,
	sortOptions = [],
	filters = [],
	trailing = null,
	className
}) {
	return (
		<div
			className={cn(
				'mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between',
				className
			)}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
				{onSearchChange && (
					<div className="relative min-w-[12rem] flex-1 lg:max-w-xs">
						<Search
							size={16}
							className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
						/>
						<input
							type="search"
							value={search}
							onChange={(e) => onSearchChange(e.target.value)}
							placeholder={searchPlaceholder}
							className="border-line bg-surface text-fg placeholder:text-muted focus:border-primary w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
						/>
					</div>
				)}
				<div className="flex flex-wrap items-end gap-2">
					{sortOptions.length > 0 && onOrderingChange && (
						<div className="space-y-1">
							<p className="text-fg text-sm font-medium">Sort</p>
							<IconChoiceGroup
								groupKey="sort"
								ariaLabel="Sort"
								options={sortOptions}
								value={ordering}
								onChange={onOrderingChange}
							/>
						</div>
					)}
					{filters.map((filter) => (
						<div key={filter.key} className="space-y-1">
							{filter.label ? <p className="text-fg text-sm font-medium">{filter.label}</p> : null}
							<IconChoiceGroup
								groupKey={filter.key}
								ariaLabel={filter.label || filter.key}
								options={filter.options}
								value={filter.value}
								onChange={filter.onChange}
							/>
						</div>
					))}
				</div>
			</div>
			{trailing ? <div className="flex shrink-0 items-end justify-end">{trailing}</div> : null}
		</div>
	);
}
