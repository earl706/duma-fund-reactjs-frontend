import { useEffect, useRef, useState } from 'react';
import { ScanLine, Trash2 } from 'lucide-react';

import {
	bulkImportItems,
	mediaUrl,
	normalizeDraftItems,
	scanReceipt,
	UNIT_OPTIONS
} from '../../lib/receiptScan';
import { toast } from '../../stores/toastStore';
import { Button, Input, LoadingScreen, Modal } from '../ui';

function todayISO() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function updateRow(rows, key, field, value) {
	return rows.map((row) => (row._key === key ? { ...row, [field]: value } : row));
}

/**
 * Upload receipt → review extracted rows → bulk import CostItems.
 */
export function ReceiptImportModal({
	open,
	onClose,
	listId,
	onImported,
	initialReceiptUrl = null
}) {
	const fileRef = useRef(null);
	const [scanning, setScanning] = useState(false);
	const [importing, setImporting] = useState(false);
	const [rows, setRows] = useState([]);
	const [dateEffective, setDateEffective] = useState('');
	const [receiptUrl, setReceiptUrl] = useState(initialReceiptUrl);

	useEffect(() => {
		if (open) setReceiptUrl(initialReceiptUrl);
	}, [open, initialReceiptUrl]);

	const reset = () => {
		setRows([]);
		setDateEffective('');
		setReceiptUrl(initialReceiptUrl);
	};

	const handleClose = () => {
		if (scanning || importing) return;
		reset();
		onClose();
	};

	const handlePickFile = () => fileRef.current?.click();

	const handleFile = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file || !listId) return;

		setScanning(true);
		try {
			const data = await scanReceipt(listId, file);
			const effective = data.date_effective || todayISO();
			setDateEffective(effective);
			setReceiptUrl(data.receipt_image || null);
			setRows(normalizeDraftItems(data.items, effective));
			if (!data.items?.length) toast.error('No items found on the receipt.');
		} catch (err) {
			const detail = err?.response?.data?.detail;
			toast.error(detail || 'Could not scan receipt.');
		} finally {
			setScanning(false);
		}
	};

	const removeRow = (key) => setRows((prev) => prev.filter((row) => row._key !== key));

	const handleImport = async () => {
		if (!listId || !rows.length) return;

		const payload = {
			date_effective: dateEffective || undefined,
			items: rows.map(({ title, cost, quantity, unit, date_effective }) => ({
				title: title.trim(),
				cost,
				quantity,
				unit,
				date_effective: date_effective || dateEffective || undefined
			}))
		};

		if (payload.items.some((item) => !item.title)) {
			toast.error('Every row needs a title.');
			return;
		}

		setImporting(true);
		try {
			const created = await bulkImportItems(listId, payload);
			toast.success(`Added ${created.length} item${created.length === 1 ? '' : 's'}.`);
			onImported?.(created);
			reset();
			onClose();
		} catch (err) {
			const detail = err?.response?.data?.detail;
			toast.error(detail || 'Could not import items.');
		} finally {
			setImporting(false);
		}
	};

	const previewUrl = mediaUrl(receiptUrl);
	const reviewing = rows.length > 0;

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title="Scan receipt"
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={handleClose} disabled={scanning || importing}>
						Cancel
					</Button>
					{reviewing ? (
						<Button loading={importing} onClick={handleImport} disabled={scanning}>
							Add {rows.length} to list
						</Button>
					) : (
						<Button loading={scanning} onClick={handlePickFile}>
							<ScanLine size={16} /> Choose image
						</Button>
					)}
				</>
			}
		>
			<input
				ref={fileRef}
				type="file"
				accept="image/jpeg,image/png,image/webp"
				className="hidden"
				onChange={handleFile}
			/>

			{scanning ? (
				<LoadingScreen />
			) : reviewing ? (
				<div className="space-y-4">
					{previewUrl && (
						<div className="bg-surface-2 flex justify-center rounded-md p-3">
							<img
								src={previewUrl}
								alt="Scanned receipt"
								className="max-h-40 w-auto max-w-full rounded-sm object-contain"
							/>
						</div>
					)}

					<Input
						label="Effective date (all rows)"
						type="date"
						value={dateEffective}
						onChange={(e) => setDateEffective(e.target.value)}
					/>

					<div className="border-line overflow-x-auto rounded-md border">
						<table className="w-full min-w-[640px] border-collapse text-sm">
							<thead>
								<tr className="bg-surface-2 border-line border-b">
									<th className="text-muted px-2 py-2 text-left text-xs font-semibold uppercase">
										Title
									</th>
									<th className="text-muted px-2 py-2 text-right text-xs font-semibold uppercase">
										Price
									</th>
									<th className="text-muted px-2 py-2 text-right text-xs font-semibold uppercase">
										Qty
									</th>
									<th className="text-muted px-2 py-2 text-left text-xs font-semibold uppercase">
										Unit
									</th>
									<th className="w-10" />
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => (
									<tr key={row._key} className="border-line border-b last:border-b-0">
										<td className="p-1">
											<input
												className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-sm"
												value={row.title}
												onChange={(e) =>
													setRows((prev) => updateRow(prev, row._key, 'title', e.target.value))
												}
											/>
										</td>
										<td className="p-1">
											<input
												type="number"
												min="0"
												step="0.01"
												className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-right text-sm tabular-nums"
												value={row.cost}
												onChange={(e) =>
													setRows((prev) => updateRow(prev, row._key, 'cost', e.target.value))
												}
											/>
										</td>
										<td className="p-1">
											<input
												type="number"
												min="0"
												step="0.01"
												className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-right text-sm tabular-nums"
												value={row.quantity}
												onChange={(e) =>
													setRows((prev) => updateRow(prev, row._key, 'quantity', e.target.value))
												}
											/>
										</td>
										<td className="p-1">
											<select
												className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-sm"
												value={row.unit}
												onChange={(e) =>
													setRows((prev) => updateRow(prev, row._key, 'unit', e.target.value))
												}
											>
												{UNIT_OPTIONS.map((unit) => (
													<option key={unit} value={unit}>
														{unit}
													</option>
												))}
											</select>
										</td>
										<td className="p-1 text-center">
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8"
												onClick={() => removeRow(row._key)}
												aria-label={`Remove ${row.title || 'row'}`}
											>
												<Trash2 size={15} />
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<Button variant="secondary" size="sm" onClick={handlePickFile} disabled={importing}>
						Scan another image
					</Button>
				</div>
			) : (
				<div className="space-y-3">
					<p className="text-muted text-sm">
						Upload a photo of a receipt. OpenAI will extract line items for you to review before
						adding them to this list. The image is saved on the list.
					</p>
					{previewUrl && (
						<div className="bg-surface-2 flex justify-center rounded-md p-3">
							<img
								src={previewUrl}
								alt="Saved receipt"
								className="max-h-48 w-auto max-w-full rounded-sm object-contain"
							/>
						</div>
					)}
				</div>
			)}
		</Modal>
	);
}
