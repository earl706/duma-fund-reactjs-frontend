import { api, post } from './api';
import { getActiveLlmCredentials } from '../stores/llmStore';

const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'L', 'mL'];

/** Max images / drafts in one Scan receipt session (matches backend). */
export const MAX_BULK_RECEIPTS = 10;

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
	const llm = getActiveLlmCredentials();
	if (llm) {
		form.append('llm_provider', llm.provider);
		form.append('llm_api_key', llm.apiKey);
		form.append('llm_model', llm.model);
	}
	const { data } = await api.post('/finance/transactions/scan-receipt/', form, {
		headers: { 'Content-Type': 'multipart/form-data' }
	});
	return data;
}

/**
 * Bulk OCR for 1–10 prepared images (cropped or full).
 * Returns { results: [{ index, ok, draft?|detail? }], summary }.
 */
export async function bulkScanReceipts(files) {
	if (!Array.isArray(files) || !files.length) {
		throw new Error('At least one image is required.');
	}
	if (files.length > MAX_BULK_RECEIPTS) {
		throw new Error(`At most ${MAX_BULK_RECEIPTS} images per batch.`);
	}
	const form = new FormData();
	form.append('count', String(files.length));
	files.forEach((file, index) => {
		form.append(`image_${index}`, file);
	});
	const llm = getActiveLlmCredentials();
	if (llm) {
		form.append('llm_provider', llm.provider);
		form.append('llm_api_key', llm.apiKey);
		form.append('llm_model', llm.model);
	}
	const { data } = await api.post('/finance/transactions/bulk-scan-receipts/', form, {
		headers: { 'Content-Type': 'multipart/form-data' }
	});
	return data;
}

function appendReceiptFields(
	form,
	{
		document_kind = 'retail_receipt',
		title,
		merchant,
		note,
		category_id,
		category_ids,
		date_effective,
		items,
		entries
	}
) {
	form.append('document_kind', document_kind || 'retail_receipt');
	form.append('title', title || '');
	form.append('merchant', merchant || '');
	form.append('note', note || '');
	if (category_id != null && category_id !== '') {
		form.append('category_id', String(category_id));
	}
	if (Array.isArray(category_ids) && category_ids.length) {
		form.append('category_ids', JSON.stringify(category_ids));
	}
	if (date_effective) form.append('date_effective', date_effective);
	if (document_kind === 'bank_slip') {
		form.append('entries', JSON.stringify(entries || []));
		form.append('items', JSON.stringify([]));
	} else {
		form.append('items', JSON.stringify(items || []));
		form.append('entries', JSON.stringify([]));
	}
}

/** Commit reviewed retail receipt as expense transaction + items. */
export async function commitReceipt({
	file,
	document_kind = 'retail_receipt',
	title,
	merchant,
	note,
	category_id,
	category_ids,
	date_effective,
	items,
	entries
}) {
	const form = new FormData();
	if (file) form.append('image', file);
	appendReceiptFields(form, {
		document_kind,
		title,
		merchant,
		note,
		category_id,
		category_ids,
		date_effective,
		items,
		entries
	});
	const { data } = await api.post('/finance/transactions/commit-receipt/', form, {
		headers: { 'Content-Type': 'multipart/form-data' }
	});
	return data;
}

/**
 * Commit 1–10 reviewed drafts in one request.
 * Each entry: { file?, document_kind, title, merchant, note, category_id?, category_ids?,
 *   date_effective?, items?, entries? }
 */
export async function commitReceiptsBulk(receipts) {
	if (!Array.isArray(receipts) || !receipts.length) {
		throw new Error('At least one receipt is required.');
	}
	if (receipts.length > MAX_BULK_RECEIPTS) {
		throw new Error(`At most ${MAX_BULK_RECEIPTS} receipts per batch.`);
	}

	const form = new FormData();
	const payloads = receipts.map(
		({
			document_kind = 'retail_receipt',
			title,
			merchant,
			note,
			category_id,
			category_ids,
			date_effective,
			items,
			entries
		}) => {
			const row = {
				document_kind: document_kind || 'retail_receipt',
				title: title || '',
				merchant: merchant || '',
				note: note || '',
				items: document_kind === 'bank_slip' ? [] : items || [],
				entries: document_kind === 'bank_slip' ? entries || [] : []
			};
			if (category_id != null && category_id !== '') {
				row.category_id = category_id;
			}
			if (Array.isArray(category_ids) && category_ids.length) {
				row.category_ids = category_ids;
			}
			if (date_effective) row.date_effective = date_effective;
			return row;
		}
	);
	form.append('receipts', JSON.stringify(payloads));
	receipts.forEach((r, index) => {
		if (r.file) form.append(`image_${index}`, r.file);
	});

	const { data } = await api.post('/finance/transactions/bulk-commit-receipts/', form, {
		headers: { 'Content-Type': 'multipart/form-data' }
	});
	return data;
}

export function formatBulkCommitSummary(summary) {
	const expenses = summary?.expense_count ?? 0;
	const bank = summary?.bank_txn_count ?? 0;
	const parts = [];
	if (expenses === 1) parts.push('1 expense');
	else if (expenses > 1) parts.push(`${expenses} expenses`);
	if (bank === 1) parts.push('1 transfer/income');
	else if (bank > 1) parts.push(`${bank} transfers/income`);
	if (!parts.length) return 'Logged receipts.';
	return `Logged ${parts.join(' and ')}.`;
}

/** First transaction id from single or bulk commit-receipt response. */
export function firstCommittedTransactionId(created) {
	if (!created) return null;
	const batch = created.results;
	if (Array.isArray(batch) && batch.length) {
		const first = batch[0];
		if (first?.document_kind === 'bank_slip') {
			return first.results?.[0]?.id ?? first.id ?? null;
		}
		// Bulk retail row, or single bank_slip { results: [txn, …] }
		if (first?.document_kind === 'retail_receipt' || first?.id != null) {
			return first.id ?? null;
		}
	}
	return created.id ?? null;
}

export async function reassignAndDeleteCategory(categoryId, targetCategoryId) {
	return post(`/finance/categories/${categoryId}/reassign-and-delete/`, {
		target_category_id: targetCategoryId
	});
}

export function draftRowKey(row, index) {
	return row._key || `row-${index}`;
}

export function normalizeDraftItems(items) {
	return (items || []).map((item, index) => ({
		_key: `draft-${index}-${Date.now()}`,
		title: item.title || '',
		cost: item.cost ?? '0.00',
		quantity: item.quantity ?? '1.00',
		unit: UNIT_OPTIONS.includes(item.unit) ? item.unit : 'pcs'
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
