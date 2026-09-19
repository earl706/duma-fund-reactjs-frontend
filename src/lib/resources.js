import { useQuery } from '@tanstack/react-query';

import { createNestedResourceHooks, createResourceHooks } from '../hooks/useResource';
import { useActiveProfileId } from '../stores/profileStore';
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
	const profileId = useActiveProfileId();
	const { enabled, ...rest } = options;
	return useQuery({
		queryKey: ['finance-balance', profileId],
		queryFn: () => get('/finance/balance/'),
		enabled: profileId != null && enabled !== false,
		...rest
	});
}

export function useFinanceAnalytics(params = {}, options = {}) {
	const profileId = useActiveProfileId();
	const { enabled, ...rest } = options;
	return useQuery({
		queryKey: ['finance-analytics', profileId, params],
		queryFn: () => get('/finance/analytics/', { params }),
		enabled: profileId != null && enabled !== false,
		...rest
	});
}

export function useFinanceBreakdown(params = {}, options = {}) {
	const profileId = useActiveProfileId();
	const { enabled, ...rest } = options;
	return useQuery({
		queryKey: ['finance-analytics-breakdown', profileId, params],
		queryFn: () => get('/finance/analytics/breakdown/', { params }),
		enabled: profileId != null && enabled !== false,
		...rest
	});
}

export async function updateStartingBalance(starting_balance) {
	return patch('/finance/balance/', { starting_balance });
}

/** @deprecated Use useFinanceAnalytics */
export function useCostAnalytics(params = {}, options = {}) {
	return useFinanceAnalytics(params, options);
}
