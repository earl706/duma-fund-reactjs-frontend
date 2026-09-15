import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Plus, ScanLine } from 'lucide-react';

import { categoriesApi, transactionsApi, useFinanceBalance } from '../lib/resources';
import { fetchAllPages } from '../lib/fetchAll';
import { isMobileApp } from '../lib/desktop';
import { firstCommittedTransactionId, mediaUrl } from '../lib/receiptScan';
import { STATUS_TONE } from '../lib/status';
import { cn, formatCost, formatDate, formatDateShort, parseDateShort } from '../lib/format';
import { toast } from '../stores/toastStore';
import { useListControls } from '../hooks/useListControls';
import { ReceiptImportModal } from '../components/finance/ReceiptImportModal';
import { MobileTransactionsView } from '../components/finance/MobileTransactionsView';
import {
	formatCategoryTags,
	MAX_EXPENSE_CATEGORIES
} from '../components/finance/CategoryMultiSelect';
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

const TYPE_OPTIONS = [
	{ value: 'expense', label: 'Expense' },
	{ value: 'income', label: 'Income' },
	{ value: 'transfer_in', label: 'Transfer in' },
	{ value: 'transfer_out', label: 'Transfer out' }
];

const SORT_OPTIONS = [
	{ value: '-date_effective', label: 'Effective (newest)' },
	{ value: 'date_effective', label: 'Effective (oldest)' },
	{ value: '-date_created', label: 'Newest first' },
	{ value: 'date_created', label: 'Oldest first' },
	{ value: '-amount', label: 'Highest amount' },
	{ value: 'title', label: 'Title A–Z' },
	{ value: 'type', label: 'Type' },
	{ value: 'status', label: 'Status' }
];

const STATUS_OPTIONS = [
	{ value: '', label: 'All statuses' },
	{ value: 'active', label: 'Active' },
	{ value: 'archived', label: 'Archived' }
];

const TYPE_FILTER = [{ value: '', label: 'All types' }, ...TYPE_OPTIONS];

/** Display-only signed amount: + inflows, − outflows (unicode minus). */
function formatSignedAmount(amount, type) {
	const formatted = formatCost(amount);
	if (formatted === '—') return formatted;
	const inflow = type === 'income' || type === 'transfer_in';
	return `${inflow ? '+' : '−'}${formatted}`;
}

function amountToneClass(type) {
	if (type === 'income' || type === 'transfer_in') return 'text-success';
	if (type === 'expense' || type === 'transfer_out') return 'text-danger';
	return 'text-fg';
}

function SignedAmount({ amount, type, className }) {
	return (
		<span className={cn('font-bold tabular-nums', amountToneClass(type), className)}>
			{formatSignedAmount(amount, type)}
		</span>
	);
}

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

function categoryLabel(cat) {
	if (!cat) return '—';
	return cat.parent_name ? `${cat.parent_name} › ${cat.name}` : cat.name;
}

