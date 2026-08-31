import { useState } from 'react';
import { List, Plus } from 'lucide-react';

import { costListsApi } from '../lib/resources';
import { STATUS_TONE } from '../lib/status';
import { formatCost, formatDate } from '../lib/format';
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
	Pagination
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

const LIST_COLUMNS = [
	{
		key: 'open',
		label: '',
		type: 'action-link',
		className: 'w-10',
		linkTo: (row) => `/lists/${row.id}`,
		linkAriaLabel: (row) => `Open ${row.title || 'list'}`
	},
	{ key: 'title', label: 'Title', editable: true, required: true, className: 'w-[16%]' },
	{ key: 'description', label: 'Description', editable: true, className: 'w-[20%]' },
	{
		key: 'total_cost',
		label: 'Total',
		align: 'right',
		className: 'w-[10%]',
		getDisplay: (row) => formatCost(row.total_cost)
	},
	{
		key: 'status',
		label: 'Status',
		editable: true,
		type: 'select',
		options: STATUS_SELECT,
		className: 'w-[9%]',
		render: (row) => (
			<Badge tone={STATUS_TONE[row.status] || 'neutral'} className="capitalize">
				{row.status}
			</Badge>
		)
	},
	{
		key: 'date_effective',
		label: 'Effective',
		editable: true,
		inputType: 'date',
		required: true,
		className: 'w-[12%]',
		getDisplay: (row) => (row.date_effective ? formatDate(row.date_effective) : '—'),
		getDraft: (row) => row.date_effective || ''
	},
	{
		key: 'date_created',
		label: 'Created',
		className: 'w-[11%]',
		getDisplay: (row) => (row.date_created ? formatDate(row.date_created) : '—')
	},
	{
		key: 'date_last_modified',
		label: 'Modified',
		className: 'w-[11%]',
		getDisplay: (row) => (row.date_last_modified ? formatDate(row.date_last_modified) : '—')
	},
	{ key: 'actions', label: '', type: 'action-delete', className: 'w-10' }
];

export default function CostListsPage() {
	const {
		search,
		setSearch,
		ordering,
		setOrdering,
		filters,
		setFilter,
		queryParams,
		setPage,
		page
	} = useListControls({ defaultOrdering: '-date_created' });

	const { data, isLoading, isError } = costListsApi.useList(queryParams);
	const lists = data?.results || [];

	const [deleteTarget, setDeleteTarget] = useState(null);
	const [autoEdit, setAutoEdit] = useState(null);

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

	const commitCell = ({ id, field, value }) => {
		updateList.mutate({ id, [field]: value });
	};

	const confirmDelete = () => {
		if (!deleteTarget) return;
		removeList.mutate(deleteTarget.id);
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
					adding={createList.isPending}
					saving={updateList.isPending}
					autoEdit={autoEdit}
					addLabel="New list"
					emptyMessage="No lists yet. Add a row to get started."
				/>
			)}

			<Pagination
				page={page}
				totalPages={data?.total_pages || 1}
				count={data?.count || 0}
				pageSize={queryParams.page_size}
				onPageChange={setPage}
			/>

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
		</div>
	);
}
