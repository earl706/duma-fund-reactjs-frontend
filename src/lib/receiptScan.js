import { api, post } from './api';

const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'L', 'mL'];

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

/** Commit reviewed receipt as expense transaction + items. */
export async function commitReceipt({ file, title, note, category_id, date_effective, items }) {
	const form = new FormData();
	if (file) form.append('image', file);
	form.append('title', title || '');
	form.append('note', note || '');
	form.append('category_id', String(category_id));
	if (date_effective) form.append('date_effective', date_effective);
	form.append('items', JSON.stringify(items));
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

export function normalizeDraftItems(items, dateEffective, fallbackCategoryId) {
	return (items || []).map((item, index) => ({
		_key: `draft-${index}-${Date.now()}`,
		title: item.title || '',
		cost: item.cost ?? '0.00',
		quantity: item.quantity ?? '1.00',
		unit: UNIT_OPTIONS.includes(item.unit) ? item.unit : 'pcs',
		category_id: item.category_id ?? fallbackCategoryId ?? '',
		date_effective: item.date_effective || dateEffective || ''
	}));
}

export { UNIT_OPTIONS };
