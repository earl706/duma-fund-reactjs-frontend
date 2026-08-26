import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { del, get, patch, post } from '../lib/api';
import { toast } from '../stores/toastStore';

/**
 * Factory that builds a small set of TanStack Query hooks for a REST resource.
 *
 *   const lists = createResourceHooks('cost-lists', '/cost-lists/')
 *   lists.useList({ status: 'active' })
 *   lists.useCreate(), lists.useUpdate(), lists.useRemove()
 *
 * Mutations invalidate the resource's queries. Callers may still pass
 * onSuccess; it runs after cache invalidation.
 */
export function createResourceHooks(key, basePath) {
	const listKey = (params) => [key, 'list', params || {}];
	const detailKey = (id) => [key, 'detail', id];

	function useList(params, options = {}) {
		return useQuery({
			queryKey: listKey(params),
			queryFn: () => get(basePath, { params }),
			...options
		});
	}

	function useDetail(id, options = {}) {
		return useQuery({
			queryKey: detailKey(id),
			queryFn: () => get(`${basePath}${id}/`),
			enabled: id != null,
			...options
		});
	}

	function useCreate(options = {}) {
		const qc = useQueryClient();
		const { onSuccess, onError, ...rest } = options;
		return useMutation({
			mutationFn: (body) => post(basePath, body),
			onSuccess: (...args) => {
				qc.invalidateQueries({ queryKey: [key] });
				onSuccess?.(...args);
			},
			onError: (...args) => {
				toast.error('Could not save changes.');
				onError?.(...args);
			},
			...rest
		});
	}

	function useUpdate(options = {}) {
		const qc = useQueryClient();
		const { onSuccess, onError, ...rest } = options;
		return useMutation({
			mutationFn: ({ id, ...body }) => patch(`${basePath}${id}/`, body),
			onSuccess: (...args) => {
				qc.invalidateQueries({ queryKey: [key] });
				onSuccess?.(...args);
			},
			onError: (...args) => {
				toast.error('Could not save changes.');
				onError?.(...args);
			},
			...rest
		});
	}

	function useRemove(options = {}) {
		const qc = useQueryClient();
		const { onSuccess, onError, ...rest } = options;
		return useMutation({
			mutationFn: (id) => del(`${basePath}${id}/`),
			onSuccess: (...args) => {
				qc.invalidateQueries({ queryKey: [key] });
				onSuccess?.(...args);
			},
			onError: (...args) => {
				toast.error('Could not delete.');
				onError?.(...args);
			},
			...rest
		});
	}

	return { key, basePath, listKey, detailKey, useList, useDetail, useCreate, useUpdate, useRemove };
}

/**
 * Nested REST resource: pathFn(parentId) => '/cost-lists/1/items/'
 * Item mutations also invalidate parentKey (e.g. cost-lists) so annotated
 * totals on the parent refresh.
 */
export function createNestedResourceHooks(key, pathFn, { parentKey } = {}) {
	const listKey = (parentId, params) => [key, parentId, 'list', params || {}];
	const detailKey = (parentId, id) => [key, parentId, 'detail', id];

	function invalidate(qc, parentId) {
		qc.invalidateQueries({ queryKey: [key, parentId] });
		if (parentKey) qc.invalidateQueries({ queryKey: [parentKey] });
	}

	function useList(parentId, params, options = {}) {
		const { enabled, ...rest } = options;
		return useQuery({
			queryKey: listKey(parentId, params),
			queryFn: () => get(pathFn(parentId), { params }),
			enabled: parentId != null && enabled !== false,
			...rest
		});
	}

	function useDetail(parentId, id, options = {}) {
		const { enabled, ...rest } = options;
		return useQuery({
			queryKey: detailKey(parentId, id),
			queryFn: () => get(`${pathFn(parentId)}${id}/`),
			enabled: parentId != null && id != null && enabled !== false,
			...rest
		});
	}

	function useCreate(parentId, options = {}) {
		const qc = useQueryClient();
		const { onSuccess, onError, ...rest } = options;
		return useMutation({
			mutationFn: (body) => post(pathFn(parentId), body),
			onSuccess: (...args) => {
				invalidate(qc, parentId);
				onSuccess?.(...args);
			},
			onError: (...args) => {
				toast.error('Could not save changes.');
				onError?.(...args);
			},
			...rest
		});
	}

	function useUpdate(parentId, options = {}) {
		const qc = useQueryClient();
		const { onSuccess, onError, ...rest } = options;
		return useMutation({
			mutationFn: ({ id, ...body }) => patch(`${pathFn(parentId)}${id}/`, body),
			onSuccess: (...args) => {
				invalidate(qc, parentId);
				onSuccess?.(...args);
			},
			onError: (...args) => {
				toast.error('Could not save changes.');
				onError?.(...args);
			},
			...rest
		});
	}

	function useRemove(parentId, options = {}) {
		const qc = useQueryClient();
		const { onSuccess, onError, ...rest } = options;
		return useMutation({
			mutationFn: (id) => del(`${pathFn(parentId)}${id}/`),
			onSuccess: (...args) => {
				invalidate(qc, parentId);
				onSuccess?.(...args);
			},
			onError: (...args) => {
				toast.error('Could not delete.');
				onError?.(...args);
			},
			...rest
		});
	}

	return { key, pathFn, listKey, detailKey, useList, useDetail, useCreate, useUpdate, useRemove };
}
