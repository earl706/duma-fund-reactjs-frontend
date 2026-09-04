import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderTree, Plus, Trash2 } from 'lucide-react';

import { categoriesApi } from '../lib/resources';
import { reassignAndDeleteCategory } from '../lib/receiptScan';
import { toast } from '../stores/toastStore';
import { PageHeader } from '../components/layout/PageHeader';
import {
	Button,
	Card,
	CardBody,
	CardHeader,
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

export default function CategoriesPage() {
	const queryClient = useQueryClient();
	const [kind, setKind] = useState('expense');
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
			/>

			<div className="border-line bg-surface-2 mb-4 inline-flex rounded-md border p-0.5">
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

			<Card className="mb-4">
				<CardHeader title="Add category" />
				<CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
					<Input
						label="Name"
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="e.g. Groceries"
						className="flex-1"
					/>
					<Select
						label="Parent (optional)"
						value={parentId}
						onChange={(e) => setParentId(e.target.value)}
						className="sm:w-48"
					>
						<option value="">None (root)</option>
						{roots.map((r) => (
							<option key={r.id} value={r.id}>
								{r.name}
							</option>
						))}
					</Select>
					<Button onClick={addCategory} loading={createCat.isPending}>
						<Plus size={16} /> Add
					</Button>
				</CardBody>
			</Card>

			{isLoading ? (
				<LoadingScreen />
			) : isError ? (
				<EmptyState icon={FolderTree} title="Could not load categories" />
			) : tree.length === 0 ? (
				<EmptyState
					icon={FolderTree}
					title="No categories"
					description="Seed defaults appear after first finance access; add your own here."
				/>
			) : (
				<div className="space-y-2">
					{tree.map((root) => (
						<Card key={root.id}>
							<CardBody className="flex items-center justify-between gap-3 py-3">
								<div>
									<p className="text-fg font-medium">
										{root.name}
										{root.is_system ? (
											<span className="text-muted ml-2 text-xs font-normal">system</span>
										) : null}
									</p>
									{root.children?.length > 0 && (
										<ul className="text-muted mt-1 space-y-0.5 text-sm">
											{root.children.map((child) => (
												<li key={child.id} className="flex items-center justify-between gap-2 pl-3">
													<span>↳ {child.name}</span>
													<button
														type="button"
														className="text-danger cursor-pointer hover:underline"
														onClick={() => {
															setDeleteTarget(child);
															setReassignTo('');
														}}
													>
														<Trash2 size={14} />
													</button>
												</li>
											))}
										</ul>
									)}
								</div>
								<Button
									variant="ghost"
									size="icon"
									aria-label={`Delete ${root.name}`}
									onClick={() => {
										setDeleteTarget(root);
										setReassignTo('');
									}}
								>
									<Trash2 size={16} />
								</Button>
							</CardBody>
						</Card>
					))}
				</div>
			)}

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
