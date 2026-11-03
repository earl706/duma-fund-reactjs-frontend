import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown } from 'lucide-react';

import { cn, formatDateShort, parseDateShort } from '../../lib/format';
import { Button, Input, Modal } from '../ui';
import { CategoryMultiSelect, MAX_EXPENSE_CATEGORIES } from './CategoryMultiSelect';

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

/**
 * ProfileSwitcher-style listbox: surface-2 trigger, backdrop dismiss, option list.
 * Portals the menu so Modal overflow does not clip it.
 */
function MenuSelect({
	label,
	value,
	options,
	onChange,
	placeholder = 'Select…',
	disabled = false
}) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef(null);
	const [menuStyle, setMenuStyle] = useState(null);

	const selected = useMemo(
		() => options.find((o) => String(o.value) === String(value)) || null,
		[options, value]
	);

	useLayoutEffect(() => {
		if (!open || !triggerRef.current) {
			setMenuStyle(null);
			return undefined;
		}
		const place = () => {
			const rect = triggerRef.current.getBoundingClientRect();
			const maxH = 288;
			const spaceBelow = window.innerHeight - rect.bottom - 8;
			const openUp = spaceBelow < Math.min(maxH, 160) && rect.top > spaceBelow;
			setMenuStyle({
				position: 'fixed',
				left: rect.left,
				width: rect.width,
				maxHeight: Math.min(maxH, openUp ? rect.top - 8 : spaceBelow),
				...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 })
			});
		};
		place();
		window.addEventListener('resize', place);
		window.addEventListener('scroll', place, true);
		return () => {
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
		};
	}, [open]);

	useEffect(() => {
		if (!open) return undefined;
		const onKey = (e) => e.key === 'Escape' && setOpen(false);
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open]);

	const pick = (next) => {
		onChange?.(next);
		setOpen(false);
	};

	return (
		<div className="space-y-1.5">
			{label && <p className="text-fg text-sm font-medium">{label}</p>}
			<div className="relative">
				<button
					ref={triggerRef}
					type="button"
					disabled={disabled}
					onClick={() => setOpen((v) => !v)}
					className={cn(
						'border-line bg-surface-2 hover:bg-surface-2/80 flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left',
						disabled && 'pointer-events-none opacity-60'
					)}
					aria-haspopup="listbox"
					aria-expanded={open}
				>
					<p
						className={cn(
							'min-w-0 flex-1 truncate text-sm font-medium',
							selected ? 'text-fg' : 'text-muted'
						)}
					>
						{selected?.label || placeholder}
					</p>
					<ChevronsUpDown size={16} className="text-muted shrink-0" />
				</button>
				{open &&
					createPortal(
						<>
							<button
								type="button"
								className="fixed inset-0 z-[60] cursor-default"
								aria-label={`Close ${label || 'menu'}`}
								onClick={() => setOpen(false)}
							/>
							<div
								className="border-line bg-surface z-[70] overflow-y-auto rounded-md border py-1 shadow-lg"
								style={menuStyle || undefined}
								role="listbox"
							>
								{options.length === 0 ? (
									<p className="text-muted px-3 py-1.5 text-sm">No options</p>
								) : (
									options.map((opt) => {
										const active = String(opt.value) === String(value);
										return (
											<button
												key={opt.value}
												type="button"
												role="option"
												aria-selected={active}
												onClick={() => pick(opt.value)}
												className={cn(
													'flex w-full cursor-pointer px-3 py-1.5 text-left text-sm',
													active ? 'bg-primary/10 text-fg' : 'text-fg hover:bg-surface-2'
												)}
											>
												{opt.label}
											</button>
										);
									})
								)}
							</div>
						</>,
						document.body
					)}
			</div>
		</div>
	);
}

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
			} else if (nextType === 'income') {
				next.categoryIds = [];
				next.primaryCategoryId = null;
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
				<MenuSelect label="Type" value={form.type} options={TYPE_OPTIONS} onChange={onTypeChange} />

				<MenuSelect
					label="Source"
					value={form.source}
					options={sourceSelectOpts}
					placeholder="Select source"
					onChange={(v) => setField('source', v)}
				/>

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
					<Input
						label="Amount"
						type="number"
						inputMode="decimal"
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
					<MenuSelect
						label="Category"
						value={form.incomeCategory}
						options={incomeOptions}
						placeholder="Select category"
						onChange={(v) => setField('incomeCategory', v)}
					/>
				)}

				<MenuSelect
					label="Status"
					value={form.status}
					options={STATUS_OPTIONS}
					onChange={(v) => setField('status', v)}
				/>

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
