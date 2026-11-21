import {
	Archive,
	ArrowDownWideNarrow,
	ArrowUpDown,
	ArrowUpWideNarrow,
	Calendar,
	CalendarClock,
	CalendarDays,
	CalendarRange,
	CheckCircle2,
	List,
	ListFilter
} from 'lucide-react';

import { cn } from '../../lib/format';
import { IconChoice } from './IconChoice';

/** Built-in icons for known toolbar / calendar / view option keys (4B). */
const KNOWN_ICONS = {
	'horizon:': CalendarDays,
	'horizon:upcoming': CalendarClock,
	'status:': ListFilter,
	'status:active': CheckCircle2,
	'status:archived': Archive,
	'view:list': List,
	'view:calendar': Calendar,
	'grain:day': CalendarDays,
	'grain:week': CalendarRange,
	'grain:month': Calendar,
	list: List,
	calendar: Calendar,
	day: CalendarDays,
	week: CalendarRange,
	month: Calendar
};

function resolveIcon(groupKey, opt) {
	if (opt?.icon) return opt.icon;
	const value = opt?.value == null ? '' : String(opt.value);
	if (groupKey) {
		const keyed = KNOWN_ICONS[`${groupKey}:${value}`];
		if (keyed) return keyed;
	}
	if (KNOWN_ICONS[value]) return KNOWN_ICONS[value];
	if (groupKey === 'sort') {
		if (!value) return ArrowUpDown;
		return value.startsWith('-') ? ArrowDownWideNarrow : ArrowUpWideNarrow;
	}
	return null;
}

/**
 * Single-select IconChoice row (CategoryMultiSelect chrome, compact toolbar layout).
 * Same call shape as the old SegmentedToggle: options[{ value, label, title?, icon? }].
 */
export function IconChoiceGroup({
	options = [],
	value,
	onChange,
	ariaLabel,
	groupKey = '',
	className,
	choiceClassName
}) {
	const stringValue = value == null ? '' : String(value);

	return (
		<div
			className={cn('inline-flex max-w-full flex-wrap', className)}
			role="group"
			aria-label={ariaLabel}
		>
			{options.map((opt) => {
				const optValue = opt.value == null ? '' : String(opt.value);
				const selected = stringValue === optValue;
				const Icon = resolveIcon(groupKey, opt);
				const label = opt.label || optValue || '—';
				return (
					<div
						key={optValue === '' ? `${groupKey || 'choice'}__empty` : optValue}
						className="relative flex shrink-0 flex-col items-center"
					>
						<IconChoice
							icon={Icon || undefined}
							label={label}
							selected={selected}
							truncateLabel={false}
							onClick={() => onChange?.(optValue)}
							ariaLabel={opt.title || label}
							title={opt.title || label}
							className={cn('w-auto min-w-[4.5rem] flex-none px-3', choiceClassName)}
						/>
					</div>
				);
			})}
		</div>
	);
}

/** @deprecated Prefer IconChoiceGroup — kept for calendar/Transactions imports. */
export function SegmentedToggle(props) {
	return <IconChoiceGroup {...props} />;
}
