import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeft,
	ArrowLeftRight,
	Car,
	Clapperboard,
	HeartPulse,
	Home,
	ImageDown,
	MoreHorizontal,
	Plus,
	ScanLine,
	ShoppingBag,
	Star,
	Tag,
	UtensilsCrossed,
	Zap
} from 'lucide-react';

import { sourceSelectOptions } from '../lib/balanceSources';
import { categoriesApi, sourcesApi, transactionItemsApi, transactionsApi } from '../lib/resources';
import { post } from '../lib/api';
import { fetchAllPages } from '../lib/fetchAll';
import { useMobileLayout } from '../hooks/useMobileLayout';
import { mediaUrl } from '../lib/receiptScan';
import { STATUS_TONE } from '../lib/status';
import { cn, formatCost, formatDate } from '../lib/format';
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
import { useActiveProfileId, useCanEditLedger } from '../stores/profileStore';
import { useListControls } from '../hooks/useListControls';
import { GroceryExportModal } from '../components/costs/GroceryExportModal';
import { ReceiptImportModal } from '../components/finance/ReceiptImportModal';
import { MAX_EXPENSE_CATEGORIES } from '../components/finance/CategoryMultiSelect';
import { PageHeader } from '../components/layout/PageHeader';
import { StickyPageChrome } from '../components/layout/StickyPageChrome';
import {
	Badge,
	Button,
	DataSheet,
	EmptyState,
	IconChoice,
	ListToolbar,
	FadeIn,
	LoadingScreen,
	LoadingSwap,
	Modal,
	RecordInfoModal,
	Select
} from '../components/ui';

const DEFAULT_ORDERING = 'title';

const STATUS_OPTIONS = [
	{ value: '', label: 'All statuses' },
	{ value: 'active', label: 'Active' },
	{ value: 'archived', label: 'Archived' }
];

const STATUS_SELECT = [
	{ value: 'active', label: 'Active' },
	{ value: 'archived', label: 'Archived' }
];

const UNIT_OPTIONS = [
	{ value: 'pcs', label: 'pcs' },
	{ value: 'kg', label: 'kg' },
	{ value: 'g', label: 'g' },
	{ value: 'L', label: 'L' },
	{ value: 'mL', label: 'mL' }
];

/** Icons for system expense seeds (exact name). Custom / renamed → Tag. */
const EXPENSE_SEED_ICONS = {
	Food: UtensilsCrossed,
	Transport: Car,
	Housing: Home,
	Utilities: Zap,
	Health: HeartPulse,
	Entertainment: Clapperboard,
	Shopping: ShoppingBag,
	Other: MoreHorizontal
};

function categoryChoiceIcon(category) {
	if (!category?.is_system) return Tag;
	return EXPENSE_SEED_ICONS[category.name] || Tag;
}

function todayISO() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function lineTotal(item) {
	return Number(item.cost || 0) * Number(item.quantity || 0);
}

function formatQty(value) {
	return Number(value ?? 0).toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	});
}

