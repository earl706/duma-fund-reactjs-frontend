import { useQuery } from '@tanstack/react-query';

import { createNestedResourceHooks, createResourceHooks } from '../hooks/useResource';
import { get, patch } from './api';

export const categoriesApi = createResourceHooks('finance-categories', '/finance/categories/');

export const transactionsApi = createResourceHooks(
	'finance-transactions',
	'/finance/transactions/'
);

export const transactionItemsApi = createNestedResourceHooks(
	'finance-transaction-items',
	(txnId) => `/finance/transactions/${txnId}/items/`,
	{ parentKey: 'finance-transactions' }
);

export function useFinanceBalance(options = {}) {
	return useQuery({
		queryKey: ['finance-balance'],
		queryFn: () => get('/finance/balance/'),
		...options
	});
}

export function useFinanceAnalytics(params = {}, options = {}) {
	return useQuery({
		queryKey: ['finance-analytics', params],
		queryFn: () => get('/finance/analytics/', { params }),
		...options
	});
}

export async function updateStartingBalance(starting_balance) {
	return patch('/finance/balance/', { starting_balance });
}

/** @deprecated Use useFinanceAnalytics */
export function useCostAnalytics(params = {}, options = {}) {
	return useFinanceAnalytics(params, options);
}
