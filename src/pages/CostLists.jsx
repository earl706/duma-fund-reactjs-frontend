import { useState } from 'react';
import { Link } from 'react-router-dom';
import { List, Pencil, Plus, Trash2 } from 'lucide-react';

import { costListsApi } from '../lib/resources';
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
	date_created: todayISO()
});

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

	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState(null);
	const [form, setForm] = useState(emptyForm);

	const createList = costListsApi.useCreate({
		onSuccess: () => {
			toast.success('List created.');
			closeModal();
		}
	});
	const updateList = costListsApi.useUpdate({
		onSuccess: () => {
			toast.success('List updated.');
			closeModal();
		}
	});
	const removeList = costListsApi.useRemove({
		onSuccess: () => toast.success('List deleted.')
	});

	const openCreate = () => {
		setEditing(null);
		setForm(emptyForm());
		setModalOpen(true);
	};

	const openEdit = (list) => {
		setEditing(list);
		setForm({
			title: list.title || '',
			description: list.description || '',
			status: list.status || 'active',
			date_created: list.date_created || todayISO()
		});
		setModalOpen(true);
	};

	const closeModal = () => {
		setModalOpen(false);
		setEditing(null);
	};

	const submit = (e) => {
		e.preventDefault();
		if (editing) updateList.mutate({ id: editing.id, ...form });
		else createList.mutate(form);
	};

	const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
	const saving = createList.isPending || updateList.isPending;

	return (
		<div>
			<PageHeader
				title="Lists"
				icon={List}
				description="Named groups of costs — groceries, bills, or a single payment."
				actions={
					<Button onClick={openCreate}>
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
			) : lists.length === 0 ? (
				<EmptyState
					icon={List}
					title="No lists yet"
					description="Create your first list to get started."
					action={
						<Button onClick={openCreate}>
							<Plus size={16} /> New list
						</Button>
					}
				/>
			) : (
				<div className="space-y-3">
					{lists.map((list) => (
						<Card key={list.id}>
							<CardBody className="flex items-start justify-between gap-4 pt-5">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<Link
											to={`/lists/${list.id}`}
											className="text-fg truncate font-medium hover:underline"
										>
											{list.title}
										</Link>
										<Badge tone={STATUS_TONE[list.status] || 'neutral'} className="capitalize">
											{list.status}
										</Badge>
									</div>
									{list.description && (
										<p className="text-muted mt-1 line-clamp-2 text-sm">{list.description}</p>
									)}
									<p className="text-muted mt-2 text-xs">
										Total {formatCost(list.total_cost)}
										{list.date_created ? ` · ${formatDate(list.date_created)}` : ''}
										{list.date_last_modified
											? ` · modified ${formatDate(list.date_last_modified)}`
											: ''}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										onClick={() => openEdit(list)}
										aria-label={`Edit ${list.title}`}
									>
										<Pencil size={16} />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => removeList.mutate(list.id)}
										aria-label={`Delete ${list.title}`}
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
				title={editing ? 'Edit list' : 'New list'}
				footer={
					<>
						<Button variant="secondary" onClick={closeModal}>
							Cancel
						</Button>
						<Button type="submit" form="list-form" loading={saving} disabled={!form.title.trim()}>
							{editing ? 'Save changes' : 'Create list'}
						</Button>
					</>
				}
			>
				<form id="list-form" onSubmit={submit} className="space-y-4">
					<Input
						label="Title"
						value={form.title}
						onChange={setField('title')}
						placeholder="List title"
						required
					/>
					<Textarea
						label="Description"
						value={form.description}
						onChange={setField('description')}
						placeholder="Optional description"
					/>
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
