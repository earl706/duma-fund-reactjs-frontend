import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';

import { Button, Input, Modal, Select } from '../ui';
import { MoneyField } from './MoneyField';

const STATUS_OPTIONS = [
	{ value: 'active', label: 'Active' },
	{ value: 'archived', label: 'Archived' }
];

function seedForm(row) {
	if (!row) return null;
	return {
		title: row.title || '',
		cost: row.cost != null ? String(row.cost) : '0.00',
		quantity: row.quantity != null ? String(row.quantity) : '1',
		unit: row.unit || 'pcs',
		status: row.status || 'active'
	};
}

/**
 * Mobile tap-to-edit sheet for a transaction line item (desktop DataSheet parity).
 */
export function MobileTransactionItemEditModal({
	open,
	row,
	unitOptions = [],
	saving = false,
	duplicating = false,
	onClose,
	onSave,
	onDuplicate
}) {
	const [form, setForm] = useState(() => seedForm(row));
	const [error, setError] = useState('');

	useEffect(() => {
		if (open) {
			setForm(seedForm(row));
			setError('');
		}
	}, [open, row]);

	if (!form) return null;

	const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

	const submit = () => {
		setError('');
		const title = (form.title || '').trim();
		if (!title) {
			setError('Title is required.');
			return;
		}
		const cost = form.cost === '' ? '0' : form.cost;
		const quantity = form.quantity === '' ? '0' : form.quantity;
		if (Number.isNaN(Number(cost))) {
			setError('Enter a valid price.');
			return;
		}
		if (Number.isNaN(Number(quantity))) {
			setError('Enter a valid quantity.');
			return;
		}
		onSave?.({
			id: row.id,
			title,
			cost,
			quantity,
			unit: form.unit || 'pcs',
			status: form.status || 'active'
		});
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Edit item"
			size="md"
			footer={
				<div className="flex w-full flex-wrap items-center justify-between gap-2">
					{onDuplicate ? (
						<Button
							variant="secondary"
							onClick={() => onDuplicate(row)}
							loading={duplicating}
							disabled={saving}
						>
							<Copy size={16} /> Duplicate
						</Button>
					) : (
						<span />
					)}
					<div className="flex gap-2">
						<Button variant="secondary" onClick={onClose} disabled={saving || duplicating}>
							Cancel
						</Button>
						<Button onClick={submit} loading={saving} disabled={duplicating}>
							Save
						</Button>
					</div>
				</div>
			}
		>
			<div className="space-y-4">
				<Input
					label="Title"
					value={form.title}
					onChange={(e) => setField('title', e.target.value)}
					placeholder="Untitled"
					required
				/>

				<MoneyField
					id={`mobile-item-cost-${row?.id ?? 'new'}`}
					label="Price"
					step="0.01"
					min="0"
					value={form.cost}
					onChange={(e) => setField('cost', e.target.value)}
				/>

				<div className="grid grid-cols-[1fr_7rem] gap-3">
					<Input
						label="Quantity"
						type="number"
						step="any"
						min="0"
						value={form.quantity}
						onChange={(e) => setField('quantity', e.target.value)}
					/>
					<Select label="Unit" value={form.unit} onChange={(e) => setField('unit', e.target.value)}>
						{unitOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</Select>
				</div>

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

				{error && <p className="bg-danger/10 text-danger rounded-md px-3 py-2 text-sm">{error}</p>}
			</div>
		</Modal>
	);
}
