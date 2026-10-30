import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, BookUser, FileDown, FileUp, Plus, ScanLine } from 'lucide-react';

import { cashSourceId, resolveSourceId, sourceSelectOptions } from '../lib/balanceSources';
import { categoriesApi, sourcesApi, transactionsApi, useFinanceBalance } from '../lib/resources';
import { del, post } from '../lib/api';
import { fetchAllPages } from '../lib/fetchAll';
import { isMobileApp } from '../lib/desktop';
import { downloadBlob } from '../lib/groceryReceipt';
import { firstCommittedTransactionId, mediaUrl } from '../lib/receiptScan';
import { STATUS_TONE } from '../lib/status';
import { cn, formatCost, formatDate, formatDateShort, parseDateShort } from '../lib/format';
import {
	categoryPath,
	defaultCategoryId,
	mapLimit,
	parseTransactionsCsv,
	resolveCategories,
	serializeTransactionsCsv
} from '../lib/transactionCsv';
import { toast } from '../stores/toastStore';
import { useActiveProfileId, useCanEditLedger, useProfileStore } from '../stores/profileStore';
import { useListControls } from '../hooks/useListControls';
import { AccountsInformationModal } from '../components/finance/AccountsInformationModal';
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

const DEFAULT_ORDERING = '-date_effective';

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
	const canEdit = useCanEditLedger();
	const profileId = useActiveProfileId();
	const { data: categoriesData } = categoriesApi.useList({ page_size: 100, kind: 'expense' });
	const { data: incomeCats } = categoriesApi.useList({ page_size: 100, kind: 'income' });
	const { data: sourcesData } = sourcesApi.useList({ page_size: 100 });

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

	const sources = useMemo(() => sourcesData?.results || [], [sourcesData?.results]);
	const sourcesById = useMemo(() => {
		const map = new Map();
		sources.forEach((s) => map.set(s.id, s));
		return map;
	}, [sources]);
	const sourceSelectOpts = useMemo(
		() =>
			sourceSelectOptions(sources).map((s) => ({
				value: String(s.id),
				label: s.name
			})),
		[sources]
	);

	const { search, setSearch, ordering, setOrdering, filters, setFilter, queryParams } =
		useListControls({
			defaultOrdering: DEFAULT_ORDERING,
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
		queryKey: ['finance-transactions', 'all', profileId, listParams],
		queryFn: () => fetchAllPages('/finance/transactions/', listParams),
		enabled: profileId != null
	});

	const [deleteTarget, setDeleteTarget] = useState(null);
	const [bulkDeleteIds, setBulkDeleteIds] = useState(null);
	const [infoTarget, setInfoTarget] = useState(null);
	const [autoEdit, setAutoEdit] = useState(null);
	const [pendingFocusId, setPendingFocusId] = useState(null);
	const [bulkDeleting, setBulkDeleting] = useState(false);
	const [duplicating, setDuplicating] = useState(false);
	const [scanOpen, setScanOpen] = useState(false);
	const [accountsOpen, setAccountsOpen] = useState(false);
	const [selectedIds, setSelectedIds] = useState([]);
	const [importDraft, setImportDraft] = useState(null);
	const [csvBusy, setCsvBusy] = useState(false);
	const [csvProgress, setCsvProgress] = useState('');
	/** Row id → column keys waiting on PATCH (optimistic UI + spinner). */
	const [pendingCells, setPendingCells] = useState({});
	const fileInputRef = useRef(null);
	const txnListKey = useMemo(
		() => ['finance-transactions', 'all', profileId, listParams],
		[profileId, listParams]
	);
	const onSelectionChange = useCallback((ids) => setSelectedIds(ids), []);
	const profileName = useProfileStore(
		(s) => s.profiles.find((p) => p.id === s.activeProfileId)?.name
	);

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

	const duplicateTxn = async (row) => {
		if (duplicating || !row?.id) return;
		setDuplicating(true);
		try {
			const isTransfer = row.type === 'transfer_in' || row.type === 'transfer_out';
			const categoryIds = row.categories?.length
				? row.categories.map(Number)
				: row.category != null
					? [Number(row.category)]
					: [];
			const created = await post('/finance/transactions/', {
				type: row.type,
				title: row.title || '',
				merchant: row.merchant || '',
				amount: row.amount ?? '0.00',
				note: row.note || '',
				source: row.source ?? undefined,
				category: isTransfer ? null : (row.category ?? null),
				categories: isTransfer ? [] : categoryIds,
				status: row.status || 'active',
				date_created: todayISO(),
				date_effective: todayISO()
			});
			if (row.type === 'expense' && Number(row.item_count) > 0 && created?.id != null) {
				const items = await fetchAllPages(`/finance/transactions/${row.id}/items/`);
				await Promise.all(
					items.map((item) =>
						post(`/finance/transactions/${created.id}/items/`, {
							title: item.title,
							cost: item.cost,
							quantity: item.quantity,
							unit: item.unit,
							status: item.status
						})
					)
				);
			}
			toast.success('Transaction duplicated.');
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
			toast.error('Could not duplicate transaction.');
		} finally {
			setDuplicating(false);
		}
	};

	const exportRows = useMemo(() => {
		if (selectedIds.length) {
			const picked = new Set(selectedIds);
			return rows.filter((r) => picked.has(r.id));
		}
		return rows;
	}, [rows, selectedIds]);

	const refreshLedger = async () => {
		await queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
		queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
		queryClient.invalidateQueries({ queryKey: ['finance-analytics'] });
	};

	const exportCsv = async () => {
		if (csvBusy) return;
		if (!exportRows.length) {
			toast.error(
				selectedIds.length ? 'No selected transactions to export.' : 'Nothing to export.'
			);
			return;
		}
		setCsvBusy(true);
		setCsvProgress('Preparing export…');
		try {
			const [expenseCats, incomeCats, sourceRows] = await Promise.all([
				fetchAllPages('/finance/categories/', { kind: 'expense' }),
				fetchAllPages('/finance/categories/', { kind: 'income' }),
				fetchAllPages('/finance/sources/')
			]);
			const byId = new Map();
			[...expenseCats, ...incomeCats].forEach((c) => byId.set(c.id, c));
			const sourceNames = new Map(sourceRows.map((s) => [s.id, s.name]));
			const records = await mapLimit(exportRows, 6, async (row) => {
				const names =
					row.type === 'transfer_in' || row.type === 'transfer_out'
						? []
						: row.type === 'expense'
							? (row.categories?.length ? row.categories : row.category ? [row.category] : [])
									.map((id) => categoryPath(byId.get(id), byId))
									.filter(Boolean)
							: row.category != null
								? [categoryPath(byId.get(row.category), byId)].filter(Boolean)
								: [];
				let items = [];
				if (row.type === 'expense' && Number(row.item_count) > 0) {
					items = await fetchAllPages(`/finance/transactions/${row.id}/items/`);
				}
				return {
					type: row.type,
					title: row.title || '',
					merchant: row.merchant || '',
					amount: row.amount ?? '0.00',
					note: row.note || '',
					sourceName: sourceNames.get(row.source) || '',
					categoryNames: names,
					status: row.status || 'active',
					date_created: row.date_created || '',
					date_effective: row.date_effective || '',
					items
				};
			});
			const csv = serializeTransactionsCsv(records);
			const slug = String(profileName || 'ledger')
				.replace(/[^\w\-]+/g, '-')
				.replace(/-+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 40);
			downloadBlob(
				new Blob([csv], { type: 'text/csv;charset=utf-8' }),
				`transactions-${slug || 'ledger'}-${todayISO()}.csv`
			);
			const n = records.length;
			const itemCount = records.reduce((sum, rec) => sum + (rec.items?.length || 0), 0);
			toast.success(
				selectedIds.length
					? `Exported ${n} selected transaction${n === 1 ? '' : 's'}${itemCount ? ` · ${itemCount} items` : ''}.`
					: `Exported ${n} transaction${n === 1 ? '' : 's'}${itemCount ? ` · ${itemCount} items` : ''}.`
			);
		} catch {
			toast.error('Could not export transactions.');
		} finally {
			setCsvBusy(false);
			setCsvProgress('');
		}
	};

	const onPickCsv = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file || csvBusy) return;
		try {
			const text = await file.text();
			const { transactions, warnings } = parseTransactionsCsv(text);
			if (!transactions.length) {
				toast.error(warnings[0] || 'No transactions found in that file.');
				return;
			}
			setImportDraft({ transactions, warnings, fileName: file.name });
		} catch {
			toast.error('Could not read that CSV file.');
		}
	};

	const createImportedTransaction = async (draft, categoryLists) => {
		const isTransfer = draft.type === 'transfer_in' || draft.type === 'transfer_out';
		const kind = draft.type === 'income' ? 'income' : 'expense';
		const fallbackId = defaultCategoryId(categoryLists, kind);
		const resolved = isTransfer
			? { category: null, categories: [] }
			: resolveCategories(
					draft.categoryNames,
					kind,
					categoryLists,
					fallbackId,
					draft.type === 'expense' ? MAX_EXPENSE_CATEGORIES : 1
				);
		const body = {
			type: draft.type,
			title: draft.title || '',
			merchant: draft.merchant || '',
			amount: draft.amount ?? '0.00',
			note: draft.note || '',
			source: draft.source ?? undefined,
			category: isTransfer ? null : resolved.category,
			categories: draft.type === 'expense' ? resolved.categories : [],
			status: draft.status || 'active',
			date_created: draft.date_created || todayISO(),
			date_effective: draft.date_effective || todayISO()
		};
		if (!isTransfer && body.category == null) {
			throw new Error(
				draft.type === 'income'
					? 'Create an income category first.'
					: 'Create an expense category first.'
			);
		}
		const created = await post('/finance/transactions/', body);
		if (draft.type === 'expense' && draft.items?.length && created?.id != null) {
			await mapLimit(draft.items, 4, (item) =>
				post(`/finance/transactions/${created.id}/items/`, {
					title: item.title,
					cost: item.cost,
					quantity: item.quantity,
					unit: item.unit,
					status: item.status
				})
			);
		}
		return created;
	};

	const commitImport = async (mode) => {
		if (!importDraft?.transactions?.length || csvBusy) return;
		setCsvBusy(true);
		const drafts = importDraft.transactions;
		try {
			setCsvProgress('Loading categories…');
			const [expenseCats, incomeCats, sourceRows] = await Promise.all([
				fetchAllPages('/finance/categories/', { kind: 'expense' }),
				fetchAllPages('/finance/categories/', { kind: 'income' }),
				fetchAllPages('/finance/sources/')
			]);
			const categoryLists = [...expenseCats, ...incomeCats];
			const cashId = cashSourceId(sourceRows);

			let existingIds = [];
			if (mode === 'replace') {
				setCsvProgress('Reading current ledger…');
				const existing = await fetchAllPages('/finance/transactions/');
				existingIds = existing.map((row) => row.id);
			}

			let created = 0;
			const failures = [];
			for (let i = 0; i < drafts.length; i += 1) {
				setCsvProgress(`Importing ${i + 1} of ${drafts.length}…`);
				try {
					const draft = drafts[i];
					const sourceId = resolveSourceId(draft.sourceName, sourceRows, cashId);
					if (
						draft.sourceName &&
						sourceId === cashId &&
						draft.sourceName.trim().toLowerCase() !== 'cash'
					) {
						toast.error(`Unknown source "${draft.sourceName}"; using Cash.`);
					}
					await createImportedTransaction({ ...draft, source: sourceId }, categoryLists);
					created += 1;
				} catch (err) {
					failures.push(drafts[i].title || `Row ${i + 1}`);
					if (err?.message?.includes('category first')) {
						toast.error(err.message);
						break;
					}
				}
			}

			if (mode === 'replace' && created === drafts.length && existingIds.length) {
				setCsvProgress('Removing previous transactions…');
				await mapLimit(existingIds, 6, (id) => del(`/finance/transactions/${id}/`));
			}

			await refreshLedger();
			setImportDraft(null);

			if (created === drafts.length) {
				const extra =
					mode === 'replace' && existingIds.length
						? ` Replaced ${existingIds.length} existing.`
						: '';
				toast.success(`Imported ${created} transaction${created === 1 ? '' : 's'}.${extra}`);
			} else if (created) {
				const kept =
					mode === 'replace' ? ' Existing transactions were kept because some rows failed.' : '';
				toast.error(`Imported ${created} of ${drafts.length}. ${failures.length} failed.${kept}`);
			} else {
				toast.error('Could not import transactions.');
			}
		} catch {
			toast.error('Could not import transactions.');
		} finally {
			setCsvBusy(false);
			setCsvProgress('');
		}
	};

	const markPendingCells = (rowId, keys) => {
		if (!keys.length) return;
		setPendingCells((prev) => ({
			...prev,
			[rowId]: [...new Set([...(prev[rowId] || []), ...keys])]
		}));
	};

	const clearPendingCells = (rowId, keys) => {
		setPendingCells((prev) => {
			const current = prev[rowId];
			if (!current?.length) return prev;
			const drop = new Set(keys);
			const nextFields = current.filter((k) => !drop.has(k));
			const next = { ...prev };
			if (nextFields.length) next[rowId] = nextFields;
			else delete next[rowId];
			return next;
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

		if (body.source != null && body.source !== '') {
			body.source = Number(body.source);
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

		const { id: rowId, ...optimistic } = body;
		const pendingKeys = new Set(Object.keys(optimistic));
		if (pendingKeys.has('category') || pendingKeys.has('categories')) {
			pendingKeys.add('categories');
		}
		const uiKeys = [...pendingKeys];

		markPendingCells(rowId, uiKeys);
		queryClient.setQueryData(txnListKey, (old) => {
			if (!Array.isArray(old)) return old;
			return old.map((row) => (row.id === rowId ? { ...row, ...optimistic } : row));
		});

		updateTxn.mutate(body, {
			onError: () => {
				clearPendingCells(rowId, uiKeys);
				queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
			},
			onSettled: () => clearPendingCells(rowId, uiKeys)
		});
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
				className: 'w-[11%]'
			},
			{
				key: 'source',
				label: 'Source',
				editable: true,
				type: 'select',
				options: sourceSelectOpts,
				className: 'w-[11%]',
				getDisplay: (row) => sourcesById.get(row.source)?.name || '—'
			},
			{ key: 'title', label: 'Title', editable: true, className: 'w-[18%]', purchaseHint: true },
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
				sortKey: 'category__name',
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
				actions: ['info', 'duplicate', 'delete'],
				className: 'w-[6.75rem]'
			}
		],
		[allCategories, expenseSelectOptions, incomeSelectOptions, sourceSelectOpts, sourcesById]
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
			{ label: 'Source', value: sourcesById.get(txn.source)?.name || '—' },
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

	const deleteDialog = (
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
	);

	if (mobile) {
		return (
			<>
				<MobileTransactionsView
					balance={balance}
					rows={rows}
					sourcesById={sourcesById}
					isLoading={isLoading}
					isError={isError}
					search={search}
					setSearch={setSearch}
					filters={filters}
					setFilter={setFilter}
					onAdd={canEdit ? addExpense : undefined}
					adding={createTxn.isPending}
					onRequestDelete={canEdit ? setDeleteTarget : undefined}
					onAccounts={() => setAccountsOpen(true)}
				/>
				<AccountsInformationModal open={accountsOpen} onClose={() => setAccountsOpen(false)} />
				{deleteDialog}
			</>
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
						<Button variant="secondary" onClick={() => setAccountsOpen(true)}>
							<BookUser size={16} /> Accounts
						</Button>
						<Button variant="secondary" onClick={exportCsv} loading={csvBusy && !importDraft}>
							<FileDown size={16} /> Export
						</Button>
						{canEdit ? (
							<>
								<Button
									variant="secondary"
									onClick={() => fileInputRef.current?.click()}
									disabled={csvBusy}
								>
									<FileUp size={16} /> Import
								</Button>
								<input
									ref={fileInputRef}
									type="file"
									accept=".csv,text/csv,text/plain"
									className="hidden"
									onChange={onPickCsv}
								/>
								{!mobile && (
									<Button variant="secondary" onClick={() => setScanOpen(true)}>
										<ScanLine size={16} /> Scan receipt
									</Button>
								)}
								<Button onClick={addExpense} loading={createTxn.isPending}>
									<Plus size={16} /> New Transaction
								</Button>
							</>
						) : null}
					</div>
				}
			/>

			<ListToolbar
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search transactions…"
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
					ordering={ordering}
					defaultOrdering={DEFAULT_ORDERING}
					onOrderingChange={setOrdering}
					onCommit={commitCell}
					onAdd={canEdit ? addExpense : undefined}
					onRequestDelete={canEdit ? setDeleteTarget : undefined}
					onRequestDuplicate={canEdit ? duplicateTxn : undefined}
					onRequestInfo={setInfoTarget}
					onBulkDelete={canEdit ? setBulkDeleteIds : undefined}
					onSelectionChange={onSelectionChange}
					selectable={canEdit}
					readOnly={!canEdit}
					adding={createTxn.isPending || duplicating}
					saving={updateTxn.isPending || duplicating}
					pendingCells={pendingCells}
					autoEdit={autoEdit}
					addLabel="New transaction"
					emptyMessage="No transactions yet. Scan a receipt or add an expense."
				/>
			)}

			{deleteDialog}

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

			<Modal
				open={Boolean(importDraft)}
				onClose={() => !csvBusy && setImportDraft(null)}
				title="Import transactions"
				size="xl"
				footer={
					<>
						<Button variant="secondary" onClick={() => setImportDraft(null)} disabled={csvBusy}>
							Cancel
						</Button>
						<Button variant="secondary" onClick={() => commitImport('append')} loading={csvBusy}>
							Add to ledger
						</Button>
						<Button variant="danger" onClick={() => commitImport('replace')} disabled={csvBusy}>
							Replace all
						</Button>
					</>
				}
			>
				{importDraft ? (
					<div className="space-y-3 text-sm">
						<p className="text-muted">
							<span className="text-fg font-medium">{importDraft.fileName}</span> has{' '}
							<span className="text-fg font-medium">{importDraft.transactions.length}</span>{' '}
							transaction
							{importDraft.transactions.length === 1 ? '' : 's'}
							{(() => {
								const items = importDraft.transactions.reduce(
									(sum, txn) => sum + (txn.items?.length || 0),
									0
								);
								return items ? ` and ${items} line item${items === 1 ? '' : 's'}` : '';
							})()}
							.
						</p>
						<p className="text-muted">
							<strong className="text-fg font-medium">Add to ledger</strong> keeps existing rows and
							creates these as new transactions. Categories are matched by name; unknown names use
							Other.
						</p>
						<p className="text-muted">
							<strong className="text-fg font-medium">Replace all</strong> imports first, then
							deletes every current transaction in this profile if every row succeeds. This cannot
							be undone.
						</p>
						{importDraft.warnings?.length ? (
							<p className="text-warning">
								{importDraft.warnings.length} parse warning
								{importDraft.warnings.length === 1 ? '' : 's'}: {importDraft.warnings[0]}
							</p>
						) : null}
						{csvProgress ? <p className="text-fg">{csvProgress}</p> : null}
					</div>
				) : null}
			</Modal>

			<AccountsInformationModal open={accountsOpen} onClose={() => setAccountsOpen(false)} />

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
