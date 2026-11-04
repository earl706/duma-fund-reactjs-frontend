import {
	addDays,
	addMonths,
	addWeeks,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameDay,
	isSameMonth,
	parseISO,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subMonths,
	subWeeks
} from 'date-fns';

export const CAL_GRAINS = [
	{ value: 'day', label: 'D', title: 'Day' },
	{ value: 'week', label: 'W', title: 'Week' },
	{ value: 'month', label: 'M', title: 'Month' }
];

export function parseAnchorDate(raw) {
	if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return startOfDay(new Date());
	const parsed = parseISO(raw);
	if (Number.isNaN(parsed.getTime())) return startOfDay(new Date());
	return startOfDay(parsed);
}

export function toISODate(date) {
	return format(date, 'yyyy-MM-dd');
}

/** Visible day cells for Apple-style month grid (Sun–Sat weeks). */
export function monthGridDays(anchor) {
	const monthStart = startOfMonth(anchor);
	const monthEnd = endOfMonth(anchor);
	const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
	const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
	return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

export function weekDays(anchor) {
	const start = startOfWeek(anchor, { weekStartsOn: 0 });
	const end = endOfWeek(anchor, { weekStartsOn: 0 });
	return eachDayOfInterval({ start, end });
}

/** Inclusive date_effective fetch window for the current grain. */
export function visibleRange(anchor, grain) {
	if (grain === 'day') {
		const d = startOfDay(anchor);
		return { start: d, end: d };
	}
	if (grain === 'week') {
		return {
			start: startOfWeek(anchor, { weekStartsOn: 0 }),
			end: endOfWeek(anchor, { weekStartsOn: 0 })
		};
	}
	const days = monthGridDays(anchor);
	return { start: days[0], end: days[days.length - 1] };
}

export function shiftAnchor(anchor, grain, direction) {
	const delta = direction < 0 ? -1 : 1;
	if (grain === 'day') return addDays(anchor, delta);
	if (grain === 'week') return delta < 0 ? subWeeks(anchor, 1) : addWeeks(anchor, 1);
	return delta < 0 ? subMonths(anchor, 1) : addMonths(anchor, 1);
}

export function rangeTitle(anchor, grain) {
	if (grain === 'day') return format(anchor, 'MMM d, yyyy');
	if (grain === 'week') {
		const { start, end } = visibleRange(anchor, 'week');
		if (format(start, 'yyyy-MM') === format(end, 'yyyy-MM')) {
			return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`;
		}
		return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
	}
	return format(anchor, 'MMMM yyyy');
}

export function isInflowType(type) {
	return type === 'income' || type === 'transfer_in';
}

export function isOutflowType(type) {
	return type === 'expense' || type === 'transfer_out';
}

export function groupByDate(transactions) {
	const map = new Map();
	for (const txn of transactions || []) {
		const key = txn.date_effective;
		if (!key) continue;
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(txn);
	}
	for (const list of map.values()) {
		list.sort((a, b) => {
			const ca = a.created_at || '';
			const cb = b.created_at || '';
			if (ca !== cb) return cb.localeCompare(ca);
			return (b.id || 0) - (a.id || 0);
		});
	}
	return map;
}

export function dayTotals(txns) {
	let moneyIn = 0;
	let moneyOut = 0;
	for (const txn of txns || []) {
		const amount = Number(txn.amount) || 0;
		if (isInflowType(txn.type)) moneyIn += amount;
		else if (isOutflowType(txn.type)) moneyOut += amount;
	}
	return { moneyIn, moneyOut, net: moneyIn - moneyOut };
}

/** Up to five newest transactions for a day cell. */
export function latestFive(txns) {
	return (txns || []).slice(0, 5);
}

/**
 * 24 zero-filled hour buckets from created_at local hour.
 * Ledger day is still date_effective; hour comes from created_at.
 */
export function hourSeries(txns) {
	const points = Array.from({ length: 24 }, (_, hour) => ({
		hour,
		label: String(hour).padStart(2, '0'),
		moneyIn: 0,
		moneyOut: 0
	}));
	for (const txn of txns || []) {
		if (!txn.created_at) continue;
		const dt =
			typeof txn.created_at === 'string' ? parseISO(txn.created_at) : new Date(txn.created_at);
		if (Number.isNaN(dt.getTime())) continue;
		const hour = dt.getHours();
		const amount = Number(txn.amount) || 0;
		if (isInflowType(txn.type)) points[hour].moneyIn += amount;
		else if (isOutflowType(txn.type)) points[hour].moneyOut += amount;
	}
	return points;
}

export function sameMonth(day, anchor) {
	return isSameMonth(day, anchor);
}

export function sameDay(a, b) {
	return isSameDay(a, b);
}

export { startOfDay, format, addDays };
