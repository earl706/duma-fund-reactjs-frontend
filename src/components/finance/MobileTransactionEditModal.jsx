import { useEffect, useMemo, useState } from 'react';

import { formatDateShort, parseDateShort } from '../../lib/format';
import { Button, Input, Modal, Select } from '../ui';
import { CategoryMultiSelect, MAX_EXPENSE_CATEGORIES } from './CategoryMultiSelect';
import { MoneyField } from './MoneyField';

const TYPE_OPTIONS = [
	{ value: 'expense', label: 'Expense' },
	{ value: 'income', label: 'Income' },
	{ value: 'transfer_in', label: 'Transfer in' },
	{ value: 'transfer_out', label: 'Transfer out' }
];

const STATUS_OPTIONS = [
	{ value: 'active', label: 'Active' },
	{ value: 'archived', label: 'Archived' }
];

function seedForm(row) {
	if (!row) return null;
	const expenseIds =
		row.type === 'expense'
			? (row.categories?.length ? row.categories : row.category != null ? [row.category] : []).map(
					Number
				)
			: [];
	return {
		type: row.type || 'expense',
		source: row.source != null ? String(row.source) : '',
		title: row.title || '',
		merchant: row.merchant || '',
		amount: row.amount != null ? String(row.amount) : '',
		categoryIds: expenseIds,
		primaryCategoryId: row.category != null ? Number(row.category) : (expenseIds[0] ?? null),
		incomeCategory: row.type === 'income' && row.category != null ? String(row.category) : '',
		status: row.status || 'active',
		is_partial: Boolean(row.is_partial),
		date_effective: row.date_effective ? formatDateShort(row.date_effective) : ''
	};
}

/**
 * Mobile long-press editor for transaction header fields (desktop DataSheet parity).
 */
