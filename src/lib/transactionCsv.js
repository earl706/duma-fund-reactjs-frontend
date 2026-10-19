import { parseDateShort } from './format';

export const CSV_COLUMNS = [
	'row_type',
	'type',
	'title',
	'merchant',
	'amount',
	'note',
	'categories',
	'status',
	'date_created',
	'date_effective',
	'item_title',
	'item_cost',
	'item_quantity',
	'item_unit',
	'item_status'
];

const HEADER_ALIASES = {
	row: 'row_type',
	kind: 'row_type',
	record_type: 'row_type',
	store: 'merchant',
	category: 'categories',
	date: 'date_effective',
	effective: 'date_effective',
	created: 'date_created'
};

const TYPE_ALIASES = {
	expense: 'expense',
	income: 'income',
	transfer_in: 'transfer_in',
	'transfer in': 'transfer_in',
	'transfer-in': 'transfer_in',
	transferin: 'transfer_in',
	transfer_out: 'transfer_out',
	'transfer out': 'transfer_out',
	'transfer-out': 'transfer_out',
	transferout: 'transfer_out'
};

const ITEM_ROW_TYPES = new Set(['item', 'line', 'line_item', 'txn_item']);
const TXN_ROW_TYPES = new Set(['txn', 'transaction', 'header', 'row']);
const VALID_UNITS = new Set(['pcs', 'kg', 'g', 'L', 'mL']);
const UNIT_ALIASES = { ml: 'mL', l: 'L', pc: 'pcs', piece: 'pcs', pieces: 'pcs' };

export async function mapLimit(items, limit, mapper) {
	if (!items.length) return [];
	const results = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const index = next;
			next += 1;
			results[index] = await mapper(items[index], index);
		}
	});
	await Promise.all(workers);
	return results;
}

export function categoryPath(cat, byId) {
	if (!cat) return '';
	const parent = cat.parent != null ? byId.get(cat.parent) : null;
	return parent ? `${parent.name} › ${cat.name}` : cat.name;
}

export function defaultCategoryId(categories, kind) {
	const list = categories.filter((c) => c.kind === kind);
	return list.find((c) => c.name === 'Other' && !c.parent)?.id || list[0]?.id || null;
}

/**
 * Match imported names (or numeric ids) to existing categories of `kind`.
 * Unknown names are ignored; caller supplies the Other/fallback id.
 */
export function resolveCategories(rawNames, kind, categories, fallbackId, max = 5) {
	const byId = new Map(categories.map((c) => [c.id, c]));
	const ofKind = categories.filter((c) => c.kind === kind);
	const byPath = new Map();
	const byName = new Map();
	for (const cat of ofKind) {
		byPath.set(categoryPath(cat, byId).toLowerCase(), cat);
		byName.set(String(cat.name).toLowerCase(), cat);
	}

	const names = Array.isArray(rawNames)
		? rawNames
		: String(rawNames || '')
				.split(/[|;]/)
				.map((s) => s.trim())
				.filter(Boolean);

	const matched = [];
	const unmatched = [];
	const seen = new Set();
	for (const raw of names) {
		const key = String(raw).trim();
		if (!key) continue;
		let cat = null;
		if (/^\d+$/.test(key)) cat = byId.get(Number(key));
		if (!cat) cat = byPath.get(key.toLowerCase());
		if (!cat) cat = byName.get(key.toLowerCase());
		if (!cat || cat.kind !== kind) {
			unmatched.push(key);
			continue;
		}
		if (seen.has(cat.id)) continue;
		seen.add(cat.id);
		matched.push(cat.id);
		if (matched.length >= max) break;
	}

	if (!matched.length) {
		return { category: fallbackId, categories: fallbackId != null ? [fallbackId] : [], unmatched };
	}
	return { category: matched[0], categories: matched, unmatched };
}

export function serializeTransactionsCsv(records) {
	const lines = [CSV_COLUMNS.map(escapeCsvField).join(',')];
	for (const rec of records) {
		const cats = (rec.categoryNames || []).filter(Boolean).join('|');
		lines.push(
			csvLine({
				row_type: 'txn',
				type: rec.type || '',
				title: rec.title || '',
				merchant: rec.merchant || '',
				amount: rec.amount ?? '',
				note: rec.note || '',
				categories: cats,
				status: rec.status || 'active',
				date_created: rec.date_created || '',
				date_effective: rec.date_effective || ''
			})
		);
		for (const item of rec.items || []) {
			lines.push(
				csvLine({
					row_type: 'item',
					item_title: item.title || '',
					item_cost: item.cost ?? '',
					item_quantity: item.quantity ?? '1.00',
					item_unit: item.unit || 'pcs',
					item_status: item.status || 'active'
				})
			);
		}
	}
	return `${lines.join('\n')}\n`;
}

/**
 * Parse a ledger CSV. Supports the exported txn/item layout and a flat
 * one-row-per-transaction sheet (row_type optional).
 */
