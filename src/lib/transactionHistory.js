import { del, patch, post } from './api';
import { fetchAllPages } from './fetchAll';

const HEADER_KEYS = [
	'type',
	'amount',
	'fee',
	'title',
	'merchant',
	'note',
	'source',
	'to_source',
	'category',
	'categories',
	'is_partial',
	'status',
	'date_created',
	'date_effective'
];

function todayISO() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function categoryIdsFromRow(row) {
	if (row?.categories?.length) return row.categories.map(Number);
	if (row?.category != null) return [Number(row.category)];
	return [];
}

/** Writable header fields for POST /finance/transactions/. */
export function headerFromRow(row, { dates = 'preserve' } = {}) {
	const isTransfer = row.type === 'transfer_in' || row.type === 'transfer_out';
	const categoryIds = categoryIdsFromRow(row);
	const dateToday = todayISO();
	const dateCreated = dates === 'today' ? dateToday : row.date_created || dateToday;
	const dateEffective = dates === 'today' ? dateToday : row.date_effective || dateToday;
	return {
		type: row.type,
		title: row.title || '',
		merchant: row.merchant || '',
		amount: row.amount ?? '0.00',
		fee: row.fee ?? '0.00',
		note: row.note || '',
		source: row.source ?? undefined,
		to_source: row.type === 'transfer_out' ? (row.to_source ?? null) : null,
		category: isTransfer ? null : (row.category ?? null),
		categories: isTransfer ? [] : categoryIds,
		is_partial: row.type === 'expense' ? Boolean(row.is_partial) : false,
		status: row.status || 'active',
		date_created: dateCreated,
		date_effective: dateEffective
	};
}

export async function fetchItemSnapshots(transactionId) {
	if (transactionId == null) return [];
	const items = await fetchAllPages(`/finance/transactions/${transactionId}/items/`);
	return (items || []).map((item) => ({
		title: item.title,
		cost: item.cost,
		quantity: item.quantity,
		unit: item.unit,
		status: item.status
	}));
}

/**
 * Full recreate payload: header + items[].
 * @param {'preserve'|'today'} [opts.dates]
 */
export async function buildTransactionSnapshot(row, { dates = 'preserve' } = {}) {
	const header = headerFromRow(row, { dates });
	let items = [];
	if (row?.type === 'expense' && Number(row.item_count) > 0 && row.id != null) {
		items = await fetchItemSnapshots(row.id);
	} else if (Array.isArray(row?.items)) {
		items = row.items;
	}
	return { ...header, items };
}

/** Snapshot from a create/PATCH-shaped body (no server fetch). */
export function snapshotFromBody(body, items = []) {
	const header = {};
	for (const key of HEADER_KEYS) {
		if (Object.prototype.hasOwnProperty.call(body, key)) header[key] = body[key];
	}
	if (header.categories != null) {
		header.categories = Array.isArray(header.categories) ? header.categories.map(Number) : [];
	}
	return { ...header, items: items || [] };
}

export async function recreateFromSnapshot(snapshot) {
	const { items = [], ...header } = snapshot || {};
	const body = { ...header };
	if (body.source === null || body.source === '') delete body.source;
	if (body.to_source == null) {
		if (body.type !== 'transfer_out') delete body.to_source;
	}
	const created = await post('/finance/transactions/', body);
	if (created?.id != null && items.length && body.type === 'expense') {
		await Promise.all(
			items.map((item) =>
				post(`/finance/transactions/${created.id}/items/`, {
					title: item.title,
					cost: item.cost,
					quantity: item.quantity,
					unit: item.unit,
					status: item.status
				})
			)
		);
	}
	return created;
}

/** Pick before-values for keys present in `after` from a live row. */
export function editBeforeFromRow(row, after) {
	const before = {};
	for (const key of Object.keys(after || {})) {
		if (key === 'id') continue;
		before[key] = row?.[key] ?? null;
	}
	return before;
}

async function applyReorderPatches(patches, direction, resolveId) {
	const list = Array.isArray(patches) ? patches : [];
	// Undo applies reverse order so shifted day_orders unwind cleanly.
	const ordered = direction === 'undo' ? [...list].reverse() : list;
	for (const entry of ordered) {
		const body = direction === 'undo' ? entry.before : entry.after;
		const liveId = resolveId(entry.id);
		if (!body || liveId == null) throw new Error('Missing reorder patch');
		await patch(`/finance/transactions/${liveId}/`, body);
	}
}

export async function applyHistoryCommand(cmd, direction, { resolveId, remapId }) {
	if (!cmd?.type) throw new Error('Invalid history command');
	const liveId = resolveId(cmd.id);

	if (cmd.type === 'edit') {
		const body = direction === 'undo' ? cmd.before : cmd.after;
		if (!body || liveId == null) throw new Error('Missing edit payload');
		await patch(`/finance/transactions/${liveId}/`, body);
		return;
	}

	if (cmd.type === 'reorder') {
		await applyReorderPatches(cmd.patches, direction, resolveId);
		return;
	}

	if (cmd.type === 'create') {
		if (direction === 'undo') {
			if (liveId == null) throw new Error('Missing create id');
			await del(`/finance/transactions/${liveId}/`);
			return;
		}
		const created = await recreateFromSnapshot(cmd.snapshot);
		if (created?.id == null) throw new Error('Could not recreate transaction');
		remapId(cmd.id, created.id);
		return;
	}

	if (cmd.type === 'delete') {
		if (direction === 'undo') {
			const created = await recreateFromSnapshot(cmd.snapshot);
			if (created?.id == null) throw new Error('Could not restore transaction');
			remapId(cmd.id, created.id);
			return;
		}
		if (liveId == null) throw new Error('Missing delete id');
		await del(`/finance/transactions/${liveId}/`);
		return;
	}

	throw new Error(`Unknown history command: ${cmd.type}`);
}