export function MobileTransactionEditModal({
	open,
	row,
	sourceOptions = [],
	expenseOptions = [],
	incomeOptions = [],
	defaultExpenseCategoryId,
	defaultIncomeCategoryId,
	saving = false,
	onClose,
	onSave
}) {
	const [form, setForm] = useState(() => seedForm(row));
	const [error, setError] = useState('');

	useEffect(() => {
		if (open) {
			setForm(seedForm(row));
			setError('');
		}
	}, [open, row]);

	const amountLocked = form?.type === 'expense' && Number(row?.item_count) > 0;

	const sourceSelectOpts = useMemo(() => {
		if (!form?.source) return sourceOptions;
		if (sourceOptions.some((o) => String(o.value) === String(form.source))) return sourceOptions;
		return [{ value: String(form.source), label: `Source #${form.source}` }, ...sourceOptions];
	}, [form?.source, sourceOptions]);

	if (!form) return null;

	const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

	const onTypeChange = (nextType) => {
		setForm((prev) => {
			const next = { ...prev, type: nextType };
			if (nextType === 'transfer_in' || nextType === 'transfer_out') {
				next.categoryIds = [];
				next.primaryCategoryId = null;
				next.incomeCategory = '';
				next.is_partial = false;
			} else if (nextType === 'income') {
				next.categoryIds = [];
				next.primaryCategoryId = null;
				next.is_partial = false;
				if (!next.incomeCategory && defaultIncomeCategoryId != null) {
					next.incomeCategory = String(defaultIncomeCategoryId);
				}
			} else if (nextType === 'expense') {
				next.incomeCategory = '';
				if (!next.categoryIds.length && defaultExpenseCategoryId != null) {
					next.categoryIds = [defaultExpenseCategoryId];
					next.primaryCategoryId = defaultExpenseCategoryId;
				}
			}
			return next;
		});
	};

	const submit = () => {
		setError('');
		const iso = parseDateShort(form.date_effective);
		if (!iso) {
			setError('Use date format DD/MM/YY.');
			return;
		}
		if (!form.source) {
			setError('Choose a source.');
			return;
		}

		const body = {
			id: row.id,
			type: form.type,
			source: Number(form.source),
			title: form.title,
			merchant: form.merchant,
			status: form.status,
			is_partial: form.type === 'expense' ? Boolean(form.is_partial) : false,
			date_effective: iso
		};

		if (!amountLocked) {
			const amount = form.amount === '' ? '0' : form.amount;
			if (Number.isNaN(Number(amount))) {
				setError('Enter a valid amount.');
				return;
			}
			body.amount = amount;
		}

		if (form.type === 'transfer_in' || form.type === 'transfer_out') {
			body.category = null;
			body.categories = [];
		} else if (form.type === 'income') {
			const cat =
				form.incomeCategory ||
				(defaultIncomeCategoryId != null ? String(defaultIncomeCategoryId) : '');
			if (!cat) {
				setError('Create an income category first.');
				return;
			}
			body.category = Number(cat);
			body.categories = [];
		} else {
			const ids = form.categoryIds.map(Number).filter((n) => !Number.isNaN(n));
			if (!ids.length) {
				if (defaultExpenseCategoryId == null) {
					setError('Create an expense category first.');
					return;
				}
				body.category = defaultExpenseCategoryId;
				body.categories = [defaultExpenseCategoryId];
			} else {
				const primary =
					form.primaryCategoryId != null && ids.includes(Number(form.primaryCategoryId))
						? Number(form.primaryCategoryId)
						: ids[0];
				body.category = primary;
				body.categories = ids;
			}
		}

		onSave?.(body);
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Edit transaction"
			size="md"
			footer={
				<>
					<Button variant="secondary" onClick={onClose} disabled={saving}>
						Cancel
					</Button>
					<Button onClick={submit} loading={saving}>
						Save
					</Button>
				</>
			}
		>
			<div className="space-y-4">
				<Select label="Type" value={form.type} onChange={(e) => onTypeChange(e.target.value)}>
					{TYPE_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</Select>

				<Select
					label="Source"
					value={form.source}
					placeholder="Select source"
					onChange={(e) => setField('source', e.target.value)}
				>
					{sourceSelectOpts.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</Select>

				<Input
					label="Title"
					value={form.title}
					onChange={(e) => setField('title', e.target.value)}
					placeholder="Untitled"
				/>

				<Input
					label="Store"
					value={form.merchant}
					onChange={(e) => setField('merchant', e.target.value)}
					placeholder="Unknown"
				/>

				<div className="space-y-1.5">
					<MoneyField
						id={`mobile-txn-amount-${row?.id ?? 'new'}`}
						label="Amount"
						step="0.01"
						min="0"
						value={form.amount}
						disabled={amountLocked}
						onChange={(e) => setField('amount', e.target.value)}
					/>
					{amountLocked && (
						<p className="text-muted text-xs">
							Amount comes from line items. Open the transaction to edit items.
						</p>
					)}
				</div>

				{form.type === 'expense' && (
					<div className="space-y-1.5">
						<p className="text-fg text-sm font-medium">
							Categories
							<span className="text-muted ml-1 text-xs font-normal">
								{form.categoryIds.length}/{MAX_EXPENSE_CATEGORIES} · star = primary
							</span>
						</p>
						<CategoryMultiSelect
							options={expenseOptions}
							value={form.categoryIds}
							primaryId={form.primaryCategoryId}
							onChange={({ ids, primaryId }) =>
								setForm((prev) => ({
									...prev,
									categoryIds: ids,
									primaryCategoryId: primaryId
								}))
							}
						/>
					</div>
				)}

				{form.type === 'income' && (
					<Select
						label="Category"
						value={form.incomeCategory}
						placeholder="Select category"
						onChange={(e) => setField('incomeCategory', e.target.value)}
					>
						{incomeOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</Select>
				)}

				<Select
					label="Status"
					value={form.status}
					onChange={(e) => setField('status', e.target.value)}
				>
					{STATUS_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</Select>

				{form.type === 'expense' && (
					<label className="text-muted inline-flex cursor-pointer items-center gap-2 text-sm">
						<input
							type="checkbox"
							className="border-line text-primary focus-visible:ring-primary/40 h-3.5 w-3.5 rounded-sm"
							checked={Boolean(form.is_partial)}
							onChange={(e) => setField('is_partial', e.target.checked)}
						/>
						<span className="text-fg" title="Logged items are not the full receipt total">
							Partial receipt
						</span>
					</label>
				)}

				<Input
					label="Effective (DD/MM/YY)"
					value={form.date_effective}
					onChange={(e) => setField('date_effective', e.target.value)}
					placeholder="DD/MM/YY"
					required
				/>

				{error && <p className="bg-danger/10 text-danger rounded-md px-3 py-2 text-sm">{error}</p>}
			</div>
		</Modal>
	);
}
