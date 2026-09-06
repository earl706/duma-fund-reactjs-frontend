import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { del, get, post } from './api';

export function lookupPurchases(q, limit = 5) {
	return get('/finance/purchases/lookup/', { params: { q, limit } });
}

export function fetchPurchaseInsights() {
	return get('/finance/purchases/insights/');
}

export function fetchPurchaseNotifications() {
	return get('/finance/purchases/notifications/');
}

export function markPurchaseRegular(title) {
	return post('/finance/purchases/mark-regular/', { title });
}

export function unmarkPurchaseRegular(title) {
	return del('/finance/purchases/mark-regular/', { data: { title } });
}

export function excludePurchaseMatch(query_title, matched_title) {
	return post('/finance/purchases/exclude/', { query_title, matched_title });
}

export function useDebouncedValue(value, delayMs = 280) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(t);
	}, [value, delayMs]);
	return debounced;
}

export function usePurchaseInsights(options = {}) {
	return useQuery({
		queryKey: ['finance-purchase-insights'],
		queryFn: fetchPurchaseInsights,
		...options
	});
}

export function usePurchaseNotifications(options = {}) {
	return useQuery({
		queryKey: ['finance-purchase-notifications'],
		queryFn: fetchPurchaseNotifications,
		refetchOnWindowFocus: true,
		...options
	});
}

export function usePurchaseLookup(query, { enabled = true, limit = 5, debounceMs = 280 } = {}) {
	const trimmed = (query || '').trim();
	const debounced = useDebouncedValue(trimmed, debounceMs);
	const ready = enabled && debounced.length >= 2;

	return useQuery({
		queryKey: ['finance-purchase-lookup', debounced, limit],
		queryFn: () => lookupPurchases(debounced, limit),
		enabled: ready,
		placeholderData: (prev) => prev,
		staleTime: 15_000
	});
}

export function usePurchaseActions() {
	const queryClient = useQueryClient();
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ['finance-purchase-lookup'] });
		queryClient.invalidateQueries({ queryKey: ['finance-purchase-insights'] });
		queryClient.invalidateQueries({ queryKey: ['finance-purchase-notifications'] });
	};

	const markRegular = useMutation({
		mutationFn: (title) => markPurchaseRegular(title),
		onSuccess: invalidate
	});
	const unmarkRegular = useMutation({
		mutationFn: (title) => unmarkPurchaseRegular(title),
		onSuccess: invalidate
	});
	const exclude = useMutation({
		mutationFn: ({ queryTitle, matchedTitle }) => excludePurchaseMatch(queryTitle, matchedTitle),
		onSuccess: invalidate
	});

	return { markRegular, unmarkRegular, exclude, invalidate };
}
