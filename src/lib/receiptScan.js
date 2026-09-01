import { api, post } from './api';

const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'L', 'mL'];

export function mediaUrl(path) {
	if (!path) return null;
	if (String(path).startsWith('http')) return path;
	const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
	const origin = apiBase.replace(/\/api\/?$/, '');
	return `${origin}${path}`;
}

export async function scanReceipt(listId, file) {
	const form = new FormData();
	form.append('image', file);
	const { data } = await api.post(`/cost-lists/${listId}/scan-receipt/`, form, {
		headers: { 'Content-Type': 'multipart/form-data' }
	});
	return data;
}

export async function bulkImportItems(listId, payload) {
	return post(`/cost-lists/${listId}/items/bulk/`, payload);
}

export function draftRowKey(row, index) {
	return row._key || `row-${index}`;
}

export function normalizeDraftItems(items, dateEffective) {
	return (items || []).map((item, index) => ({
		_key: `draft-${index}-${Date.now()}`,
		title: item.title || '',
		cost: item.cost ?? '0.00',
		quantity: item.quantity ?? '1.00',
		unit: UNIT_OPTIONS.includes(item.unit) ? item.unit : 'pcs',
		date_effective: item.date_effective || dateEffective || ''
	}));
}

export { UNIT_OPTIONS };
