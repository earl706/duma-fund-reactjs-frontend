import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ImageDown, List, Plus } from 'lucide-react';

import { costItemsApi, costListsApi } from '../lib/resources';
import { STATUS_TONE } from '../lib/status';
import { formatCost, formatDate } from '../lib/format';
import {
	canShareImageFile,
	canvasToBlob,
	downloadBlob,
	fetchAllCostItems,
	groceryFilename,
	renderGroceryReceiptCanvas,
	shareImageFile
} from '../lib/groceryReceipt';
import { toast } from '../stores/toastStore';
import { useListControls } from '../hooks/useListControls';
import { GroceryExportModal } from '../components/costs/GroceryExportModal';
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
	{ value: 'title', label: 'Title A–Z' },
	{ value: '-title', label: 'Title Z–A' },
	{ value: '-cost', label: 'Highest cost' },
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

const defaultItemPayload = () => ({
	title: 'Untitled',
	description: '',
	status: 'active',
	cost: '0.00',
	quantity: '1.00',
	date_created: todayISO(),
	date_effective: todayISO()
});

function lineTotal(item) {
	return Number(item.cost || 0) * Number(item.quantity || 0);
}

const ITEM_COLUMNS = [
	{ key: 'title', label: 'Title', editable: true, required: true, className: 'w-[14%]' },
	{ key: 'description', label: 'Description', editable: true, className: 'w-[16%]' },
	{
		key: 'cost',
		label: 'Cost',
		editable: true,
		align: 'right',
		inputType: 'number',
		className: 'w-[9%]',
		getDisplay: (row) => formatCost(row.cost),
		getDraft: (row) => String(row.cost ?? '')
	},
	{
		key: 'quantity',
		label: 'Qty',
		editable: true,
		align: 'right',
		inputType: 'number',
		className: 'w-[7%]',
		getDisplay: (row) =>
			Number(row.quantity ?? 0).toLocaleString(undefined, {
				minimumFractionDigits: 0,
				maximumFractionDigits: 2
			}),
		getDraft: (row) => String(row.quantity ?? '')
	},
	{
		key: 'line_total',
		label: 'Total',
		align: 'right',
		className: 'w-[9%]',
		getDisplay: (row) => formatCost(lineTotal(row))
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
		className: 'w-[10%]',
		getDisplay: (row) => (row.date_created ? formatDate(row.date_created) : '—')
	},
	{
		key: 'date_last_modified',
		label: 'Modified',
		className: 'w-[10%]',
		getDisplay: (row) => (row.date_last_modified ? formatDate(row.date_last_modified) : '—')
	},
	{ key: 'actions', label: '', type: 'action-delete', className: 'w-10' }
];