export default function TransactionDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const mobile = useMobileLayout();
	const canEdit = useCanEditLedger();
	const profileId = useActiveProfileId();
	const txnId = id ? Number(id) : null;

	const { data: txn, isLoading: txnLoading, isError: txnError } = transactionsApi.useDetail(txnId);
	const { data: categoriesData } = categoriesApi.useList({ page_size: 100, kind: 'expense' });
	const { data: incomeCatsData } = categoriesApi.useList({ page_size: 100, kind: 'income' });
	const { data: sourcesData } = sourcesApi.useList({ page_size: 100 });
	const sources = useMemo(() => sourcesData?.results || [], [sourcesData?.results]);
	const sourceOptions = useMemo(
		() => sourceSelectOptions(sources, txn?.source),
		[sources, txn?.source]
	);
	const expenseCategories = useMemo(() => categoriesData?.results || [], [categoriesData?.results]);
	const incomeCategories = useMemo(() => incomeCatsData?.results || [], [incomeCatsData?.results]);
	const defaultCategoryId =
		txn?.category ||
		expenseCategories.find((c) => c.name === 'Other' && !c.parent)?.id ||
		expenseCategories[0]?.id;

	const categoryOptions = useMemo(
		() =>
			expenseCategories.map((c) => ({
				value: String(c.id),
				label: c.name,
				icon: categoryChoiceIcon(c)
			})),
		[expenseCategories]
	);

	const headerCategoryIds = useMemo(() => {
		if (!txn || txn.type !== 'expense') return [];
		if (txn.categories?.length) return txn.categories.map(Number);
		return txn.category != null ? [Number(txn.category)] : [];
	}, [txn]);

	const [categoryDraftIds, setCategoryDraftIds] = useState(null);
	const [categoryDraftPrimary, setCategoryDraftPrimary] = useState(null);

	useEffect(() => {
		setCategoryDraftIds(null);
		setCategoryDraftPrimary(null);
	}, [txn?.id, txn?.updated_at]);

	const editingCategories = categoryDraftIds != null;
	const displayCategoryIds = editingCategories ? categoryDraftIds : headerCategoryIds;
	const displayPrimary = editingCategories
		? categoryDraftPrimary
		: (txn?.category ?? headerCategoryIds[0] ?? null);

	const { search, setSearch, ordering, setOrdering, filters, setFilter, queryParams } =
		useListControls({ defaultOrdering: DEFAULT_ORDERING });

	const listParams = useMemo(() => {
		const rest = { ...queryParams };
		delete rest.page;
		delete rest.page_size;
		return rest;
	}, [queryParams]);

	const {
		data: items = [],
		isLoading,
		isError
	} = useQuery({
		queryKey: ['finance-transaction-items', txnId, 'all', profileId, listParams],
		queryFn: () => fetchAllPages(`/finance/transactions/${txnId}/items/`, listParams),
		enabled: txnId != null && txn?.type === 'expense'
	});

	const hasItems = items.length > 0;
	const isExpense = txn?.type === 'expense';

	const [deleteTarget, setDeleteTarget] = useState(null);
	const [bulkDeleteIds, setBulkDeleteIds] = useState(null);
	const [infoTarget, setInfoTarget] = useState(null);
	const [autoEdit, setAutoEdit] = useState(null);
	const [exportOpen, setExportOpen] = useState(false);
	const [scanOpen, setScanOpen] = useState(false);
	const [receiptOpen, setReceiptOpen] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [previewUrl, setPreviewUrl] = useState('');
	const [exportBlob, setExportBlob] = useState(null);
	const [exportName, setExportName] = useState('');
	const [canShare, setCanShare] = useState(false);
	const [sharing, setSharing] = useState(false);
	const [bulkDeleting, setBulkDeleting] = useState(false);
	const [duplicating, setDuplicating] = useState(false);

	useEffect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	const createItem = transactionItemsApi.useCreate(txnId, {
		onSuccess: (created) => {
			toast.success('Item added.');
			queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
			queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
			if (created?.id != null) {
				setAutoEdit({ id: created.id, field: 'title', key: `${created.id}-${Date.now()}` });
			}
		}
	});
	const updateItem = transactionItemsApi.useUpdate(txnId, {
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
			queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
		}
	});
	const removeItem = transactionItemsApi.useRemove(txnId, {
		onSuccess: () => {
			toast.success('Item deleted.');
			setDeleteTarget(null);
			queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
			queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
		}
	});
	const updateTxn = transactionsApi.useUpdate({
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance-balance'] })
	});

	const addItem = () => {
		if (!isExpense || createItem.isPending) return;
		createItem.mutate({
			title: 'Untitled',
			status: 'active',
			cost: '0.00',
			quantity: '1.00',
			unit: 'pcs',
			date_created: todayISO()
		});
	};

	const duplicateItem = async (row) => {
		if (duplicating || !isExpense || !txnId || !row?.id) return;
		setDuplicating(true);
		try {
			const created = await post(`/finance/transactions/${txnId}/items/`, {
				title: row.title || '',
				status: row.status || 'active',
				cost: row.cost ?? '0.00',
				quantity: row.quantity ?? '1.00',
				unit: row.unit || 'pcs',
				date_created: todayISO()
			});
			toast.success('Item duplicated.');
			queryClient.invalidateQueries({ queryKey: ['finance-transaction-items'] });
			queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
			queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
			if (created?.id != null) {
				setAutoEdit({
					id: created.id,
					field: 'title',
					key: `${created.id}-${Date.now()}`
				});
			}
		} catch {
			toast.error('Could not duplicate item.');
		} finally {
			setDuplicating(false);
		}
	};

	const commitCell = ({ id: itemId, field, value, patch }) => {
		const body = patch ? { id: itemId, ...patch } : { id: itemId, [field]: value };
		updateItem.mutate(body);
	};

	const applyCategoryDraft = ({ ids, primaryId }) => {
		setCategoryDraftIds(ids);
		setCategoryDraftPrimary(primaryId);
	};

	const toggleHeaderCategory = (id) => {
		const selected = displayCategoryIds.map(Number);
		const primary = displayPrimary != null ? Number(displayPrimary) : (selected[0] ?? null);
		const n = Number(id);
		if (selected.includes(n)) {
			if (selected.length <= 1) return;
			const ids = selected.filter((x) => x !== n);
			applyCategoryDraft({ ids, primaryId: primary === n ? (ids[0] ?? null) : primary });
		} else if (selected.length < MAX_EXPENSE_CATEGORIES) {
			applyCategoryDraft({ ids: [...selected, n], primaryId: primary ?? n });
		}
	};

	const setHeaderPrimary = (id) => {
		const selected = displayCategoryIds.map(Number);
		const n = Number(id);
		if (!selected.includes(n)) return;
		applyCategoryDraft({ ids: [n, ...selected.filter((x) => x !== n)], primaryId: n });
	};

	const saveHeaderCategories = () => {
		if (!txnId || !displayCategoryIds?.length) return;
		updateTxn.mutate(
			{
				id: txnId,
				category: displayPrimary,
				categories: displayCategoryIds
			},
			{
				onSuccess: () => {
					setCategoryDraftIds(null);
					setCategoryDraftPrimary(null);
					toast.success('Categories updated.');
				}
			}
		);
	};

	const columns = useMemo(
		() => [
			{
				key: 'title',
				label: 'Title',
				editable: true,
				required: true,
				className: 'w-[40%]',
				purchaseHint: true
			},
			{
				key: 'cost',
				label: 'Price',
				editable: true,
				align: 'right',
				inputType: 'number',
				className: 'w-[12%]',
				getDisplay: (row) => formatCost(row.cost),
				getDraft: (row) => String(row.cost ?? '')
			},
			{
				key: 'quantity',
				label: 'Qty',
				editable: true,
				type: 'qty-unit',
				unitKey: 'unit',
				unitOptions: UNIT_OPTIONS,
				align: 'right',
				className: 'w-[14%]',
				getDisplay: (row) => `${formatQty(row.quantity)} ${row.unit || 'pcs'}`,
				getDraft: (row) => String(row.quantity ?? ''),
				getUnitDraft: (row) => row.unit || 'pcs'
			},
			{
				key: 'line_total',
				label: 'Total',
				align: 'right',
				className: 'w-[12%]',
				getDisplay: (row) => formatCost(lineTotal(row))
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
				key: 'actions',
				label: '',
				type: 'actions',
				actions: ['info', 'duplicate', 'delete'],
				className: 'w-[6.75rem]'
			}
		],
		[]
	);

	const openExport = async () => {
		if (!txn || exporting || !hasItems) return;
		setExporting(true);
		try {
			const allItems = await fetchAllCostItems(txnId);
			if (!allItems.length) {
				toast.error('No items to export.');
				return;
			}
			const { canvas } = renderGroceryReceiptCanvas(txn, allItems);
			const blob = await canvasToBlob(canvas);
			const filename = groceryFilename(txn);
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
			toast.error('Could not generate image.');
		} finally {
			setExporting(false);
		}
	};

	if (txnLoading) return <LoadingScreen />;
	if (txnError || !txn) {
		return (
			<EmptyState
				icon={ArrowLeftRight}
				title="Transaction not found"
				description="This transaction does not exist or you do not have access."
				action={<Button onClick={() => navigate('/transactions')}>Back to transactions</Button>}
			/>
		);
	}

	return (
		<FadeIn>
			<div>
				<StickyPageChrome>
					<Link
						to="/transactions"
						className="text-muted hover:text-fg inline-flex items-center gap-1 text-sm"
					>
						<ArrowLeft size={14} /> Transactions
					</Link>

					<PageHeader
						title={txn.title || 'Untitled'}
						icon={ArrowLeftRight}
						description={`${txn.type} · ${formatCost(txn.amount)}${
							txn.date_effective ? ` · ${formatDate(txn.date_effective)}` : ''
						}${
							sources.find((s) => s.id === txn.source)
								? ` · ${sources.find((s) => s.id === txn.source).name}`
								: ''
						}`}
						className="mb-0"
						actions={
							isExpense ? (
								<div className="flex flex-wrap gap-2">
									{canEdit && !mobile && (
										<Button variant="secondary" onClick={() => setScanOpen(true)}>
											<ScanLine size={16} /> Scan receipt
										</Button>
									)}
									<Button
										variant="secondary"
										onClick={openExport}
										loading={exporting}
										disabled={!hasItems}
									>
										<ImageDown size={16} /> Export image
									</Button>
									{canEdit && (
										<Button onClick={addItem} loading={createItem.isPending}>
											<Plus size={16} /> Add item
										</Button>
									)}
								</div>
							) : null
						}
					/>
				</StickyPageChrome>

				{(sourceOptions.length > 0 || txn.receipt_image) && (
					<div className="mb-4 flex flex-wrap items-stretch gap-3">
						{txn.receipt_image && (
							<button
								type="button"
								onClick={() => setReceiptOpen(true)}
								className={cn(
									'border-line bg-surface flex min-h-[6.5rem] w-fit shrink-0 flex-col items-center justify-center gap-1.5 rounded-md border p-2',
									'hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-colors',
									'focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2'
								)}
								aria-label="View receipt image"
							>
								<img
									src={mediaUrl(txn.receipt_image)}
									alt=""
									className="border-line h-16 w-16 rounded-md border object-cover"
								/>
							</button>
						)}
						{sourceOptions.length > 0 && (
							<div className="border-line bg-surface flex min-h-[6.5rem] max-w-xs min-w-[12rem] flex-1 flex-col justify-center rounded-md border px-3 py-2">
								<Select
									label="Source"
									value={txn.source != null ? String(txn.source) : ''}
									disabled={!canEdit || updateTxn.isPending}
									onChange={(e) => {
										const next = Number(e.target.value);
										if (!next || next === txn.source) return;
										updateTxn.mutate({ id: txn.id, source: next });
									}}
								>
									{sourceOptions.map((s) => (
										<option key={s.id} value={s.id}>
											{s.name}
											{s.status === 'archived' ? ' (archived)' : ''}
										</option>
									))}
								</Select>
							</div>
						)}
					</div>
				)}

				{isExpense && (
					<div className="border-line bg-surface mb-4 rounded-md border px-3 py-2">
						<div className="flex flex-col gap-2">
							<div>
								<span className="text-fg text-sm font-medium">Categories</span>
							</div>
							<div
								className={cn(
									'grid grid-cols-8 gap-1.5',
									(!canEdit || updateTxn.isPending) && 'pointer-events-none opacity-60'
								)}
								role="group"
								aria-label="Expense categories"
							>
								{categoryOptions.length === 0 ? (
									<p className="text-muted col-span-8 px-0.5 py-1 text-xs">
										No expense categories.
									</p>
								) : (
									categoryOptions.map((opt) => {
										const id = Number(opt.value);
										const checked = displayCategoryIds.map(Number).includes(id);
										const isPrimary = checked && Number(displayPrimary) === id;
										const atCap = !checked && displayCategoryIds.length >= MAX_EXPENSE_CATEGORIES;
										return (
											<div
												key={opt.value}
												className={cn(
													'relative flex min-w-0 flex-col items-center',
													checked && 'bg-primary/8 rounded-md'
												)}
											>
												<IconChoice
													icon={opt.icon || Tag}
													label={opt.label}
													selected={checked}
													disabled={!canEdit || updateTxn.isPending || atCap}
													onClick={() => toggleHeaderCategory(id)}
													ariaLabel={
														checked
															? `Deselect category ${opt.label}`
															: `Select category ${opt.label}`
													}
												/>
												{checked && (
													<button
														type="button"
														className={cn(
															'absolute top-0.5 right-0.5 cursor-pointer rounded p-0.5',
															'text-muted hover:text-primary',
															'focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-1',
															isPrimary && 'text-primary'
														)}
														title={isPrimary ? 'Primary category' : 'Set as primary'}
														aria-label={
															isPrimary ? 'Primary category' : `Set ${opt.label} as primary`
														}
														disabled={!canEdit || updateTxn.isPending}
														onClick={() => setHeaderPrimary(id)}
													>
														<Star size={11} fill={isPrimary ? 'currentColor' : 'none'} />
													</button>
												)}
											</div>
										);
									})
								)}
							</div>
						</div>
						{editingCategories && (
							<div className="flex justify-end gap-2">
								<Button
									variant="secondary"
									size="sm"
									onClick={() => {
										setCategoryDraftIds(null);
										setCategoryDraftPrimary(null);
									}}
								>
									Cancel
								</Button>
								<Button size="sm" loading={updateTxn.isPending} onClick={saveHeaderCategories}>
									Save
								</Button>
							</div>
						)}
					</div>
				)}

				{!isExpense ? (
					<EmptyState
						icon={ArrowLeftRight}
						title="Header-only transaction"
						description="Income and transfers do not have line items. On mobile, long-press the row in Transactions to edit header fields; on desktop, edit them in the list."
					/>
				) : (
					<>
						<ListToolbar
							search={search}
							onSearchChange={setSearch}
							searchPlaceholder="Search items…"
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

						<LoadingSwap loading={isLoading}>
							{isError ? (
								<EmptyState icon={ArrowLeftRight} title="Could not load items" />
							) : (
								<DataSheet
									rows={items}
									columns={columns}
									ordering={ordering}
									defaultOrdering={DEFAULT_ORDERING}
									onOrderingChange={setOrdering}
									onCommit={commitCell}
									onAdd={canEdit ? addItem : undefined}
									onRequestDelete={canEdit ? setDeleteTarget : undefined}
									onRequestDuplicate={canEdit ? duplicateItem : undefined}
									onRequestInfo={setInfoTarget}
									onBulkDelete={canEdit ? setBulkDeleteIds : undefined}
									selectable={canEdit}
									readOnly={!canEdit}
									adding={createItem.isPending || duplicating}
									saving={updateItem.isPending || updateTxn.isPending || duplicating}
									autoEdit={autoEdit}
									addLabel="Add item"
									emptyMessage="No line items. Add rows or scan a receipt."
								/>
							)}
						</LoadingSwap>
					</>
				)}

				<Modal
					open={Boolean(deleteTarget)}
					onClose={() => !removeItem.isPending && setDeleteTarget(null)}
					title="Delete item"
					size="sm"
					footer={
						<>
							<Button variant="secondary" onClick={() => setDeleteTarget(null)}>
								Cancel
							</Button>
							<Button
								variant="danger"
								loading={removeItem.isPending}
								onClick={() => removeItem.mutate(deleteTarget.id)}
							>
								Delete
							</Button>
						</>
					}
				>
					<p className="text-muted text-sm">
						Delete <span className="text-fg font-medium">{deleteTarget?.title}</span>?
					</p>
				</Modal>

				<Modal
					open={Boolean(bulkDeleteIds?.length)}
					onClose={() => !bulkDeleting && setBulkDeleteIds(null)}
					title="Delete selected items"
					size="sm"
					footer={
						<>
							<Button variant="secondary" onClick={() => setBulkDeleteIds(null)}>
								Cancel
							</Button>
							<Button
								variant="danger"
								loading={bulkDeleting}
								onClick={async () => {
									setBulkDeleting(true);
									try {
										await Promise.all(bulkDeleteIds.map((i) => removeItem.mutateAsync(i)));
										toast.success('Deleted.');
										setBulkDeleteIds(null);
									} catch {
										toast.error('Could not delete some items.');
									} finally {
										setBulkDeleting(false);
									}
								}}
							>
								Delete {bulkDeleteIds?.length || 0}
							</Button>
						</>
					}
				>
					<p className="text-muted text-sm">Delete selected line items?</p>
				</Modal>

				<RecordInfoModal
					open={Boolean(infoTarget)}
					onClose={() => setInfoTarget(null)}
					title="Line item"
					fields={
						infoTarget
							? [
									{ label: 'Title', value: infoTarget.title },
									{ label: 'Price', value: formatCost(infoTarget.cost) },
									{
										label: 'Quantity',
										value: `${formatQty(infoTarget.quantity)} ${infoTarget.unit || 'pcs'}`
									},
									{ label: 'Line total', value: formatCost(lineTotal(infoTarget)) },
									{
										label: 'Status',
										value: (
											<Badge
												tone={STATUS_TONE[infoTarget.status] || 'neutral'}
												className="capitalize"
											>
												{infoTarget.status}
											</Badge>
										)
									}
								]
							: []
					}
				/>

				<Modal
					open={receiptOpen}
					onClose={() => setReceiptOpen(false)}
					title="Receipt"
					size="lg"
					footer={
						<Button variant="secondary" onClick={() => setReceiptOpen(false)}>
							Close
						</Button>
					}
				>
					<div className="bg-surface-2 flex justify-center rounded-md p-3">
						<img
							src={mediaUrl(txn.receipt_image)}
							alt={`Receipt for ${txn.title || 'transaction'}`}
							className="max-h-[70vh] w-auto max-w-full rounded-sm object-contain"
						/>
					</div>
				</Modal>

				<GroceryExportModal
					open={exportOpen}
					onClose={() => {
						setExportOpen(false);
						setExportBlob(null);
						setPreviewUrl((prev) => {
							if (prev) URL.revokeObjectURL(prev);
							return '';
						});
					}}
					previewUrl={previewUrl}
					onDownload={() => {
						if (exportBlob && exportName) {
							downloadBlob(exportBlob, exportName);
							toast.success('Image downloaded.');
						}
					}}
					canShare={canShare}
					sharing={sharing}
					onShare={async () => {
						if (!exportBlob || !exportName) return;
						setSharing(true);
						try {
							const file = new File([exportBlob], exportName, { type: 'image/png' });
							await shareImageFile(file, txn?.title);
						} catch (err) {
							if (err?.name !== 'AbortError') toast.error('Could not share image.');
						} finally {
							setSharing(false);
						}
					}}
				/>

				{!mobile && (
					<ReceiptImportModal
						open={scanOpen}
						onClose={() => setScanOpen(false)}
						categories={expenseCategories}
						incomeCategories={incomeCategories}
						defaultCategoryId={defaultCategoryId}
						onCommitted={() => {
							queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
							queryClient.invalidateQueries({ queryKey: ['finance-transaction-items'] });
							queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
						}}
					/>
				)}
			</div>
		</FadeIn>
	);
}
