import { useQuery } from '@tanstack/react-query';

import { createNestedResourceHooks, createResourceHooks } from '../hooks/useResource';
import { get } from './api';

export const costListsApi = createResourceHooks('cost-lists', '/cost-lists/');

export const costItemsApi = createNestedResourceHooks(
	'cost-items',
	(listId) => `/cost-lists/${listId}/items/`,
	{ parentKey: 'cost-lists' }
);

/** Dashboard spend / list activity time series. */
export function useCostAnalytics(params = {}, options = {}) {
	return useQuery({
		queryKey: ['cost-analytics', params],
		queryFn: () => get('/costs/analytics/', { params }),
		...options
	});
}