export default function CostListDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const listId = id ? Number(id) : null;

	const { data: list, isLoading: listLoading, isError: listError } = costListsApi.useDetail(listId);

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

	const { data, isLoading, isError } = costItemsApi.useList(listId, queryParams);
	const items = data?.results || [];

	const { data: itemCountData } = costItemsApi.useList(listId, { page_size: 1 });
	const hasItems = (itemCountData?.count || 0) > 0;

	const [deleteTarget, setDeleteTarget] = useState(null);
	const [autoEdit, setAutoEdit] = useState(null);
	const [exportOpen, setExportOpen] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [previewUrl, setPreviewUrl] = useState('');
	const [exportBlob, setExportBlob] = useState(null);
	const [exportName, setExportName] = useState('');
	const [canShare, setCanShare] = useState(false);
	const [sharing, setSharing] = useState(false);

	useEffect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	const createItem = costItemsApi.useCreate(listId, {
		onSuccess: (created) => {
			toast.success('Item added.');
			if (created?.id != null) {
				setAutoEdit({ id: created.id, field: 'title', key: `${created.id}-${Date.now()}` });
			}
		}
	});
	const updateItem = costItemsApi.useUpdate(listId);
	const removeItem = costItemsApi.useRemove(listId, {
		onSuccess: () => {
			toast.success('Item deleted.');
			setDeleteTarget(null);
		}
	});

	const addItem = () => {
		if (createItem.isPending) return;
		createItem.mutate(defaultItemPayload());
	};

	const commitCell = ({ id: itemId, field, value }) => {
		updateItem.mutate({ id: itemId, [field]: value });
	};

	const confirmDelete = () => {
		if (!deleteTarget) return;
		removeItem.mutate(deleteTarget.id);
	};

	const closeExport = () => {
		setExportOpen(false);
		setExportBlob(null);
		setExportName('');
		setCanShare(false);
		setPreviewUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return '';
		});
	};

	const openExport = async () => {
		if (!list || exporting || !hasItems) return;
		setExporting(true);
		try {
			const allItems = await fetchAllCostItems(listId);
			if (!allItems.length) {
				toast.error('This list has no items to export.');
				return;
			}
			const { canvas } = renderGroceryReceiptCanvas(list, allItems);
			const blob = await canvasToBlob(canvas);
			const filename = groceryFilename(list);
			const file = new File([blob], filename, { type: 'image/png' });
			const url = URL.createObjectURL(blob);
			setPreviewUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return url;
			});
			setExportBlob(blob);
			setExportName(filename);
			setCanShare(canShareImageFile(file));
			setExportOpen(true);
		} catch {
			toast.error('Could not generate grocery list image.');
		} finally {
			setExporting(false);
		}
	};

	const downloadExport = () => {
		if (!exportBlob || !exportName) return;
		downloadBlob(exportBlob, exportName);
		toast.success('Image downloaded.');
	};

	const shareExport = async () => {
		if (!exportBlob || !exportName) return;
		setSharing(true);
		try {
			const file = new File([exportBlob], exportName, { type: 'image/png' });
			await shareImageFile(file, list?.title);
		} catch (err) {
			if (err?.name !== 'AbortError') toast.error('Could not share image.');
		} finally {
			setSharing(false);
		}
	};

	if (listLoading) return <LoadingScreen />;
	if (listError || !list) {
		return (
			<EmptyState
				icon={List}
				title="List not found"
				description="This list does not exist or you do not have access."
				action={<Button onClick={() => navigate('/lists')}>Back to lists</Button>}
			/>
		);
	}

	return (
		<div>
			<Link
				to="/lists"
				className="text-muted hover:text-fg mb-4 inline-flex cursor-pointer items-center gap-1 text-sm"
			>
				<ArrowLeft size={16} /> Lists
			</Link>
			<PageHeader
				title={list.title}
				icon={List}
				description={list.description || 'Items on this list.'}
				actions={
					<>
						<Button
							variant="secondary"
							onClick={openExport}
							loading={exporting}
							disabled={!hasItems || exporting}
						>
							<ImageDown size={16} /> Export image
						</Button>
						<Button onClick={addItem} loading={createItem.isPending}>
							<Plus size={16} /> Add item
						</Button>
					</>
				}
			/>

			<div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
				<Badge tone={STATUS_TONE[list.status] || 'neutral'} className="capitalize">
					{list.status}
				</Badge>
				<span className="text-fg font-medium">Total {formatCost(list.total_cost)}</span>
				{list.date_effective && (
					<span className="text-muted">Effective {formatDate(list.date_effective)}</span>
				)}
				{list.date_created && (
					<span className="text-muted">Created {formatDate(list.date_created)}</span>
				)}
				{list.date_last_modified && (
					<span className="text-muted">Modified {formatDate(list.date_last_modified)}</span>
				)}
			</div>

			<ListToolbar
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search items…"
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
					title="Could not load items"
					description="Something went wrong while fetching items on this list."
				/>
			) : (
				<DataSheet
					rows={items}
					columns={ITEM_COLUMNS}
					onCommit={commitCell}
					onAdd={addItem}
					onRequestDelete={setDeleteTarget}
					adding={createItem.isPending}
					saving={updateItem.isPending}
					autoEdit={autoEdit}
					addLabel="Add item"
					emptyMessage="No items yet. Add a row to get started."
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
				onClose={() => !removeItem.isPending && setDeleteTarget(null)}
				title="Delete item"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={() => setDeleteTarget(null)}
							disabled={removeItem.isPending}
						>
							Cancel
						</Button>
						<Button variant="danger" loading={removeItem.isPending} onClick={confirmDelete}>
							Delete
						</Button>
					</>
				}
			>
				<p className="text-muted text-sm">
					Delete <span className="text-fg font-medium">{deleteTarget?.title || 'this item'}</span>?
					This cannot be undone.
				</p>
			</Modal>

			<GroceryExportModal
				open={exportOpen}
				onClose={closeExport}
				previewUrl={previewUrl}
				filename={exportName}
				canShare={canShare}
				sharing={sharing}
				onDownload={downloadExport}
				onShare={shareExport}
			/>
		</div>
	);
}
