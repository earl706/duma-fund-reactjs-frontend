import { post } from './api';

/**
 * Map visible-list ↑/↓ to API move direction.
 * API `up` = toward default ordering start (-date_effective, day_order, …).
 * When the sheet is sorted ascending by date_effective, visual ↑ flips.
 */
export function apiDirectionForVisual(visualDirection, ordering = '') {
	const visual = visualDirection === 'up' ? 'up' : 'down';
	const primary = String(ordering || '')
		.split(',')[0]
		.trim();
	const ascendingDate = primary === 'date_effective';
	if (!ascendingDate) return visual;
	return visual === 'up' ? 'down' : 'up';
}

/**
 * POST /finance/transactions/{id}/move/
 * @returns {{ moved: boolean, patches: object[], results: object[] }}
 */
export async function moveTransaction(rowId, visualDirection, { ordering } = {}) {
	const direction = apiDirectionForVisual(visualDirection, ordering);
	const data = await post(`/finance/transactions/${rowId}/move/`, { direction });
	return {
		moved: Boolean(data?.moved),
		patches: Array.isArray(data?.patches) ? data.patches : [],
		results: Array.isArray(data?.results) ? data.results : []
	};
}
