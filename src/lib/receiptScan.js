import { api, getApiBaseURL, post } from './api';

const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'L', 'mL'];

/** Max images / drafts in one Scan receipt session (matches backend). */
export const MAX_BULK_RECEIPTS = 10;

/** Align with Nginx/Gunicorn OCR budgets (see VPS_DEPLOYMENT_BOILERPLATE). */
const SCAN_TIMEOUT_MS = 120_000;
const SCAN_AUTO_RETRY_DELAY_MS = 1500;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientScanDetail(detail = '') {
	const text = String(detail).toLowerCase();
	return (
		text.includes('temporarily unavailable') ||
		text.includes('503') ||
		text.includes('429') ||
		text.includes('could not parse') ||
		text.includes('timed out') ||
		text.includes('timeout') ||
		text.includes('rate limit') ||
		text.includes('overloaded') ||
		text.includes('try again') ||
		text.includes('retry shortly')
	);
}

function shouldAutoRetryScanData(data) {
	const results = data?.results;
	if (!Array.isArray(results) || !results.length) return false;
	return results.every((row) => !row?.ok && isTransientScanDetail(row?.detail));
}

function isTransientAxiosError(err) {
	if (!err) return false;
	if (!err.response) {
		const code = err.code || '';
		const message = String(err.message || '').toLowerCase();
		return (
			code === 'ECONNABORTED' ||
			code === 'ERR_NETWORK' ||
			message.includes('timeout') ||
			message.includes('network')
		);
	}
	const status = err.response.status;
	if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
		return true;
	}
	const detail = err.response?.data?.detail;
	return typeof detail === 'string' && isTransientScanDetail(detail);
}

/**
 * Multipart OCR post: omit Content-Type so the browser sets boundary;
 * one automatic retry for cold-start / gateway flakiness.
 */
async function postReceiptScan(url, buildForm) {
	const config = { timeout: SCAN_TIMEOUT_MS };
	const attempt = async () => {
		const form = buildForm();
		const { data } = await api.post(url, form, config);
		return data;
	};

	try {
		const data = await attempt();
		if (shouldAutoRetryScanData(data)) {
			await sleep(SCAN_AUTO_RETRY_DELAY_MS);
			return attempt();
		}
		return data;
	} catch (err) {
		if (!isTransientAxiosError(err)) throw err;
		await sleep(SCAN_AUTO_RETRY_DELAY_MS);
		return attempt();
	}
}

export const BANK_TXN_TYPES = [
	{ value: 'income', label: 'Income' },
	{ value: 'transfer_in', label: 'Transfer in' },
	{ value: 'transfer_out', label: 'Transfer out' }
];

export function mediaUrl(path) {
	if (!path) return null;
	if (String(path).startsWith('http')) return path;
	const apiBase = getApiBaseURL();
	const origin = apiBase.replace(/\/api\/?$/, '');
	return `${origin}${path}`;
}

/** Standalone scan — does not persist; client keeps the File for commit. */
export async function scanReceipt(file) {
	return postReceiptScan('/finance/transactions/scan-receipt/', () => {
		const form = new FormData();
		form.append('image', file);
		return form;
	});
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
	return postReceiptScan('/finance/transactions/bulk-scan-receipts/', () => {
		const form = new FormData();
		form.append('count', String(files.length));
		files.forEach((file, index) => {
			form.append(`image_${index}`, file);
		});
		return form;
	});
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
		source_id,
		is_partial,
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
	if (source_id != null && source_id !== '') {
		form.append('source_id', String(source_id));
	}
	if (document_kind !== 'bank_slip' && is_partial) {
		form.append('is_partial', 'true');
	}
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
	source_id,
	is_partial,
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
		source_id,
		is_partial,
		items,
		entries
	});
	// Let the browser set multipart boundary (do not force Content-Type).
	const { data } = await api.post('/finance/transactions/commit-receipt/', form);
	return data;
}

/**
 * Commit 1–10 reviewed drafts in one request.
 * Each entry: { file?, document_kind, title, merchant, note, category_id?, category_ids?,
 *   date_effective?, source_id?, is_partial?, items?, entries? }
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
			source_id,
			is_partial,
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
			if (source_id != null && source_id !== '') row.source_id = source_id;
			if (document_kind !== 'bank_slip' && is_partial) row.is_partial = true;
			return row;
		}
	);
	form.append('receipts', JSON.stringify(payloads));
	receipts.forEach((r, index) => {
		if (r.file) form.append(`image_${index}`, r.file);
	});

	const { data } = await api.post('/finance/transactions/bulk-commit-receipts/', form);
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
			category_id:
				txnType === 'income' ? (entry.category_id ?? fallbackIncomeCategoryId ?? '') : '',
			source_id: entry.source_id ?? ''
		};
	});
}

export { UNIT_OPTIONS };
