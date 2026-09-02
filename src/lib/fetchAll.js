import { get } from './api';

const PAGE_SIZE = 100;

/** Fetch every page of a paginated list endpoint. */
export async function fetchAllPages(path, params = {}) {
	const items = [];
	let page = 1;
	let totalPages = 1;
	while (page <= totalPages) {
		const data = await get(path, { params: { ...params, page, page_size: PAGE_SIZE } });
		items.push(...(data.results || []));
		totalPages = data.total_pages || 1;
		page += 1;
	}
	return items;
}