export function parseTransactionsCsv(text) {
	const warnings = [];
	const raw = String(text || '').replace(/^\uFEFF/, '');
	if (!raw.trim()) {
		return { transactions: [], warnings: ['The file is empty.'] };
	}

	const firstLine = raw.split(/\r?\n/).find((line) => line.trim()) || '';
	const delimiter = detectDelimiter(firstLine);
	const table = parseCsvTable(raw, delimiter);
	if (!table.length) {
		return { transactions: [], warnings: ['No rows found.'] };
	}

	const header = table[0].map((h) => normalizeHeader(h));
	if (!header.includes('type') && !header.includes('title') && !header.includes('row_type')) {
		return {
			transactions: [],
			warnings: ['Missing a header row. Expected columns such as type, title, amount.']
		};
	}

	const transactions = [];
	let current = null;

	table.slice(1).forEach((cells, index) => {
		const rowNum = index + 2;
		if (cells.every((c) => !String(c || '').trim())) return;
		const row = Object.fromEntries(header.map((key, i) => [key, cells[i] ?? '']));
		const rowType = String(row.row_type || '')
			.trim()
			.toLowerCase();

		if (ITEM_ROW_TYPES.has(rowType) || isItemOnlyRow(row)) {
			if (!current) {
				warnings.push(`Row ${rowNum}: item has no preceding transaction.`);
				return;
			}
			const item = parseItem(row, rowNum, warnings);
			if (item) current.items.push(item);
			return;
		}

		if (rowType && !TXN_ROW_TYPES.has(rowType) && !ITEM_ROW_TYPES.has(rowType)) {
			warnings.push(`Row ${rowNum}: unknown row_type "${row.row_type}".`);
			return;
		}

		const txn = parseTransaction(row, rowNum, warnings);
		if (!txn) return;
		const inlineItem = parseItem(row, rowNum, warnings, { optional: true });
		if (inlineItem) txn.items.push(inlineItem);
		transactions.push(txn);
		current = txn;
	});

	return { transactions, warnings };
}

function parseTransaction(row, rowNum, warnings) {
	const type =
		TYPE_ALIASES[
			String(row.type || '')
				.trim()
				.toLowerCase()
		];
	if (!type) {
		warnings.push(`Row ${rowNum}: skipped (unknown type "${row.type || ''}").`);
		return null;
	}

	const amount = parseAmount(row.amount);
	if (amount == null) {
		warnings.push(`Row ${rowNum}: skipped (invalid amount).`);
		return null;
	}

	const dateEffective = parseFlexibleDate(row.date_effective) || parseFlexibleDate(row.date);
	const dateCreated = parseFlexibleDate(row.date_created);
	if (row.date_effective && !dateEffective) {
		warnings.push(`Row ${rowNum}: invalid date_effective, using today.`);
	}

	const status = normalizeStatus(row.status);
	return {
		type,
		title: String(row.title || '').trim(),
		merchant: String(row.merchant || '').trim(),
		amount,
		note: String(row.note || ''),
		categoryNames: String(row.categories || '')
			.split(/[|;]/)
			.map((s) => s.trim())
			.filter(Boolean),
		status,
		date_created: dateCreated,
		date_effective: dateEffective,
		items: []
	};
}

function parseItem(row, rowNum, warnings, { optional = false } = {}) {
	const title = String(row.item_title || '').trim();
	if (!title) {
		if (!optional && String(row.item_cost || '').trim()) {
			warnings.push(`Row ${rowNum}: item skipped (missing item_title).`);
		}
		return null;
	}
	const cost = parseAmount(row.item_cost);
	if (cost == null) {
		warnings.push(`Row ${rowNum}: item "${title}" skipped (invalid cost).`);
		return null;
	}
	const quantity = parseAmount(row.item_quantity ?? '1');
	return {
		title,
		cost,
		quantity: quantity == null ? '1.00' : quantity,
		unit: normalizeUnit(row.item_unit),
		status: normalizeStatus(row.item_status)
	};
}

function isItemOnlyRow(row) {
	const hasItem = Boolean(String(row.item_title || '').trim());
	const hasTxn = Boolean(String(row.type || '').trim() || String(row.title || '').trim());
	return hasItem && !hasTxn;
}

export function parseAmount(value) {
	if (value == null || value === '') return '0.00';
	let s = String(value).trim().replace(/,/g, '');
	s = s.replace(/^[+$€£₱\s]+/u, '');
	s = s.replace(/^[−–—-]/, '');
	s = s.replace(/[^0-9.]/g, '');
	if (!s) return null;
	const n = Number(s);
	if (!Number.isFinite(n)) return null;
	return n.toFixed(2);
}

function parseFlexibleDate(value) {
	if (value == null || !String(value).trim()) return null;
	return parseDateShort(String(value).trim());
}

function normalizeStatus(value) {
	const s = String(value || '')
		.trim()
		.toLowerCase();
	return s === 'archived' ? 'archived' : 'active';
}

function normalizeUnit(value) {
	const raw = String(value || 'pcs').trim();
	if (VALID_UNITS.has(raw)) return raw;
	return UNIT_ALIASES[raw.toLowerCase()] || 'pcs';
}

function normalizeHeader(value) {
	const key = String(value || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '_');
	return HEADER_ALIASES[key] || key;
}

function detectDelimiter(headerLine) {
	let commas = 0;
	let semis = 0;
	let inQuotes = false;
	for (const ch of headerLine) {
		if (ch === '"') {
			inQuotes = !inQuotes;
			continue;
		}
		if (inQuotes) continue;
		if (ch === ',') commas += 1;
		if (ch === ';') semis += 1;
	}
	return semis > commas ? ';' : ',';
}

function escapeCsvField(value) {
	const s = value == null ? '' : String(value);
	if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

function csvLine(fields) {
	return CSV_COLUMNS.map((key) => escapeCsvField(fields[key] ?? '')).join(',');
}

function parseCsvTable(text, delimiter) {
	const rows = [];
	let row = [];
	let field = '';
	let inQuotes = false;
	const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

	for (let i = 0; i < input.length; i += 1) {
		const ch = input[i];
		if (inQuotes) {
			if (ch === '"') {
				if (input[i + 1] === '"') {
					field += '"';
					i += 1;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
			continue;
		}
		if (ch === delimiter) {
			row.push(field);
			field = '';
			continue;
		}
		if (ch === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			continue;
		}
		field += ch;
	}
	if (inQuotes || field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}
