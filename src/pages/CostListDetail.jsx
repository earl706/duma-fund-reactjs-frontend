import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, List, Pencil, Plus, Trash2 } from 'lucide-react';

import { costItemsApi, costListsApi } from '../lib/resources';
import { STATUS_TONE } from '../lib/status';
import { formatCost, formatDate } from '../lib/format';
import { toast } from '../stores/toastStore';
import { useListControls } from '../hooks/useListControls';
import { PageHeader } from '../components/layout/PageHeader';
import {
	Badge,
	Button,
	Card,
	CardBody,
	EmptyState,
	Input,
	ListToolbar,
	LoadingScreen,
	Modal,
	Pagination,
	Select,
	Textarea
} from '../components/ui';

const SORT_OPTIONS = [
	{ value: '-date_created', label: 'Newest first' },
	{ value: 'date_created', label: 'Oldest first' },
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

function todayISO() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

const emptyForm = () => ({
	title: '',
	description: '',
	status: 'active',
	cost: '0.00',
	quantity: '1.00',
	date_created: todayISO()
});

function lineTotal(item) {
	return Number(item.cost || 0) * Number(item.quantity || 0);
}

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

	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState(null);
	const [form, setForm] = useState(emptyForm);

	const createItem = costItemsApi.useCreate(listId, {
		onSuccess: () => {
			toast.success('Item created.');
			closeModal();
		}
	});
	const updateItem = costItemsApi.useUpdate(listId, {
		onSuccess: () => {
			toast.success('Item updated.');
			closeModal();
		}
	});
	const removeItem = costItemsApi.useRemove(listId, {
		onSuccess: () => toast.success('Item deleted.')
	});

	const openCreate = () => {
		setEditing(null);
		setForm(emptyForm());
		setModalOpen(true);
	};

	const openEdit = (item) => {
		setEditing(item);
		setForm({
			title: item.title || '',
			description: item.description || '',
			status: item.status || 'active',
			cost: item.cost ?? '0.00',
			quantity: item.quantity ?? '1.00',
			date_created: item.date_created || todayISO()
		});
		setModalOpen(true);
	};

	const closeModal = () => {
		setModalOpen(false);
		setEditing(null);
	};

	const submit = (e) => {
		e.preventDefault();
		const payload = {
			...form,
			cost: form.cost,
			quantity: form.quantity
		};
		if (editing) updateItem.mutate({ id: editing.id, ...payload });
		else createItem.mutate(payload);
	};

	const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
	const saving = createItem.isPending || updateItem.isPending;

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
					<Button onClick={openCreate}>
						<Plus size={16} /> Add item
					</Button>
				}
			/>

			<div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
				<Badge tone={STATUS_TONE[list.status] || 'neutral'} className="capitalize">
					{list.status}
				</Badge>
				<span className="text-fg font-medium">Total {formatCost(list.total_cost)}</span>
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
			) : items.length === 0 ? (
				<EmptyState
					icon={List}
					title="No items yet"
					description="Add a line to this list."
					action={
						<Button onClick={openCreate}>
							<Plus size={16} /> Add item
						</Button>
					}
				/>
			) : (
				<div className="space-y-3">
					{items.map((item) => (
						<Card key={item.id}>
							<CardBody className="flex items-start justify-between gap-4 pt-5">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<h3 className="text-fg truncate font-medium">{item.title}</h3>
										<Badge tone={STATUS_TONE[item.status] || 'neutral'} className="capitalize">
											{item.status}
										</Badge>
									</div>
									{item.description && (
										<p className="text-muted mt-1 line-clamp-2 text-sm">{item.description}</p>
									)}
									<p className="text-muted mt-2 text-xs">
										{formatCost(item.cost)} × {item.quantity} = {formatCost(lineTotal(item))}
										{item.date_created ? ` · ${formatDate(item.date_created)}` : ''}
										{item.date_last_modified
											? ` · modified ${formatDate(item.date_last_modified)}`
											: ''}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										onClick={() => openEdit(item)}
										aria-label={`Edit ${item.title}`}
									>
										<Pencil size={16} />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => removeItem.mutate(item.id)}
										aria-label={`Delete ${item.title}`}
									>
										<Trash2 size={16} />
									</Button>
								</div>
							</CardBody>
						</Card>
					))}
				</div>
			)}

			<Pagination
				page={page}
				totalPages={data?.total_pages || 1}
				count={data?.count || 0}
				pageSize={queryParams.page_size}
				onPageChange={setPage}
			/>

			<Modal
				open={modalOpen}
				onClose={closeModal}
				title={editing ? 'Edit item' : 'Add item'}
				footer={
					<>
						<Button variant="secondary" onClick={closeModal}>
							Cancel
						</Button>
						<Button type="submit" form="item-form" loading={saving} disabled={!form.title.trim()}>
							{editing ? 'Save changes' : 'Add item'}
						</Button>
					</>
				}
			>
				<form id="item-form" onSubmit={submit} className="space-y-4">
					<Input
						label="Title"
						value={form.title}
						onChange={setField('title')}
						placeholder="Item title"
						required
					/>
					<Textarea
						label="Description"
						value={form.description}
						onChange={setField('description')}
						placeholder="Optional description"
					/>
					<div className="grid grid-cols-2 gap-3">
						<Input
							label="Cost"
							type="number"
							min="0"
							step="0.01"
							value={form.cost}
							onChange={setField('cost')}
							required
						/>
						<Input
							label="Quantity"
							type="number"
							min="0"
							step="0.01"
							value={form.quantity}
							onChange={setField('quantity')}
							required
						/>
					</div>
					<Input
						label="Date created"
						type="date"
						value={form.date_created}
						onChange={setField('date_created')}
						required
					/>
					<Select label="Status" value={form.status} onChange={setField('status')}>
						<option value="active">Active</option>
						<option value="archived">Archived</option>
					</Select>
				</form>
			</Modal>
		</div>
	);
}