export default function TransactionsPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const mobile = isMobileApp();
	const { data: balance } = useFinanceBalance();
	const { data: categoriesData } = categoriesApi.useList({ page_size: 100, kind: 'expense' });
	const { data: incomeCats } = categoriesApi.useList({ page_size: 100, kind: 'income' });

	const expenseCategories = useMemo(() => categoriesData?.results || [], [categoriesData?.results]);
	const incomeCategories = useMemo(() => incomeCats?.results || [], [incomeCats?.results]);
	const allCategories = useMemo(() => {
		const map = new Map();
		[...expenseCategories, ...incomeCategories].forEach((c) => map.set(c.id, c));
		return map;
	}, [expenseCategories, incomeCategories]);

	const defaultExpenseCategoryId =
		expenseCategories.find((c) => c.name === 'Other' && !c.parent)?.id || expenseCategories[0]?.id;
	const defaultIncomeCategoryId =
		incomeCategories.find((c) => c.name === 'Other' && !c.parent)?.id || incomeCategories[0]?.id;

	const expenseSelectOptions = useMemo(
		() => expenseCategories.map((c) => ({ value: String(c.id), label: c.name })),
		[expenseCategories]
	);
	const incomeSelectOptions = useMemo(
		() => incomeCategories.map((c) => ({ value: String(c.id), label: c.name })),
		[incomeCategories]
	);

	const { search, setSearch, ordering, setOrdering, filters, setFilter, queryParams } =
		useListControls({
			defaultOrdering: '-date_effective',
			defaultFilters: mobile ? { status: 'active' } : {}
		});

	const listParams = useMemo(() => {
		const rest = { ...queryParams };
		delete rest.page;
		delete rest.page_size;
		return rest;
	}, [queryParams]);

	const {
		data: rows = [],
		isLoading,
		isError
	} = useQuery({
		queryKey: ['finance-transactions', 'all', listParams],
		queryFn: () => fetchAllPages('/finance/transactions/', listParams)
	});

	const [deleteTarget, setDeleteTarget] = useState(null);
	const [bulkDeleteIds, setBulkDeleteIds] = useState(null);
	const [infoTarget, setInfoTarget] = useState(null);
	const [autoEdit, setAutoEdit] = useState(null);
	const [pendingFocusId, setPendingFocusId] = useState(null);
	const [bulkDeleting, setBulkDeleting] = useState(false);
	const [scanOpen, setScanOpen] = useState(false);

	useEffect(() => {
		if (pendingFocusId == null) return;
		if (!rows.some((r) => r.id === pendingFocusId)) return;
		setAutoEdit({
			id: pendingFocusId,
			field: 'title',
			key: `${pendingFocusId}-${Date.now()}`
		});
		setPendingFocusId(null);
	}, [rows, pendingFocusId]);

	const createTxn = transactionsApi.useCreate({
		onSuccess: (created) => {
			toast.success('Transaction created.');
			queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
			if (created?.id == null) return;
			if (mobile) {
				navigate(`/transactions/${created.id}`);
				return;
			}
			setAutoEdit({ id: created.id, field: 'title', key: `${created.id}-${Date.now()}` });
		}
	});
	const updateTxn = transactionsApi.useUpdate({
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance-balance'] })
	});
	const removeTxn = transactionsApi.useRemove({
		onSuccess: () => {
			toast.success('Transaction deleted.');
			setDeleteTarget(null);
			queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
		}
	});

	const addExpense = () => {
		if (createTxn.isPending || !defaultExpenseCategoryId) {
			if (!defaultExpenseCategoryId) toast.error('Create an expense category first.');
			return;
		}
		createTxn.mutate({
			type: 'expense',
			title: 'Untitled',
			amount: '0.00',
			note: '',
			category: defaultExpenseCategoryId,
			categories: [defaultExpenseCategoryId],
			status: 'active',
			date_created: todayISO(),
			date_effective: todayISO()
		});
	};

	const commitCell = ({ id, field, value, patch }) => {
		const body = patch ? { id, ...patch } : { id, [field]: value };

		if (Object.prototype.hasOwnProperty.call(body, 'date_effective')) {
			const iso = parseDateShort(body.date_effective);
			if (!iso) {
				toast.error('Use date format DD/MM/YY.');
				return;
			}
			body.date_effective = iso;
		}

		if (Array.isArray(body.categories)) {
			body.categories = body.categories.map(Number);
			if (body.category != null) body.category = Number(body.category);
		} else if (body.category === '' || body.category === undefined) {
			if (field === 'category' || field === 'categories') body.category = null;
			else delete body.category;
		} else if (body.category != null) {
			body.category = Number(body.category);
		}

		// Type changes must carry a compatible category (or none for transfers).
		if (body.type === 'transfer_in' || body.type === 'transfer_out') {
			body.category = null;
			body.categories = [];
		} else if (body.type === 'income') {
			const current =
				allCategories.get(body.category) ||
				allCategories.get(rows.find((r) => r.id === id)?.category);
			if (!current || current.kind !== 'income') {
				if (!defaultIncomeCategoryId) {
					toast.error('Create an income category first.');
					return;
				}
				body.category = defaultIncomeCategoryId;
			}
			body.categories = [];
		} else if (body.type === 'expense') {
			const row = rows.find((r) => r.id === id);
			const current = allCategories.get(body.category) || allCategories.get(row?.category);
			if (!current || current.kind !== 'expense') {
				if (!defaultExpenseCategoryId) {
					toast.error('Create an expense category first.');
					return;
				}
				body.category = defaultExpenseCategoryId;
				body.categories = [defaultExpenseCategoryId];
			} else if (!body.categories?.length) {
				body.categories = row?.categories?.length ? row.categories : [body.category];
			}
		}

		updateTxn.mutate(body);
	};

	const columns = useMemo(
		() => [
			{
				key: 'open',
				label: '',
				type: 'action-link',
				className: 'w-8',
				linkTo: (row) => `/transactions/${row.id}`,
				linkAriaLabel: (row) => `Open ${row.title || 'transaction'}`
			},
			{
				key: 'type',
				label: 'Type',
				editable: true,
				type: 'select',
				options: TYPE_OPTIONS,
				className: 'w-[12%]'
			},
			{ key: 'title', label: 'Title', editable: true, className: 'w-[20%]', purchaseHint: true },
			{
				key: 'merchant',
				label: 'Store',
				editable: true,
				className: 'w-[12%]',
				getDisplay: (row) => row.merchant || 'Unknown'
			},
			{
				key: 'amount',
				label: 'Amount',
				editable: true,
				align: 'right',
				inputType: 'number',
				className: 'w-[10%]',
				getDraft: (row) => String(row.amount ?? ''),
				render: (row) => <SignedAmount amount={row.amount} type={row.type} />
			},
			{
				key: 'categories',
				label: 'Category',
				editable: true,
				type: 'txn-category',
				required: true,
				maxSelections: MAX_EXPENSE_CATEGORIES,
				expenseOptions: expenseSelectOptions,
				incomeOptions: incomeSelectOptions,
				className: 'w-[14%]',
				getDisplay: (row) => {
					if (row.type === 'transfer_in' || row.type === 'transfer_out') return '—';
					if (row.type === 'expense') {
						return formatCategoryTags(
							row.categories?.length ? row.categories : row.category ? [row.category] : [],
							allCategories,
							row.category
						);
					}
					if (!row.category) return '—';
					const cat = allCategories.get(row.category);
					return cat ? cat.name : `#${row.category}`;
				},
				getDraft: (row) => {
					if (row.type === 'expense') {
						const ids = row.categories?.length
							? row.categories
							: row.category
								? [row.category]
								: [];
						return JSON.stringify({ ids, primaryId: row.category ?? ids[0] ?? null });
					}
					return row.category != null ? String(row.category) : '';
				},
				buildPatch: (ids, primaryId) => ({
					category: primaryId,
					categories: ids
				})
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
				inputType: 'text',
				required: true,
				className: 'w-[11%]',
				getDisplay: (row) => (row.date_effective ? formatDateShort(row.date_effective) : '—'),
				getDraft: (row) => (row.date_effective ? formatDateShort(row.date_effective) : '')
			},
			{
				key: 'actions',
				label: '',
				type: 'actions',
				actions: ['info', 'delete'],
				className: 'w-[4.5rem]'
			}
		],
		[allCategories, expenseSelectOptions, incomeSelectOptions]
	);

	const infoFields = (txn) => {
		if (!txn) return [];
		const cat = txn.category != null ? allCategories.get(txn.category) : null;
		const expenseTags =
			txn.type === 'expense'
				? formatCategoryTags(
						txn.categories?.length ? txn.categories : txn.category ? [txn.category] : [],
						allCategories,
						txn.category
					)
				: categoryLabel(cat);
		return [
			{ label: 'Title', value: txn.title || '—' },
			{ label: 'Store', value: txn.merchant || 'Unknown' },
			{ label: 'Type', value: txn.type },
			{
				label: 'Amount',
				value: <SignedAmount amount={txn.amount} type={txn.type} />
			},
			{ label: 'Category', value: expenseTags },
			{
				label: 'Status',
				value: (
					<Badge tone={STATUS_TONE[txn.status] || 'neutral'} className="capitalize">
						{txn.status}
					</Badge>
				)
			},
			{ label: 'Effective', value: txn.date_effective ? formatDate(txn.date_effective) : '—' },
			{ label: 'Note', value: txn.note || '—' },
			{
				label: 'Receipt',
				value: txn.receipt_image ? (
					<a
						href={mediaUrl(txn.receipt_image)}
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
			{ label: 'ID', value: txn.id },
			{ label: 'UUID', value: txn.uuid }
		];
	};

	if (mobile) {
		return (
			<MobileTransactionsView
				balance={balance}
				rows={rows}
				isLoading={isLoading}
				isError={isError}
				search={search}
				setSearch={setSearch}
				filters={filters}
				setFilter={setFilter}
				onAdd={addExpense}
				adding={createTxn.isPending}
			/>
		);
	}

	return (
		<div>
			<PageHeader
				title="Transactions"
				icon={ArrowLeftRight}
				description={
					balance
						? `Balance ${formatCost(balance.balance)} · start ${formatCost(balance.starting_balance)}`
						: 'Income, expenses, and transfers.'
				}
				actions={
					<div className="flex flex-wrap gap-2">
						{!mobile && (
							<Button variant="secondary" onClick={() => setScanOpen(true)}>
								<ScanLine size={16} /> Scan receipt
							</Button>
						)}
						<Button onClick={addExpense} loading={createTxn.isPending}>
							<Plus size={16} /> New expense
						</Button>
					</div>
				}
			/>

			<ListToolbar
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search transactions…"
				ordering={ordering}
				onOrderingChange={setOrdering}
				sortOptions={SORT_OPTIONS}
				filters={[
					{
						key: 'type',
						label: 'Type',
						value: filters.type || '',
						onChange: (v) => setFilter('type', v),
						options: TYPE_FILTER
					},
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
					icon={ArrowLeftRight}
					title="Could not load transactions"
					description="Something went wrong while fetching your ledger."
				/>
			) : (
				<DataSheet
					rows={rows}
					columns={columns}
					onCommit={commitCell}
					onAdd={addExpense}
					onRequestDelete={setDeleteTarget}
					onRequestInfo={setInfoTarget}
					onBulkDelete={setBulkDeleteIds}
					selectable
					adding={createTxn.isPending}
					saving={updateTxn.isPending}
					autoEdit={autoEdit}
					addLabel="New expense"
					emptyMessage="No transactions yet. Scan a receipt or add an expense."
				/>
			)}

			<Modal
				open={Boolean(deleteTarget)}
				onClose={() => !removeTxn.isPending && setDeleteTarget(null)}
				title="Delete transaction"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={() => setDeleteTarget(null)}
							disabled={removeTxn.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="danger"
							loading={removeTxn.isPending}
							onClick={() => removeTxn.mutate(deleteTarget.id)}
						>
							Delete
						</Button>
					</>
				}
			>
				<p className="text-muted text-sm">
					Delete{' '}
					<span className="text-fg font-medium">{deleteTarget?.title || 'this transaction'}</span>?
					Line items will be removed. This cannot be undone.
				</p>
			</Modal>

			<Modal
				open={Boolean(bulkDeleteIds?.length)}
				onClose={() => !bulkDeleting && setBulkDeleteIds(null)}
				title="Delete selected"
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
						<Button
							variant="danger"
							loading={bulkDeleting}
							onClick={async () => {
								setBulkDeleting(true);
								try {
									await Promise.all(bulkDeleteIds.map((id) => removeTxn.mutateAsync(id)));
									toast.success('Deleted.');
									setBulkDeleteIds(null);
									queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
								} catch {
									toast.error('Could not delete some transactions.');
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
				<p className="text-muted text-sm">
					Delete <span className="text-fg font-medium">{bulkDeleteIds?.length || 0}</span> selected
					transactions?
				</p>
			</Modal>

			<RecordInfoModal
				open={Boolean(infoTarget)}
				onClose={() => setInfoTarget(null)}
				title="Transaction"
				fields={infoFields(infoTarget)}
			/>

			{!mobile && (
				<ReceiptImportModal
					open={scanOpen}
					onClose={() => setScanOpen(false)}
					categories={expenseCategories}
					incomeCategories={incomeCategories}
					onCommitted={async (created) => {
						const focusId = firstCommittedTransactionId(created);
						// Newest logged first — receipt date_effective often buries new rows mid-list.
						setOrdering('-date_created');
						if (focusId != null) setPendingFocusId(focusId);
						await queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
						queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
						queryClient.invalidateQueries({ queryKey: ['finance-analytics'] });
					}}
				/>
			)}
		</div>
	);
}
