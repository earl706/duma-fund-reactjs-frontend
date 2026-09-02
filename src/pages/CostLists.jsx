import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { List, Plus } from 'lucide-react';

import { costListsApi } from '../lib/resources';
import { fetchAllPages } from '../lib/fetchAll';
import { mediaUrl } from '../lib/receiptScan';
import { STATUS_TONE } from '../lib/status';
import { formatCost, formatDate, formatDateShort } from '../lib/format';
import { toast } from '../stores/toastStore';
import { useListControls } from '../hooks/useListControls';
import { PageHeader } from '../components/layout/PageHeader';
import {
	Badge,
	Button,
	DataSheet,
	EmptyState,
	ListToolbar,
	LoadingScreen,
	Modal,
	RecordInfoModal
} from '../components/ui';

const SORT_OPTIONS = [
	{ value: '-date_created', label: 'Newest first' },
	{ value: 'date_created', label: 'Oldest first' },
	{ value: '-date_effective', label: 'Effective (newest)' },
	{ value: 'date_effective', label: 'Effective (oldest)' },
	{ value: '-date_last_modified', label: 'Recently modified' },
	{ value: 'title', label: 'Title A–Z' },
	{ value: '-title', label: 'Title Z–A' },
	{ value: '-total_cost', label: 'Highest total' },
	{ value: 'status', label: 'Status' }
];

const STATUS_OPTIONS = [
	{ value: '', label: 'All statuses' },
	{ value: 'active', label: 'Active' },
	{ value: 'archived', label: 'Archived' }
];

const STATUS_SELECT = [
	{ value: 'active', label: 'Active' },
	{ value: 'archived', label: 'Archived' }
];

function todayISO() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

const defaultListPayload = () => ({
	title: 'Untitled',
	description: '',
	status: 'active',
	date_created: todayISO(),
	date_effective: todayISO()
});

function listInfoFields(list) {
	if (!list) return [];
	return [
		{ label: 'Title', value: list.title },
		{ label: 'Description', value: list.description || '—' },
		{
			label: 'Status',
			value: (
				<Badge tone={STATUS_TONE[list.status] || 'neutral'} className="capitalize">
					{list.status}
				</Badge>
			)
		},
		{ label: 'Total', value: formatCost(list.total_cost) },
		{ label: 'Effective', value: list.date_effective ? formatDate(list.date_effective) : '—' },
		{ label: 'Created', value: list.date_created ? formatDate(list.date_created) : '—' },
		{
			label: 'Modified',
			value: list.date_last_modified ? formatDate(list.date_last_modified) : '—'
		},
		{
			label: 'Receipt',
			value: list.receipt_image ? (
				<a
					href={mediaUrl(list.receipt_image)}
					target="_blank"
					rel="noopener noreferrer"
					className="text-primary hover:underline"
				>
					View receipt
				</a>
			) : (
				'—'
			)
		},
		{ label: 'ID', value: list.id },
		{ label: 'UUID', value: list.uuid }
	];
}

const LIST_COLUMNS = [
	{
		key: 'open',
		label: '',
		type: 'action-link',
		className: 'w-8',
		linkTo: (row) => `/lists/${row.id}`,
		linkAriaLabel: (row) => `Open ${row.title || 'list'}`
	},
	{ key: 'title', label: 'Title', editable: true, required: true, className: 'w-[28%]' },
	{ key: 'description', label: 'Description', editable: true, className: 'w-[22%]' },
	{
		key: 'total_cost',
		label: 'Total',
		align: 'right',
		className: 'w-[10%]',
		getDisplay: (row) => formatCost(row.total_cost)
	},
	{
		key: 'status',
		label: '',
		editable: true,
		type: 'status-icon',
		options: STATUS_SELECT,
		className: 'w-8'
	},
	{
		key: 'date_effective',
		label: 'Effective',
		editable: true,
		inputType: 'date',
		required: true,
		className: 'w-[11%]',
		getDisplay: (row) => (row.date_effective ? formatDateShort(row.date_effective) : '—'),
		getDraft: (row) => row.date_effective || ''
	},
	{
		key: 'actions',
		label: '',
		type: 'actions',
		actions: ['info', 'delete'],
		className: 'w-[4.5rem]'
	}
];

