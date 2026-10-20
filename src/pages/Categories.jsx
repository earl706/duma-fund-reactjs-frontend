import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Folder, FolderTree, Plus, Trash2 } from 'lucide-react';

import { categoriesApi } from '../lib/resources';
import { reassignAndDeleteCategory } from '../lib/receiptScan';
import { cn } from '../lib/format';
import { toast } from '../stores/toastStore';
import { useIsProfileOwner } from '../stores/profileStore';
import { PageHeader } from '../components/layout/PageHeader';
import {
	Badge,
	Button,
	Card,
	EmptyState,
	Input,
	LoadingScreen,
	Modal,
	Select
} from '../components/ui';

function buildTree(categories) {
	const list = (categories || []).filter(Boolean);
	const roots = list.filter((c) => c && !c.parent);
	const childrenOf = (parentId) => list.filter((c) => c && c.parent === parentId);
	return roots.map((root) => ({ ...root, children: childrenOf(root.id) }));
}

function CategoryCard({ root, isOwner, onDelete }) {
	const children = root.children || [];

	return (
		<Card as="li" className="flex h-full min-w-0 flex-col">
			<div className="flex items-start gap-3 p-4">
				<div
					className={cn(
						'flex h-9 w-9 shrink-0 items-center justify-center rounded-sm',
						root.kind === 'income' ? 'bg-success/12 text-success' : 'bg-primary/12 text-primary'
					)}
				>
					<Folder size={16} />
				</div>
				<div className="min-w-0 flex-1">
					<h3 className="text-fg truncate font-semibold" title={root.name}>
						{root.name}
					</h3>
					<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
						{root.is_system ? <Badge tone="neutral">System</Badge> : null}
						<Badge tone={root.kind === 'income' ? 'success' : 'primary'}>
							{children.length} {children.length === 1 ? 'subcategory' : 'subcategories'}
						</Badge>
					</div>
				</div>
				{isOwner && (
					<Button
						variant="ghost"
						size="icon"
						className="shrink-0"
						aria-label={`Delete ${root.name}`}
						onClick={() => onDelete(root)}
					>
						<Trash2 size={16} />
					</Button>
				)}
			</div>

			<div className="border-line mx-4 border-t" />

			{children.length === 0 ? (
				<p className="text-muted px-4 py-3 text-sm">No subcategories</p>
			) : (
				<ul className="grid grid-cols-1 gap-1.5 p-3 sm:grid-cols-2">
					{children.map((child) => (
						<li
							key={child.id}
							className="border-line bg-surface-2 flex min-w-0 items-center justify-between gap-2 rounded-sm border px-2.5 py-1.5"
						>
							<span className="text-fg min-w-0 truncate text-sm" title={child.name}>
								{child.name}
							</span>
							{isOwner && (
								<button
									type="button"
									className="text-muted hover:text-danger shrink-0 cursor-pointer rounded-sm p-0.5"
									aria-label={`Delete ${child.name}`}
									onClick={() => onDelete(child)}
								>
									<Trash2 size={14} />
								</button>
							)}
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}

export default function CategoriesPage() {
	const queryClient = useQueryClient();
	const isOwner = useIsProfileOwner();
	const [kind, setKind] = useState('expense');
	const [addOpen, setAddOpen] = useState(false);
	const [newName, setNewName] = useState('');
	const [parentId, setParentId] = useState('');
	const [deleteTarget, setDeleteTarget] = useState(null);
	const [reassignTo, setReassignTo] = useState('');

	const { data, isLoading, isError } = categoriesApi.useList({ kind, page_size: 100 });
	const categories = useMemo(
		() => (Array.isArray(data?.results) ? data.results.filter(Boolean) : []),
		[data?.results]
	);
	const tree = useMemo(() => buildTree(categories), [categories]);
	const roots = useMemo(() => categories.filter((c) => c && !c.parent), [categories]);

	const createCat = categoriesApi.useCreate({
		onSuccess: () => {
			toast.success('Category created.');
			setNewName('');
			setParentId('');
			setAddOpen(false);
		}
	});

	const removeMutation = useMutation({
		mutationFn: ({ id, targetId }) => reassignAndDeleteCategory(id, targetId),
		onSuccess: () => {
			toast.success('Category removed.');
			setDeleteTarget(null);
			setReassignTo('');
			queryClient.invalidateQueries({ queryKey: ['finance-categories'] });
			queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
		},
		onError: (err) => {
			const detail =
				err?.response?.data?.detail ||
				err?.response?.data?.target_category_id?.[0] ||
				'Could not delete category.';
			toast.error(detail);
		}
	});

	const closeAdd = () => {
		if (createCat.isPending) return;
		setAddOpen(false);
		setNewName('');
		setParentId('');
	};

	const openAdd = () => {
		setNewName('');
		setParentId('');
		setAddOpen(true);
	};

	const addCategory = () => {
		const name = newName.trim();
		if (!name) {
			toast.error('Name is required.');
			return;
		}
		const payload = { name, kind };
		if (parentId) payload.parent = Number(parentId);
		createCat.mutate(payload);
	};

	const requestDelete = (category) => {
		setDeleteTarget(category);
		setReassignTo('');
	};

	const otherTargets = categories.filter((c) => c && c.id !== deleteTarget?.id);

	const confirmDelete = () => {
		if (!deleteTarget?.id || !reassignTo) return;
		removeMutation.mutate({
			id: deleteTarget.id,
			targetId: Number(reassignTo)
		});
	};

	return (
		<div>
			<PageHeader
				title="Categories"
				icon={FolderTree}
				description="Nested expense and income labels for your ledger."
				actions={
					isOwner ? (
						<Button onClick={openAdd}>
							<Plus size={16} /> New Category
						</Button>
					) : null
				}
			/>

			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="border-line bg-surface-2 inline-flex rounded-md border p-0.5">
					{['expense', 'income'].map((k) => (
						<Button
							key={k}
							size="sm"
							variant={kind === k ? 'primary' : 'ghost'}
							className="h-8 capitalize"
							onClick={() => setKind(k)}
						>
							{k}
						</Button>
					))}
				</div>
				{!isOwner && (
					<p className="text-muted text-sm">Only the profile owner can add or remove categories.</p>
				)}
			</div>

			{isLoading ? (
				<LoadingScreen />
			) : isError ? (
				<EmptyState icon={FolderTree} title="Could not load categories" />
			) : tree.length === 0 ? (
				<EmptyState
					icon={FolderTree}
					title="No categories"
					description="Seed defaults appear after first finance access; add your own here."
					action={
						isOwner ? (
							<Button onClick={openAdd}>
								<Plus size={16} /> New Category
							</Button>
						) : null
					}
				/>
			) : (
				<ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
					{tree.map((root) => (
						<CategoryCard key={root.id} root={root} isOwner={isOwner} onDelete={requestDelete} />
					))}
				</ul>
			)}

			<Modal
				open={addOpen}
				onClose={closeAdd}
				title="New category"
				size="sm"
				footer={
					<>
						<Button variant="secondary" onClick={closeAdd} disabled={createCat.isPending}>
							Cancel
						</Button>
						<Button onClick={addCategory} loading={createCat.isPending}>
							<Plus size={16} /> Add
						</Button>
					</>
				}
			>
				<form
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						addCategory();
					}}
				>
					<Input
						label="Name"
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="e.g. Groceries"
						autoFocus
					/>
					<Select
						label="Parent (optional)"
						value={parentId}
						onChange={(e) => setParentId(e.target.value)}
					>
						<option value="">None (root)</option>
						{roots.map((r) => (
							<option key={r.id} value={r.id}>
								{r.name}
							</option>
						))}
					</Select>
				</form>
			</Modal>

			<Modal
				open={Boolean(deleteTarget)}
				onClose={() => !removeMutation.isPending && setDeleteTarget(null)}
				title="Delete category"
				size="sm"
				footer={
					<>
						<Button variant="secondary" onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						<Button
							variant="danger"
							loading={removeMutation.isPending}
							disabled={!reassignTo || !deleteTarget}
							onClick={confirmDelete}
						>
							Reassign & delete
						</Button>
					</>
				}
			>
				<p className="text-muted mb-3 text-sm">
					Move transactions and items from{' '}
					<span className="text-fg font-medium">{deleteTarget?.name}</span> to another category,
					then delete it.
				</p>
				<Select
					label="Reassign to"
					value={reassignTo}
					onChange={(e) => setReassignTo(e.target.value)}
				>
					<option value="">Select category…</option>
					{otherTargets.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</Select>
			</Modal>
		</div>
	);
}
