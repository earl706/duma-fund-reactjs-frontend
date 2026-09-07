import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Trash2 } from 'lucide-react';

import { getCroppedImageFile } from '../../lib/cropImage';
import {
	BANK_TXN_TYPES,
	commitReceipt,
	normalizeDraftBankEntries,
	normalizeDraftItems,
	scanReceipt,
	UNIT_OPTIONS
} from '../../lib/receiptScan';
import { toast } from '../../stores/toastStore';
import { Button, Input, LoadingScreen, Modal } from '../ui';
import { PurchaseHint } from './PurchaseHint';
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
 * Standalone scan: pick image → crop → OCR review → commit.
 * Detects retail receipts (expense + items) or bank slips (income/transfers, header-only).
 */
export function ReceiptImportModal({
	open,
	onClose,
	categories = [],
	incomeCategories = [],
	defaultCategoryId = null,
	defaultIncomeCategoryId = null,
	onCommitted
}) {
	const navigate = useNavigate();
	const fileRef = useRef(null);
	const [scanning, setScanning] = useState(false);
	const [importing, setImporting] = useState(false);
	const [originalFile, setOriginalFile] = useState(null);
	const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
	const [file, setFile] = useState(null);
	const [documentKind, setDocumentKind] = useState(null);
	const [rows, setRows] = useState([]);
	const [bankEntries, setBankEntries] = useState([]);
	const [dateEffective, setDateEffective] = useState('');
	const [merchant, setMerchant] = useState('');
	const [headerCategoryId, setHeaderCategoryId] = useState('');
	const sourceUrl = useObjectUrl(originalFile);
	const previewUrl = useObjectUrl(file);

	const fallbackCategoryId =
		defaultCategoryId ||
		categories.find((c) => c.name === 'Other' && !c.parent)?.id ||
		categories[0]?.id;

	const fallbackIncomeCategoryId =
		defaultIncomeCategoryId ||
		incomeCategories.find((c) => c.name === 'Other' && !c.parent)?.id ||
		incomeCategories[0]?.id;

	const effectiveHeaderCategoryId =
		headerCategoryId || (fallbackCategoryId ? String(fallbackCategoryId) : '');

	const reset = () => {
		setRows([]);
		setBankEntries([]);
		setDocumentKind(null);
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
		setBankEntries([]);
		setDocumentKind(null);
		setDateEffective('');
		setMerchant('');
		setFile(null);
		setHeaderCategoryId('');
		setCroppedAreaPixels(null);
		setOriginalFile(picked);
	};

	const handleScanCrop = async () => {
		if (!sourceUrl || !originalFile || !croppedAreaPixels) {
			toast.error('Crop the image first.');
			return;
		}

		setScanning(true);
		try {
			const cropped = await getCroppedImageFile(sourceUrl, croppedAreaPixels, originalFile);
			const data = await scanReceipt(cropped);
			const kind = data.document_kind || (data.entries?.length ? 'bank_slip' : 'retail_receipt');

			if (kind === 'bank_slip') {
				if (!data.entries?.length) {
					toast.error('No transfers or income found on the image.');
					return;
				}
				setFile(cropped);
				setOriginalFile(null);
				setCroppedAreaPixels(null);
				setDocumentKind('bank_slip');
				setRows([]);
				setBankEntries(normalizeDraftBankEntries(data.entries, fallbackIncomeCategoryId));
				return;
			}

			if (!data.items?.length) {
				toast.error('No items found on the receipt.');
				return;
			}
			const effective = data.date_effective || todayISO();
			const headerCat = data.category_id || fallbackCategoryId;
			setFile(cropped);
			setOriginalFile(null);
			setCroppedAreaPixels(null);
			setDocumentKind('retail_receipt');
			setBankEntries([]);
			setDateEffective(effective);
			setMerchant(data.merchant || '');
			setHeaderCategoryId(headerCat ? String(headerCat) : '');
			setRows(normalizeDraftItems(data.items, headerCat));
		} catch (err) {
			const detail = err?.response?.data?.detail;
			toast.error(detail || err?.message || 'Could not scan image.');
		} finally {
			setScanning(false);
		}
	};

	const removeRow = (key) => setRows((prev) => prev.filter((row) => row._key !== key));
	const removeBankEntry = (key) => setBankEntries((prev) => prev.filter((row) => row._key !== key));

	const handleCommitRetail = async () => {
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
				document_kind: 'retail_receipt',
				title: merchant.trim() || 'Receipt',
				merchant: merchant.trim(),
				note: '',
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
			toast.error(commitErrorMessage(err) || 'Could not save receipt.');
		} finally {
			setImporting(false);
		}
	};

	const handleCommitBank = async () => {
		if (!bankEntries.length) {
			toast.error('Add at least one transfer or income row.');
			return;
		}
		for (const row of bankEntries) {
			if (!row.title.trim()) {
				toast.error('Every row needs a title.');
				return;
			}
			if (!row.amount || Number(row.amount) <= 0) {
				toast.error('Every row needs a positive amount.');
				return;
			}
			if (row.txn_type === 'income' && !row.category_id) {
				toast.error('Income rows need a category.');
				return;
			}
		}

		setImporting(true);
		try {
			const created = await commitReceipt({
				file,
				document_kind: 'bank_slip',
				entries: bankEntries.map(
					({ txn_type, amount, title, merchant: m, note, date_effective, category_id }) => {
						const entry = {
							txn_type,
							amount,
							title: title.trim(),
							merchant: (m || '').trim(),
							note: note || ''
						};
						if (date_effective) entry.date_effective = date_effective;
						if (txn_type === 'income' && category_id) {
							entry.category_id = Number(category_id);
						}
						return entry;
					}
				)
			});
			const count = created?.results?.length || 1;
			toast.success(
				count === 1 ? 'Logged 1 transfer/income.' : `Logged ${count} transfers/income.`
			);
			onCommitted?.(created);
			reset();
			onClose();
			const firstId = created?.results?.[0]?.id || created?.id;
			if (firstId) navigate(`/transactions/${firstId}`);
		} catch (err) {
			toast.error(commitErrorMessage(err) || 'Could not save bank entries.');
		} finally {
			setImporting(false);
		}
	};

	const reviewingRetail = documentKind === 'retail_receipt' && rows.length > 0;
	const reviewingBank = documentKind === 'bank_slip' && bankEntries.length > 0;
	const reviewing = reviewingRetail || reviewingBank;
	const cropping = Boolean(originalFile) && !scanning && !reviewing;

	const modalTitle = cropping
		? 'Crop image'
		: reviewingBank
			? 'Review transfers / income'
			: reviewingRetail
				? 'Scan receipt'
				: 'Scan receipt';

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title={modalTitle}
			size="xl"
			footer={
				<>
					<Button variant="secondary" onClick={handleClose} disabled={scanning || importing}>
						Cancel
					</Button>
					{reviewingRetail ? (
						<Button loading={importing} onClick={handleCommitRetail} disabled={scanning}>
							Log as expense
						</Button>
					) : reviewingBank ? (
						<Button loading={importing} onClick={handleCommitBank} disabled={scanning}>
							{bankEntries.length === 1
								? 'Log transfer / income'
								: `Log ${bankEntries.length} entries`}
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
						Drag corners for a slanted document crop, or edge handles to move one side at a time.
						The selection is flattened for AI scan and saved with the transaction(s).
					</p>
					<Button variant="secondary" size="sm" onClick={handlePickFile}>
						Choose a different image
					</Button>
				</div>
			) : reviewingRetail ? (
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
							label="Merchant / store"
							value={merchant}
							onChange={(e) => setMerchant(e.target.value)}
							placeholder="Unknown if blank"
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
									<Fragment key={row._key}>
										<tr className="border-line align-top">
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
										<tr className="border-line border-b last:border-b-0">
											<td colSpan={6} className="px-1 pb-2">
												<PurchaseHint query={row.title} className="mt-0 w-full max-w-none" />
											</td>
										</tr>
									</Fragment>
								))}
							</tbody>
						</table>
					</div>

					<Button variant="secondary" size="sm" onClick={handlePickFile} disabled={importing}>
						Scan another image
					</Button>
				</div>
			) : reviewingBank ? (
				<div className="space-y-4">
					{previewUrl && (
						<div className="bg-surface-2 flex justify-center rounded-md p-3">
							<img
								src={previewUrl}
								alt="Scanned bank document"
								className="max-h-40 w-auto max-w-full rounded-sm object-contain"
							/>
						</div>
					)}

					<p className="text-muted text-sm">
						Review each row. Change type if the inferred direction is wrong. Remove rows you do not
						want to import.
					</p>

					<div className="border-line overflow-x-auto rounded-md border">
						<table className="w-full min-w-[920px] table-fixed border-collapse text-sm">
							<thead>
								<tr className="bg-surface-2 border-line border-b">
									<th className="text-muted w-[14%] px-2 py-2 text-left text-xs font-semibold uppercase">
										Type
									</th>
									<th className="text-muted w-[22%] px-2 py-2 text-left text-xs font-semibold uppercase">
										Title
									</th>
									<th className="text-muted w-[14%] px-2 py-2 text-left text-xs font-semibold uppercase">
										Bank / app
									</th>
									<th className="text-muted w-24 px-2 py-2 text-right text-xs font-semibold uppercase">
										Amount
									</th>
									<th className="text-muted w-28 px-2 py-2 text-left text-xs font-semibold uppercase">
										Date
									</th>
									<th className="text-muted w-[16%] px-2 py-2 text-left text-xs font-semibold uppercase">
										Category
									</th>
									<th className="w-10" />
								</tr>
							</thead>
							<tbody>
								{bankEntries.map((row) => (
									<Fragment key={row._key}>
										<tr className="border-line align-top">
											<td className="p-1">
												<select
													className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-sm"
													value={row.txn_type}
													onChange={(e) => {
														const nextType = e.target.value;
														setBankEntries((prev) =>
															prev.map((r) => {
																if (r._key !== row._key) return r;
																const next = { ...r, txn_type: nextType };
																if (nextType === 'income') {
																	next.category_id =
																		r.category_id ||
																		(fallbackIncomeCategoryId
																			? String(fallbackIncomeCategoryId)
																			: '');
																} else {
																	next.category_id = '';
																}
																return next;
															})
														);
													}}
												>
													{BANK_TXN_TYPES.map((opt) => (
														<option key={opt.value} value={opt.value}>
															{opt.label}
														</option>
													))}
												</select>
											</td>
											<td className="p-1">
												<input
													className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-sm"
													value={row.title}
													onChange={(e) =>
														setBankEntries((prev) =>
															updateRow(prev, row._key, 'title', e.target.value)
														)
													}
													placeholder="Counterparty · ref · account"
												/>
											</td>
											<td className="p-1">
												<input
													className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-sm"
													value={row.merchant}
													onChange={(e) =>
														setBankEntries((prev) =>
															updateRow(prev, row._key, 'merchant', e.target.value)
														)
													}
													placeholder="Bank / app"
												/>
											</td>
											<td className="p-1">
												<input
													type="number"
													min="0"
													step="0.01"
													className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-right text-sm tabular-nums"
													value={row.amount}
													onChange={(e) =>
														setBankEntries((prev) =>
															updateRow(prev, row._key, 'amount', e.target.value)
														)
													}
												/>
											</td>
											<td className="p-1">
												<input
													type="date"
													className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-sm"
													value={row.date_effective || ''}
													onChange={(e) =>
														setBankEntries((prev) =>
															updateRow(prev, row._key, 'date_effective', e.target.value)
														)
													}
												/>
											</td>
											<td className="p-1">
												{row.txn_type === 'income' ? (
													<select
														className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-sm"
														value={row.category_id || ''}
														onChange={(e) =>
															setBankEntries((prev) =>
																updateRow(prev, row._key, 'category_id', e.target.value)
															)
														}
													>
														{incomeCategories.map((c) => (
															<option key={c.id} value={c.id}>
																{c.name}
															</option>
														))}
													</select>
												) : (
													<span className="text-muted block px-2 py-1.5 text-xs">—</span>
												)}
											</td>
											<td className="p-1 text-center">
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8"
													onClick={() => removeBankEntry(row._key)}
													aria-label={`Remove ${row.title || 'entry'}`}
												>
													<Trash2 size={15} />
												</Button>
											</td>
										</tr>
										<tr className="border-line border-b last:border-b-0">
											<td colSpan={7} className="px-1 pb-2">
												<input
													className="border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-sm"
													value={row.note}
													onChange={(e) =>
														setBankEntries((prev) =>
															updateRow(prev, row._key, 'note', e.target.value)
														)
													}
													placeholder="Note / purpose (optional)"
												/>
											</td>
										</tr>
									</Fragment>
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
					Upload a retail receipt or bank transfer screenshot (deposit slip, passbook, e-wallet
					confirmation). Crop first — AI detects the document type, then you review before saving.
				</p>
			)}
		</Modal>
	);
}

function commitErrorMessage(err) {
	const data = err?.response?.data;
	const detail =
		data?.detail ||
		data?.items?.[0] ||
		data?.entries?.[0] ||
		data?.category_id?.[0] ||
		(data && typeof data === 'object'
			? Object.values(data).flat?.()?.[0] || Object.values(data)[0]
			: null);
	return typeof detail === 'string' ? detail : null;
}
