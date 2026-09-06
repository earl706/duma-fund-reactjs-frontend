import { api, post } from './api';

const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'L', 'mL'];

export const BANK_TXN_TYPES = [
	{ value: 'income', label: 'Income' },
	{ value: 'transfer_in', label: 'Transfer in' },
	{ value: 'transfer_out', label: 'Transfer out' }
];

export function mediaUrl(path) {
	if (!path) return null;
	if (String(path).startsWith('http')) return path;
	const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
	const origin = apiBase.replace(/\/api\/?$/, '');
	return `${origin}${path}`;
}

/** Standalone scan — does not persist; client keeps the File for commit. */
export async function scanReceipt(file) {
	const form = new FormData();
	form.append('image', file);
	const { data } = await api.post('/finance/transactions/scan-receipt/', form, {
		headers: { 'Content-Type': 'multipart/form-data' }
	});
	return data;
}

/** Commit reviewed retail receipt as expense transaction + items. */
export async function commitReceipt({
	file,
	document_kind = 'retail_receipt',
	title,
	merchant,
	note,
	category_id,
	date_effective,
	items,
	entries
}) {
	const form = new FormData();
	if (file) form.append('image', file);
	form.append('document_kind', document_kind || 'retail_receipt');
	form.append('title', title || '');
	form.append('merchant', merchant || '');
	form.append('note', note || '');
	if (category_id != null && category_id !== '') {
		form.append('category_id', String(category_id));
	}
	if (date_effective) form.append('date_effective', date_effective);
	if (document_kind === 'bank_slip') {
		form.append('entries', JSON.stringify(entries || []));
		form.append('items', JSON.stringify([]));
	} else {
		form.append('items', JSON.stringify(items || []));
		form.append('entries', JSON.stringify([]));
	}
	const { data } = await api.post('/finance/transactions/commit-receipt/', form, {
		headers: { 'Content-Type': 'multipart/form-data' }
	});
	return data;
}

export async function reassignAndDeleteCategory(categoryId, targetCategoryId) {
	return post(`/finance/categories/${categoryId}/reassign-and-delete/`, {
		target_category_id: targetCategoryId
	});
}

export function draftRowKey(row, index) {
	return row._key || `row-${index}`;
}

export function normalizeDraftItems(items, fallbackCategoryId) {
	return (items || []).map((item, index) => ({
		_key: `draft-${index}-${Date.now()}`,
		title: item.title || '',
		cost: item.cost ?? '0.00',
		quantity: item.quantity ?? '1.00',
		unit: UNIT_OPTIONS.includes(item.unit) ? item.unit : 'pcs',
		category_id: item.category_id ?? fallbackCategoryId ?? ''
	}));
}

export function normalizeDraftBankEntries(entries, fallbackIncomeCategoryId) {
	return (entries || []).map((entry, index) => {
		const txnType = ['income', 'transfer_in', 'transfer_out'].includes(entry.txn_type)
			? entry.txn_type
			: 'transfer_in';
		return {
			_key: `bank-${index}-${Date.now()}`,
			txn_type: txnType,
			amount: entry.amount ?? '0.00',
			title: entry.title || '',
			merchant: entry.merchant || '',
			note: entry.note || '',
			date_effective: entry.date_effective || '',
			category_id: txnType === 'income' ? (entry.category_id ?? fallbackIncomeCategoryId ?? '') : ''
		};
	});
}

export { UNIT_OPTIONS };
