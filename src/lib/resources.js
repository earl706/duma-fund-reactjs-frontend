import { createNestedResourceHooks, createResourceHooks } from '../hooks/useResource';

export const costListsApi = createResourceHooks('cost-lists', '/cost-lists/');

export const costItemsApi = createNestedResourceHooks(
	'cost-items',
	(listId) => `/cost-lists/${listId}/items/`,
	{ parentKey: 'cost-lists' }
);