export default function CostListsPage() {
	const { search, setSearch, ordering, setOrdering, filters, setFilter, queryParams } =
		useListControls({
			defaultOrdering: '-date_created'
		});

	const listParams = useMemo(() => {
		const { page: _page, page_size: _pageSize, ...rest } = queryParams;
		return rest;
	}, [queryParams]);

	const {
		data: lists = [],
		isLoading,
		isError
	} = useQuery({
		queryKey: ['cost-lists', 'all', listParams],
		queryFn: () => fetchAllPages('/cost-lists/', listParams)
	});

	const [deleteTarget, setDeleteTarget] = useState(null);
	const [bulkDeleteIds, setBulkDeleteIds] = useState(null);
	const [infoTarget, setInfoTarget] = useState(null);
	const [autoEdit, setAutoEdit] = useState(null);
	const [bulkDeleting, setBulkDeleting] = useState(false);

	const createList = costListsApi.useCreate({
		onSuccess: (created) => {
			toast.success('List created.');
			if (created?.id != null) {
				setAutoEdit({ id: created.id, field: 'title', key: `${created.id}-${Date.now()}` });
			}
		}
	});
	const updateList = costListsApi.useUpdate();
	const removeList = costListsApi.useRemove({
		onSuccess: () => {
			toast.success('List deleted.');
			setDeleteTarget(null);
		}
	});

	const addList = () => {
		if (createList.isPending) return;
		createList.mutate(defaultListPayload());
	};

	const commitCell = ({ id, field, value, patch }) => {
		updateList.mutate(patch ? { id, ...patch } : { id, [field]: value });
	};

	const confirmDelete = () => {
		if (!deleteTarget) return;
		removeList.mutate(deleteTarget.id);
	};

	const confirmBulkDelete = async () => {
		if (!bulkDeleteIds?.length) return;
		setBulkDeleting(true);
		try {
			await Promise.all(bulkDeleteIds.map((listId) => removeList.mutateAsync(listId)));
			toast.success(
				bulkDeleteIds.length === 1 ? 'List deleted.' : `${bulkDeleteIds.length} lists deleted.`
			);
			setBulkDeleteIds(null);
		} catch {
			toast.error('Could not delete some lists.');
		} finally {
			setBulkDeleting(false);
		}
	};

	return (
		<div>
			<PageHeader
				title="Lists"
				icon={List}
				description="Named groups of costs — groceries, bills, or a single payment."
				actions={
					<Button onClick={addList} loading={createList.isPending}>
						<Plus size={16} /> New list
					</Button>
				}
			/>

			<ListToolbar
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search lists…"
				ordering={ordering}
				onOrderingChange={setOrdering}
				sortOptions={SORT_OPTIONS}
				filters={[
					{
						key: 'status',
						label: 'Status',
						value: filters.status || '',
						onChange: (v) => setFilter('status', v),
						options: STATUS_OPTIONS
					}
				]}
			/>

			{isLoading ? (
				<LoadingScreen />
			) : isError ? (
				<EmptyState
					icon={List}
					title="Could not load lists"
					description="Something went wrong while fetching your lists."
				/>
			) : (
				<DataSheet
					rows={lists}
					columns={LIST_COLUMNS}
					onCommit={commitCell}
					onAdd={addList}
					onRequestDelete={setDeleteTarget}
					onRequestInfo={setInfoTarget}
					onBulkDelete={setBulkDeleteIds}
					selectable
					adding={createList.isPending}
					saving={updateList.isPending}
					autoEdit={autoEdit}
					addLabel="New list"
					emptyMessage="No lists yet. Add a row to get started."
				/>
			)}

			<Modal
				open={Boolean(deleteTarget)}
				onClose={() => !removeList.isPending && setDeleteTarget(null)}
				title="Delete list"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={() => setDeleteTarget(null)}
							disabled={removeList.isPending}
						>
							Cancel
						</Button>
						<Button variant="danger" loading={removeList.isPending} onClick={confirmDelete}>
							Delete
						</Button>
					</>
				}
			>
				<p className="text-muted text-sm">
					Delete <span className="text-fg font-medium">{deleteTarget?.title || 'this list'}</span>?
					All items on it will be removed. This cannot be undone.
				</p>
			</Modal>

			<Modal
				open={Boolean(bulkDeleteIds?.length)}
				onClose={() => !bulkDeleting && setBulkDeleteIds(null)}
				title="Delete selected lists"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={() => setBulkDeleteIds(null)}
							disabled={bulkDeleting}
						>
							Cancel
						</Button>
						<Button variant="danger" loading={bulkDeleting} onClick={confirmBulkDelete}>
							Delete {bulkDeleteIds?.length || 0}
						</Button>
					</>
				}
			>
				<p className="text-muted text-sm">
					Delete <span className="text-fg font-medium">{bulkDeleteIds?.length || 0}</span> selected
					lists? All items on them will be removed. This cannot be undone.
				</p>
			</Modal>

			<RecordInfoModal
				open={Boolean(infoTarget)}
				onClose={() => setInfoTarget(null)}
				title={infoTarget?.title || 'List details'}
				fields={listInfoFields(infoTarget)}
			/>
		</div>
	);
}
