import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Trash2 } from 'lucide-react';

import { getCroppedImageFile } from '../../lib/cropImage';
import {
	commitReceipt,
	normalizeDraftItems,
	scanReceipt,
	UNIT_OPTIONS
} from '../../lib/receiptScan';
import { toast } from '../../stores/toastStore';
import { Button, Input, LoadingScreen, Modal } from '../ui';
import { ReceiptCropper } from './ReceiptCropper';

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

function useObjectUrl(blob) {
	const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
	useEffect(
		() => () => {
			if (url) URL.revokeObjectURL(url);
		},
		[url]
	);
	return url;
}

/**
 * Standalone receipt: pick image → crop → OCR review → commit expense txn.
 */
export function ReceiptImportModal({
	open,
	onClose,
	categories = [],
	defaultCategoryId = null,
	onCommitted
}) {
	const navigate = useNavigate();
	const fileRef = useRef(null);
	const [scanning, setScanning] = useState(false);
	const [importing, setImporting] = useState(false);
	const [originalFile, setOriginalFile] = useState(null);
	const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
	const [file, setFile] = useState(null);
	const [rows, setRows] = useState([]);
	const [dateEffective, setDateEffective] = useState('');
	const [merchant, setMerchant] = useState('');
	const [headerCategoryId, setHeaderCategoryId] = useState('');
	const sourceUrl = useObjectUrl(originalFile);
	const previewUrl = useObjectUrl(file);

	const fallbackCategoryId =
		defaultCategoryId ||
		categories.find((c) => c.name === 'Other' && !c.parent)?.id ||
		categories[0]?.id;

	const effectiveHeaderCategoryId =
		headerCategoryId || (fallbackCategoryId ? String(fallbackCategoryId) : '');

	const reset = () => {
		setRows([]);
		setDateEffective('');
		setMerchant('');
		setFile(null);
		setOriginalFile(null);
		setCroppedAreaPixels(null);
		setHeaderCategoryId('');
	};

	const handleClose = () => {
		if (scanning || importing) return;
		reset();
		onClose();
	};

	const handlePickFile = () => fileRef.current?.click();

	const handleFile = (event) => {
		const picked = event.target.files?.[0];
		event.target.value = '';
		if (!picked) return;

		setRows([]);
		setDateEffective('');
		setMerchant('');
		setFile(null);
		setHeaderCategoryId('');
		setCroppedAreaPixels(null);
		setOriginalFile(picked);
	};

	const handleScanCrop = async () => {
		if (!sourceUrl || !originalFile || !croppedAreaPixels) {
			toast.error('Crop the receipt first.');
			return;
		}

		setScanning(true);
		try {
			const cropped = await getCroppedImageFile(sourceUrl, croppedAreaPixels, originalFile);
			const data = await scanReceipt(cropped);
			if (!data.items?.length) {
				toast.error('No items found on the receipt.');
				return;
			}
			const effective = data.date_effective || todayISO();
			const headerCat = data.category_id || fallbackCategoryId;
			setFile(cropped);
			setOriginalFile(null);
			setCroppedAreaPixels(null);
			setDateEffective(effective);
			setMerchant(data.merchant || '');
			setHeaderCategoryId(headerCat ? String(headerCat) : '');
			setRows(normalizeDraftItems(data.items, headerCat));
		} catch (err) {
			const detail = err?.response?.data?.detail;
			toast.error(detail || err?.message || 'Could not scan receipt.');
		} finally {
			setScanning(false);
		}
	};

	const removeRow = (key) => setRows((prev) => prev.filter((row) => row._key !== key));

	const handleCommit = async () => {
		if (!rows.length || !effectiveHeaderCategoryId) {
			toast.error('Category and at least one item are required.');
			return;
		}
		if (rows.some((r) => !r.title.trim() || !r.category_id)) {
			toast.error('Every row needs a title and category.');
			return;
		}

		setImporting(true);
		try {
			const created = await commitReceipt({
				file,
				title: merchant.trim() || 'Receipt',
				note: merchant.trim() || '',
				category_id: Number(effectiveHeaderCategoryId),
				date_effective: dateEffective || undefined,
				items: rows.map(({ title, cost, quantity, unit, category_id }) => ({
					title: title.trim(),
					cost,
					quantity,
					unit,
					category_id: Number(category_id)
				}))
			});
			toast.success('Receipt logged as expense.');
			onCommitted?.(created);
			reset();
			onClose();
			if (created?.id) navigate(`/transactions/${created.id}`);
		} catch (err) {
			const data = err?.response?.data;
			const detail =
				data?.detail ||
				data?.items?.[0] ||
				data?.category_id?.[0] ||
				(data && typeof data === 'object'
					? Object.values(data).flat?.()?.[0] || Object.values(data)[0]
					: null);
			toast.error((typeof detail === 'string' ? detail : null) || 'Could not save receipt.');
		} finally {
			setImporting(false);
		}
	};

	const reviewing = rows.length > 0;
	const cropping = Boolean(originalFile) && !scanning && !reviewing;

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title={cropping ? 'Crop receipt' : 'Scan receipt'}
			size="xl"
			footer={
				<>
					<Button variant="secondary" onClick={handleClose} disabled={scanning || importing}>
						Cancel
					</Button>
					{reviewing ? (
						<Button loading={importing} onClick={handleCommit} disabled={scanning}>
							Log as expense
						</Button>
					) : originalFile ? (
						<Button loading={scanning} onClick={handleScanCrop} disabled={!croppedAreaPixels}>
							<ScanLine size={16} /> Scan cropped image
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
			) : cropping ? (
				<div className="space-y-3">
					{sourceUrl ? (
						<ReceiptCropper
							key={sourceUrl}
							imageSrc={sourceUrl}
							onCropPixelsChange={setCroppedAreaPixels}
						/>
					) : (
						<LoadingScreen />
					)}
					<p className="text-muted text-sm">
						Drag the handles to crop. Drag the photo to frame the receipt. The cropped image is sent
						to AI and saved with the expense.
					</p>
					<Button variant="secondary" size="sm" onClick={handlePickFile}>
						Choose a different image
					</Button>
				</div>
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

					<div className="grid gap-3 sm:grid-cols-2">
						<Input
							label="Merchant / title"
							value={merchant}
							onChange={(e) => setMerchant(e.target.value)}
						/>
						<Input
							label="Effective date"
							type="date"
							value={dateEffective}
							onChange={(e) => setDateEffective(e.target.value)}
						/>
					</div>

					<label className="block text-sm">
						<span className="text-fg mb-1.5 block font-medium">Receipt category</span>
						<select
							className="border-line bg-surface text-fg w-full rounded-md border px-3 py-2 text-sm"
							value={effectiveHeaderCategoryId}
							onChange={(e) => setHeaderCategoryId(e.target.value)}
						>
							{categories.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</select>
					</label>

					<div className="border-line overflow-x-auto rounded-md border">
						<table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
							<thead>
								<tr className="bg-surface-2 border-line border-b">
									<th className="text-muted w-[32%] px-2 py-2 text-left text-xs font-semibold uppercase">
										Title
									</th>
									<th className="text-muted w-20 px-2 py-2 text-right text-xs font-semibold uppercase">
										Price
									</th>
									<th className="text-muted w-20 px-2 py-2 text-right text-xs font-semibold uppercase">
										Qty
									</th>
									<th className="text-muted w-16 px-2 py-2 text-left text-xs font-semibold uppercase">
										Unit
									</th>
									<th className="text-muted w-[22%] px-2 py-2 text-left text-xs font-semibold uppercase">
										Category
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
										<td className="p-1">
											<select
												className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-sm"
												value={row.category_id}
												onChange={(e) =>
													setRows((prev) =>
														updateRow(prev, row._key, 'category_id', e.target.value)
													)
												}
											>
												{categories.map((c) => (
													<option key={c.id} value={c.id}>
														{c.name}
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
				<p className="text-muted text-sm">
					Upload a receipt photo, crop to the receipt, then scan. AI extracts merchant, line items,
					and category suggestions. Review, then log as an expense transaction.
				</p>
			)}
		</Modal>
	);
}
