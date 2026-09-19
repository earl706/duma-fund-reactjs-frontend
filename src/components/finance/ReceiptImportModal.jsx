import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Images, ScanLine, Trash2 } from 'lucide-react';

import { getCroppedImageFile } from '../../lib/cropImage';
import {
	BANK_TXN_TYPES,
	bulkScanReceipts,
	commitReceiptsBulk,
	formatBulkCommitSummary,
	MAX_BULK_RECEIPTS,
	normalizeDraftBankEntries,
	normalizeDraftItems,
	UNIT_OPTIONS
} from '../../lib/receiptScan';
import { toast } from '../../stores/toastStore';
import { cn } from '../../lib/format';
import { Button, Input, LoadingScreen, Modal, Select } from '../ui';
import { PurchaseHint } from './PurchaseHint';
import { ReceiptCropper } from './ReceiptCropper';
import { CategoryMultiSelect, MAX_EXPENSE_CATEGORIES } from './CategoryMultiSelect';

const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/*';
const TABLE_INPUT = 'border-line bg-surface text-fg w-full rounded-sm border px-2 py-1.5 text-sm';

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

function newId(prefix = 'id') {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function StepperNav({ index, count, label, onPrev, onNext, disabled }) {
	if (count <= 1) return null;
	return (
		<div className="flex items-center gap-2">
			<Button
				variant="secondary"
				size="icon"
				className="h-11 w-11 shrink-0 md:h-8 md:w-8"
				disabled={index <= 0 || disabled}
				onClick={onPrev}
				aria-label="Previous"
			>
				<ChevronLeft size={18} />
			</Button>
			<span className="text-muted min-w-0 flex-1 text-center text-xs leading-snug tabular-nums md:text-sm">
				{label}
			</span>
			<Button
				variant="secondary"
				size="icon"
				className="h-11 w-11 shrink-0 md:h-8 md:w-8"
				disabled={index >= count - 1 || disabled}
				onClick={onNext}
				aria-label="Next"
			>
				<ChevronRight size={18} />
			</Button>
		</div>
	);
}

function PreviewThumb({ src, alt, className, imgClassName }) {
	if (!src) return null;
	return (
		<div className={cn('bg-surface-2 flex justify-center rounded-md p-1.5 md:p-3', className)}>
			<img
				src={src}
				alt={alt}
				className={cn(
					'w-auto max-w-full rounded-sm object-contain',
					imgClassName || 'max-h-24 md:max-h-40'
				)}
			/>
		</div>
	);
}

async function prepareImageFile(originalFile, croppedAreaPixels) {
	if (!croppedAreaPixels) return originalFile;
	const url = URL.createObjectURL(originalFile);
	try {
		return await getCroppedImageFile(url, croppedAreaPixels, originalFile);
	} finally {
		URL.revokeObjectURL(url);
	}
}

function draftFromScan(data, file, fallbackCategoryId, fallbackIncomeCategoryId) {
	const kind = data.document_kind || (data.entries?.length ? 'bank_slip' : 'retail_receipt');
	if (kind === 'bank_slip') {
		return {
			id: newId('draft'),
			file,
			documentKind: 'bank_slip',
			merchant: '',
			dateEffective: '',
			headerCategoryId: '',
			headerCategoryIds: [],
			rows: [],
			bankEntries: normalizeDraftBankEntries(data.entries, fallbackIncomeCategoryId)
		};
	}
	const effective = data.date_effective || todayISO();
	const rolled =
		Array.isArray(data.category_ids) && data.category_ids.length
			? data.category_ids.map(Number).slice(0, MAX_EXPENSE_CATEGORIES)
			: data.category_id || fallbackCategoryId
				? [Number(data.category_id || fallbackCategoryId)]
				: [];
	const primary = data.category_id || rolled[0] || fallbackCategoryId;
	return {
		id: newId('draft'),
		file,
		documentKind: 'retail_receipt',
		merchant: data.merchant || '',
		dateEffective: effective,
		headerCategoryId: primary ? String(primary) : '',
		headerCategoryIds: rolled,
		rows: normalizeDraftItems(data.items),
		bankEntries: []
	};
}

/**
 * Upload → crop carousel (optional crop / full image) → bulk LLM analyze → review → bulk commit.
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
	const fileRef = useRef(null);
	const cameraRef = useRef(null);
	const [analyzing, setAnalyzing] = useState(false);
	const [analyzeLabel, setAnalyzeLabel] = useState('');
	const [importing, setImporting] = useState(false);
	const [images, setImages] = useState([]); // { id, file, croppedAreaPixels }
	const [cropIndex, setCropIndex] = useState(0);
	const [cropLocked, setCropLocked] = useState(false);
	const [drafts, setDrafts] = useState([]);
	const [failures, setFailures] = useState([]); // { id, name, file, detail }
	const [reviewIndex, setReviewIndex] = useState(0);

	const currentImage = images[cropIndex] || null;
	const sourceUrl = useObjectUrl(currentImage?.file);

	const fallbackCategoryId =
		defaultCategoryId ||
		categories.find((c) => c.name === 'Other' && !c.parent)?.id ||
		categories[0]?.id;

	const fallbackIncomeCategoryId =
		defaultIncomeCategoryId ||
		incomeCategories.find((c) => c.name === 'Other' && !c.parent)?.id ||
		incomeCategories[0]?.id;

	const expenseOptions = useMemo(
		() => categories.map((c) => ({ value: String(c.id), label: c.name })),
		[categories]
	);

	const currentDraft = drafts[reviewIndex] || null;
	const previewUrl = useObjectUrl(currentDraft?.file);

	const reset = () => {
		setImages([]);
		setCropIndex(0);
		setCropLocked(false);
		setDrafts([]);
		setFailures([]);
		setReviewIndex(0);
		setAnalyzeLabel('');
	};

	const handleClose = () => {
		if (analyzing || importing) return;
		reset();
		onClose();
	};

	const handlePickFile = () => fileRef.current?.click();
	const handleTakePhoto = () => cameraRef.current?.click();

	const enqueueFiles = (fileList) => {
		if (cropLocked) return;
		const picked = Array.from(fileList || []).filter(Boolean);
		if (!picked.length) return;

		const room = MAX_BULK_RECEIPTS - images.length;
		if (room <= 0) {
			toast.error(`You can scan at most ${MAX_BULK_RECEIPTS} images.`);
			return;
		}
		const take = picked.slice(0, room);
		if (picked.length > take.length) {
			toast.error(`Only ${room} more image(s) allowed (max ${MAX_BULK_RECEIPTS}).`);
		}

		const next = take.map((file) => ({
			id: newId('img'),
			file,
			croppedAreaPixels: null
		}));
		const startIndex = images.length;
		setImages((prev) => [...prev, ...next]);
		setCropIndex(startIndex);
	};

	const handleFile = (event) => {
		const picked = Array.from(event.target.files || []);
		event.target.value = '';
		enqueueFiles(picked);
	};

	const updateCurrentCrop = (pixels) => {
		if (!currentImage || cropLocked) return;
		setImages((prev) =>
			prev.map((img, i) => (i === cropIndex ? { ...img, croppedAreaPixels: pixels } : img))
		);
	};

	const removeCurrentImage = () => {
		if (cropLocked || images.length <= 1) {
			if (images.length <= 1) {
				reset();
			}
			return;
		}
		const next = images.filter((_, i) => i !== cropIndex);
		setImages(next);
		setCropIndex((i) => Math.min(i, next.length - 1));
	};

	const applyScanResults = (preparedFiles, meta, scanData, { appendDrafts = false } = {}) => {
		const byIndex = new Map((scanData?.results || []).map((r) => [r.index, r]));
		const nextDrafts = [];
		const nextFailures = [];

		preparedFiles.forEach((file, index) => {
			const row = byIndex.get(index);
			const name = meta[index]?.name || file.name || `Image ${index + 1}`;
			const failureId = meta[index]?.id || newId('fail');
			if (!row || !row.ok || !row.draft) {
				nextFailures.push({
					id: failureId,
					name,
					file,
					detail: row?.detail || 'Could not scan image.'
				});
				return;
			}
			try {
				nextDrafts.push(
					draftFromScan(row.draft, file, fallbackCategoryId, fallbackIncomeCategoryId)
				);
			} catch {
				nextFailures.push({
					id: failureId,
					name,
					file,
					detail: 'Could not build draft from scan.'
				});
			}
		});

		if (appendDrafts) {
			setDrafts((prev) => [...prev, ...nextDrafts]);
		} else {
			setDrafts(nextDrafts);
			setReviewIndex(0);
		}
		setFailures(nextFailures);

		if (nextDrafts.length && nextFailures.length) {
			toast.success(`Analyzed ${nextDrafts.length}; ${nextFailures.length} failed — retry below.`);
		} else if (nextDrafts.length) {
			toast.success(
				nextDrafts.length === 1
					? 'Ready to review 1 receipt.'
					: `Ready to review ${nextDrafts.length} receipts.`
			);
		} else if (nextFailures.length) {
			toast.error('No receipts could be analyzed. Retry or start over.');
		}
	};

	const handleAnalyzeAll = async () => {
		if (!images.length) {
			toast.error('Choose at least one image.');
			return;
		}

		setAnalyzing(true);
		setAnalyzeLabel(`Preparing ${images.length} image(s)…`);
		setCropLocked(true);
		try {
			const prepared = [];
			const meta = [];
			for (let i = 0; i < images.length; i++) {
				setAnalyzeLabel(`Preparing ${i + 1} of ${images.length}…`);
				const img = images[i];
				prepared.push(await prepareImageFile(img.file, img.croppedAreaPixels));
				meta.push({ id: img.id, name: img.file.name || `Image ${i + 1}` });
			}
			setAnalyzeLabel(`Analyzing ${prepared.length} image(s)…`);
			const scanData = await bulkScanReceipts(prepared);
			applyScanResults(prepared, meta, scanData);
			setImages([]);
		} catch (err) {
			setCropLocked(false);
			const detail = err?.response?.data?.detail || err?.response?.data?.images;
			toast.error(
				(typeof detail === 'string' && detail) || err?.message || 'Could not analyze images.'
			);
		} finally {
			setAnalyzing(false);
			setAnalyzeLabel('');
		}
	};

	const handleRetryFailures = async () => {
		if (!failures.length) return;
		setAnalyzing(true);
		setAnalyzeLabel(`Retrying ${failures.length} image(s)…`);
		try {
			const prepared = failures.map((f) => f.file);
			const meta = failures.map((f) => ({ id: f.id, name: f.name }));
			const scanData = await bulkScanReceipts(prepared);
			applyScanResults(prepared, meta, scanData, { appendDrafts: true });
		} catch (err) {
			const detail = err?.response?.data?.detail;
			toast.error(detail || err?.message || 'Retry failed.');
		} finally {
			setAnalyzing(false);
			setAnalyzeLabel('');
		}
	};

	const dismissFailure = (id) => {
		setFailures((prev) => prev.filter((f) => f.id !== id));
	};

	const patchDraft = (id, patch) => {
		setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
	};

	const removeDraft = (id) => {
		const idx = drafts.findIndex((d) => d.id === id);
		const next = drafts.filter((d) => d.id !== id);
		setDrafts(next);
		if (!next.length) {
			setReviewIndex(0);
			return;
		}
		if (idx < 0) {
			setReviewIndex(Math.min(reviewIndex, next.length - 1));
			return;
		}
		if (reviewIndex > idx) setReviewIndex(reviewIndex - 1);
		else setReviewIndex(Math.min(reviewIndex, next.length - 1));
	};

	const validateDraft = (draft) => {
		if (draft.documentKind === 'retail_receipt') {
			const ids =
				draft.headerCategoryIds.length > 0
					? draft.headerCategoryIds
					: fallbackCategoryId
						? [Number(fallbackCategoryId)]
						: [];
			if (!draft.rows.length || !ids.length) {
				return 'Category and at least one item are required on every retail receipt.';
			}
			if (draft.rows.some((r) => !r.title.trim())) {
				return 'Every retail line needs a title.';
			}
			return null;
		}
		if (!draft.bankEntries.length) {
			return 'Add at least one transfer or income row on every bank slip.';
		}
		for (const row of draft.bankEntries) {
			if (!row.title.trim()) return 'Every bank row needs a title.';
			if (!row.amount || Number(row.amount) <= 0) {
				return 'Every bank row needs a positive amount.';
			}
			if (row.txn_type === 'income' && !row.category_id) {
				return 'Income rows need a category.';
			}
		}
		return null;
	};

	const handleCommitAll = async () => {
		if (!drafts.length) {
			toast.error('Analyze at least one receipt first.');
			return;
		}
		for (let i = 0; i < drafts.length; i++) {
			const err = validateDraft(drafts[i]);
			if (err) {
				setReviewIndex(i);
				toast.error(err);
				return;
			}
		}

		setImporting(true);
		try {
			const payload = drafts.map((draft) => {
				if (draft.documentKind === 'bank_slip') {
					return {
						file: draft.file,
						document_kind: 'bank_slip',
						entries: draft.bankEntries.map(
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
					};
				}
				const ids =
					draft.headerCategoryIds.length > 0
						? draft.headerCategoryIds
						: fallbackCategoryId
							? [Number(fallbackCategoryId)]
							: [];
				const primary = draft.headerCategoryId ? Number(draft.headerCategoryId) : (ids[0] ?? null);
				return {
					file: draft.file,
					document_kind: 'retail_receipt',
					title: draft.merchant.trim() || 'Receipt',
					merchant: draft.merchant.trim(),
					note: '',
					category_id: primary,
					category_ids: ids,
					date_effective: draft.dateEffective || undefined,
					items: draft.rows.map(({ title, cost, quantity, unit }) => ({
						title: title.trim(),
						cost,
						quantity,
						unit
					}))
				};
			});

			const created = await commitReceiptsBulk(payload);
			toast.success(formatBulkCommitSummary(created?.summary));
			onCommitted?.(created);
			reset();
			onClose();
		} catch (err) {
			toast.error(commitErrorMessage(err) || 'Could not save receipts.');
		} finally {
			setImporting(false);
		}
	};

	const cropping = images.length > 0 && !cropLocked && !analyzing;
	const reviewing = drafts.length > 0 && !analyzing;
	const failuresOnly = cropLocked && !drafts.length && failures.length > 0 && !analyzing;

	const modalTitle = analyzing
		? 'Analyzing…'
		: cropping
			? images.length > 1
				? `Crop image ${cropIndex + 1} of ${images.length}`
				: 'Crop image'
			: reviewing
				? drafts.length > 1
					? `Review ${reviewIndex + 1} of ${drafts.length}`
					: currentDraft?.documentKind === 'bank_slip'
						? 'Review transfers / income'
						: 'Scan receipt'
				: failuresOnly
					? 'Scan failed'
					: 'Scan receipt';

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title={modalTitle}
			size="xl"
			footer={
				<>
					<Button variant="secondary" onClick={handleClose} disabled={analyzing || importing}>
						Cancel
					</Button>
					{analyzing ? (
						<Button loading disabled>
							{analyzeLabel || 'Analyzing…'}
						</Button>
					) : reviewing ? (
						<Button loading={importing} onClick={handleCommitAll}>
							{drafts.length === 1 ? 'Log receipt' : `Log all ${drafts.length}`}
						</Button>
					) : cropping ? (
						<Button loading={analyzing} onClick={handleAnalyzeAll}>
							<ScanLine size={16} />
							{images.length === 1 ? 'Analyze image' : `Analyze all ${images.length}`}
						</Button>
					) : failuresOnly ? (
						<Button loading={analyzing} onClick={handleRetryFailures}>
							Retry failed
						</Button>
					) : (
						<Button className="max-sm:hidden!" loading={analyzing} onClick={handlePickFile}>
							<ScanLine size={16} /> Choose images
						</Button>
					)}
				</>
			}
		>
			<input
				ref={fileRef}
				type="file"
				accept={ACCEPT_IMAGES}
				multiple
				className="hidden"
				onChange={handleFile}
			/>
			<input
				ref={cameraRef}
				type="file"
				accept="image/*"
				capture="environment"
				className="hidden"
				onChange={handleFile}
			/>

			{analyzing ? (
				<div className="space-y-3">
					<LoadingScreen />
					{analyzeLabel ? <p className="text-muted text-center text-sm">{analyzeLabel}</p> : null}
				</div>
			) : cropping && currentImage ? (
				<div className="space-y-3">
					<StepperNav
						index={cropIndex}
						count={images.length}
						label={`Image ${cropIndex + 1} of ${images.length}${
							currentImage.croppedAreaPixels ? ' · Cropped' : ' · Full image OK'
						}`}
						onPrev={() => setCropIndex((i) => Math.max(0, i - 1))}
						onNext={() => setCropIndex((i) => Math.min(images.length - 1, i + 1))}
					/>

					{sourceUrl ? (
						<ReceiptCropper
							key={currentImage.id}
							imageSrc={sourceUrl}
							initialCorners={currentImage.croppedAreaPixels?.corners || null}
							onCropPixelsChange={updateCurrentCrop}
							className="h-[min(58dvh,28rem)] md:h-[min(52vh,28rem)]"
						/>
					) : (
						<LoadingScreen />
					)}
					<div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
						{images.length < MAX_BULK_RECEIPTS && (
							<>
								<Button
									variant="secondary"
									size="sm"
									className="h-11 w-full md:hidden"
									onClick={handleTakePhoto}
								>
									<Camera size={16} /> Take photo
								</Button>
								<Button
									variant="secondary"
									size="sm"
									className="h-11 w-full md:h-8 md:w-auto"
									onClick={handlePickFile}
								>
									<Images size={16} />
									<span className="md:hidden">Photo library</span>
									<span className="hidden md:inline">Add images</span>
								</Button>
							</>
						)}
						<Button
							variant="ghost"
							size="sm"
							className="h-11 w-full md:h-8 md:w-auto"
							onClick={removeCurrentImage}
						>
							{images.length === 1 ? 'Clear' : 'Remove this image'}
						</Button>
					</div>
				</div>
			) : reviewing || failuresOnly ? (
				<div className="space-y-4">
					{failures.length > 0 && (
						<div className="border-danger/40 bg-danger/5 space-y-2 rounded-md border p-3">
							<p className="text-fg text-sm font-medium">
								{failures.length === 1
									? '1 image failed analysis'
									: `${failures.length} images failed analysis`}
							</p>
							<ul className="text-muted space-y-2 text-sm">
								{failures.map((f) => (
									<li
										key={f.id}
										className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2"
									>
										<span className="min-w-0 break-words">
											<span className="text-fg">{f.name}</span> — {f.detail}
										</span>
										<Button
											variant="ghost"
											size="sm"
											className="self-end sm:self-start"
											onClick={() => dismissFailure(f.id)}
											disabled={importing || analyzing}
										>
											Dismiss
										</Button>
									</li>
								))}
							</ul>
							<Button
								variant="secondary"
								size="sm"
								className="h-11 w-full md:h-8 md:w-auto"
								loading={analyzing}
								onClick={handleRetryFailures}
								disabled={importing}
							>
								Retry failed
							</Button>
						</div>
					)}

					{reviewing && currentDraft ? (
						<>
							<StepperNav
								index={reviewIndex}
								count={drafts.length}
								label={`Receipt ${reviewIndex + 1} of ${drafts.length}${
									currentDraft.documentKind === 'bank_slip' ? ' · Bank' : ' · Retail'
								}`}
								disabled={importing}
								onPrev={() => setReviewIndex((i) => Math.max(0, i - 1))}
								onNext={() => setReviewIndex((i) => Math.min(drafts.length - 1, i + 1))}
							/>

							{currentDraft.documentKind === 'retail_receipt' ? (
								<RetailDraftEditor
									draft={currentDraft}
									previewUrl={previewUrl}
									expenseOptions={expenseOptions}
									fallbackCategoryId={fallbackCategoryId}
									onPatch={(patch) => patchDraft(currentDraft.id, patch)}
									onRemove={() => removeDraft(currentDraft.id)}
									importing={importing}
									showRemove={drafts.length > 1}
								/>
							) : (
								<BankDraftEditor
									draft={currentDraft}
									previewUrl={previewUrl}
									incomeCategories={incomeCategories}
									fallbackIncomeCategoryId={fallbackIncomeCategoryId}
									onPatch={(patch) => patchDraft(currentDraft.id, patch)}
									onRemove={() => removeDraft(currentDraft.id)}
									importing={importing}
									showRemove={drafts.length > 1}
								/>
							)}

							{drafts.length === 1 && (
								<Button
									variant="ghost"
									size="sm"
									className="h-11 w-full md:h-8 md:w-auto"
									onClick={() => removeDraft(currentDraft.id)}
									disabled={importing}
								>
									Discard
								</Button>
							)}
						</>
					) : null}
				</div>
			) : (
				<div className="border-line flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-8 text-center md:p-10">
					<div className="bg-surface-2 text-muted flex h-12 w-12 items-center justify-center rounded-sm">
						<ScanLine size={22} />
					</div>
					<div>
						<p className="text-fg font-medium">Scan receipts</p>
						<p className="text-muted mt-1 text-sm">
							Up to {MAX_BULK_RECEIPTS} retail receipts or bank screenshots. Crop each photo
							(optional), then analyze and log the batch.
						</p>
					</div>
					<div className="flex w-full max-w-sm flex-col gap-2">
						<Button className="h-12 w-full md:hidden" onClick={handleTakePhoto}>
							<Camera size={16} /> Take photo
						</Button>
						<Button variant="secondary" className="h-12 w-full" onClick={handlePickFile}>
							<Images size={16} />
							<span className="md:hidden">Photo library</span>
							<span className="hidden md:inline">Choose images</span>
						</Button>
					</div>
				</div>
			)}
		</Modal>
	);
}

function RetailDraftEditor({
	draft,
	previewUrl,
	expenseOptions,
	fallbackCategoryId,
	onPatch,
	onRemove,
	importing,
	showRemove
}) {
	const effectiveHeaderIds =
		draft.headerCategoryIds.length > 0
			? draft.headerCategoryIds
			: fallbackCategoryId
				? [Number(fallbackCategoryId)]
				: [];
	const effectivePrimaryId = draft.headerCategoryId
		? Number(draft.headerCategoryId)
		: (effectiveHeaderIds[0] ?? null);

	const setRow = (key, field, value) => onPatch({ rows: updateRow(draft.rows, key, field, value) });

	return (
		<div className="space-y-4 pb-1">
			<div className="flex items-start gap-3 md:block md:space-y-4">
				<PreviewThumb
					src={previewUrl}
					alt="Scanned receipt"
					className="w-20 shrink-0 md:w-auto"
					imgClassName="max-h-24 md:max-h-40"
				/>
				<div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
					<Input
						label="Merchant / store"
						value={draft.merchant}
						onChange={(e) => onPatch({ merchant: e.target.value })}
						placeholder="Unknown if blank"
						autoComplete="off"
					/>
					<Input
						label="Effective date"
						type="date"
						value={draft.dateEffective}
						onChange={(e) => onPatch({ dateEffective: e.target.value })}
					/>
				</div>
			</div>

			<label className="block text-sm">
				<span className="text-fg mb-1.5 block font-medium">Receipt categories</span>
				<CategoryMultiSelect
					options={expenseOptions}
					value={effectiveHeaderIds}
					primaryId={effectivePrimaryId}
					max={MAX_EXPENSE_CATEGORIES}
					onChange={({ ids, primaryId }) => {
						onPatch({
							headerCategoryIds: ids,
							headerCategoryId: primaryId != null ? String(primaryId) : ''
						});
					}}
				/>
			</label>

			<ul className="space-y-3 md:hidden">
				{draft.rows.map((row, index) => (
					<li key={row._key} className="border-line space-y-2.5 rounded-md border p-3">
						<div className="flex items-end gap-2">
							<div className="min-w-0 flex-1">
								<Input
									label={index === 0 ? 'Title' : `Item ${index + 1}`}
									value={row.title}
									autoComplete="off"
									onChange={(e) => setRow(row._key, 'title', e.target.value)}
								/>
							</div>
							<Button
								variant="ghost"
								size="icon"
								className="mb-0.5 h-11 w-11 shrink-0"
								onClick={() => onPatch({ rows: draft.rows.filter((r) => r._key !== row._key) })}
								aria-label={`Remove ${row.title || 'row'}`}
							>
								<Trash2 size={16} />
							</Button>
						</div>
						<div className="grid grid-cols-3 gap-2">
							<Input
								label="Price"
								type="number"
								inputMode="decimal"
								min="0"
								step="0.01"
								value={row.cost}
								onChange={(e) => setRow(row._key, 'cost', e.target.value)}
							/>
							<Input
								label="Qty"
								type="number"
								inputMode="decimal"
								min="0"
								step="0.01"
								value={row.quantity}
								onChange={(e) => setRow(row._key, 'quantity', e.target.value)}
							/>
							<Select
								label="Unit"
								value={row.unit}
								onChange={(e) => setRow(row._key, 'unit', e.target.value)}
							>
								{UNIT_OPTIONS.map((unit) => (
									<option key={unit} value={unit}>
										{unit}
									</option>
								))}
							</Select>
						</div>
						<PurchaseHint query={row.title} className="mt-0 w-full max-w-none" />
					</li>
				))}
			</ul>

			<div className="border-line hidden overflow-x-auto rounded-md border md:block">
				<table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
					<thead>
						<tr className="bg-surface-2 border-line border-b">
							<th className="text-muted w-[40%] px-2 py-2 text-left text-xs font-semibold uppercase">
								Title
							</th>
							<th className="text-muted w-24 px-2 py-2 text-right text-xs font-semibold uppercase">
								Price
							</th>
							<th className="text-muted w-24 px-2 py-2 text-right text-xs font-semibold uppercase">
								Qty
							</th>
							<th className="text-muted w-20 px-2 py-2 text-left text-xs font-semibold uppercase">
								Unit
							</th>
							<th className="w-10" />
						</tr>
					</thead>
					<tbody>
						{draft.rows.map((row) => (
							<Fragment key={row._key}>
								<tr className="border-line align-top">
									<td className="p-1">
										<input
											className={TABLE_INPUT}
											value={row.title}
											onChange={(e) => setRow(row._key, 'title', e.target.value)}
										/>
									</td>
									<td className="p-1">
										<input
											type="number"
											min="0"
											step="0.01"
											className={`${TABLE_INPUT} text-right tabular-nums`}
											value={row.cost}
											onChange={(e) => setRow(row._key, 'cost', e.target.value)}
										/>
									</td>
									<td className="p-1">
										<input
											type="number"
											min="0"
											step="0.01"
											className={`${TABLE_INPUT} text-right tabular-nums`}
											value={row.quantity}
											onChange={(e) => setRow(row._key, 'quantity', e.target.value)}
										/>
									</td>
									<td className="p-1">
										<select
											className={TABLE_INPUT}
											value={row.unit}
											onChange={(e) => setRow(row._key, 'unit', e.target.value)}
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
											onClick={() =>
												onPatch({
													rows: draft.rows.filter((r) => r._key !== row._key)
												})
											}
											aria-label={`Remove ${row.title || 'row'}`}
										>
											<Trash2 size={15} />
										</Button>
									</td>
								</tr>
								<tr className="border-line border-b last:border-b-0">
									<td colSpan={5} className="px-1 pb-2">
										<PurchaseHint query={row.title} className="mt-0 w-full max-w-none" />
									</td>
								</tr>
							</Fragment>
						))}
					</tbody>
				</table>
			</div>

			{showRemove && (
				<Button
					variant="ghost"
					size="sm"
					className="h-11 w-full md:h-8 md:w-auto"
					onClick={onRemove}
					disabled={importing}
				>
					Remove this receipt from batch
				</Button>
			)}
		</div>
	);
}

function BankDraftEditor({
	draft,
	previewUrl,
	incomeCategories,
	fallbackIncomeCategoryId,
	onPatch,
	onRemove,
	importing,
	showRemove
}) {
	const setEntry = (key, field, value) =>
		onPatch({ bankEntries: updateRow(draft.bankEntries, key, field, value) });

	const setEntryType = (key, nextType) => {
		onPatch({
			bankEntries: draft.bankEntries.map((r) => {
				if (r._key !== key) return r;
				const next = { ...r, txn_type: nextType };
				if (nextType === 'income') {
					next.category_id =
						r.category_id || (fallbackIncomeCategoryId ? String(fallbackIncomeCategoryId) : '');
				} else {
					next.category_id = '';
				}
				return next;
			})
		});
	};

	return (
		<div className="space-y-4 pb-1">
			<div className="space-y-3">
				<PreviewThumb
					src={previewUrl}
					alt="Scanned bank document"
					className="mx-auto w-24 md:mx-0 md:w-auto"
					imgClassName="max-h-24 md:max-h-40"
				/>
				<p className="text-muted text-sm">
					Change type if the direction is wrong. Remove rows you do not want to import.
				</p>
			</div>

			<ul className="space-y-3 md:hidden">
				{draft.bankEntries.map((row, index) => (
					<li key={row._key} className="border-line space-y-2.5 rounded-md border p-3">
						<div className="flex items-end gap-2">
							<div className="min-w-0 flex-1">
								<Input
									label={index === 0 ? 'Title' : `Row ${index + 1}`}
									value={row.title}
									autoComplete="off"
									placeholder="Counterparty · ref · account"
									onChange={(e) => setEntry(row._key, 'title', e.target.value)}
								/>
							</div>
							<Button
								variant="ghost"
								size="icon"
								className="mb-0.5 h-11 w-11 shrink-0"
								onClick={() =>
									onPatch({
										bankEntries: draft.bankEntries.filter((r) => r._key !== row._key)
									})
								}
								aria-label={`Remove ${row.title || 'entry'}`}
							>
								<Trash2 size={16} />
							</Button>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Select
								label="Type"
								value={row.txn_type}
								onChange={(e) => setEntryType(row._key, e.target.value)}
							>
								{BANK_TXN_TYPES.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</Select>
							<Input
								label="Amount"
								type="number"
								inputMode="decimal"
								min="0"
								step="0.01"
								value={row.amount}
								onChange={(e) => setEntry(row._key, 'amount', e.target.value)}
							/>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Input
								label="Bank / app"
								value={row.merchant}
								autoComplete="off"
								placeholder="Bank / app"
								onChange={(e) => setEntry(row._key, 'merchant', e.target.value)}
							/>
							<Input
								label="Date"
								type="date"
								value={row.date_effective || ''}
								onChange={(e) => setEntry(row._key, 'date_effective', e.target.value)}
							/>
						</div>
						{row.txn_type === 'income' ? (
							<Select
								label="Category"
								value={row.category_id || ''}
								onChange={(e) => setEntry(row._key, 'category_id', e.target.value)}
							>
								{incomeCategories.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</Select>
						) : null}
						<Input
							label="Note"
							value={row.note}
							autoComplete="off"
							placeholder="Optional"
							onChange={(e) => setEntry(row._key, 'note', e.target.value)}
						/>
					</li>
				))}
			</ul>

			<div className="border-line hidden overflow-x-auto rounded-md border md:block">
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
						{draft.bankEntries.map((row) => (
							<Fragment key={row._key}>
								<tr className="border-line align-top">
									<td className="p-1">
										<select
											className={TABLE_INPUT}
											value={row.txn_type}
											onChange={(e) => setEntryType(row._key, e.target.value)}
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
											className={TABLE_INPUT}
											value={row.title}
											onChange={(e) => setEntry(row._key, 'title', e.target.value)}
											placeholder="Counterparty · ref · account"
										/>
									</td>
									<td className="p-1">
										<input
											className={TABLE_INPUT}
											value={row.merchant}
											onChange={(e) => setEntry(row._key, 'merchant', e.target.value)}
											placeholder="Bank / app"
										/>
									</td>
									<td className="p-1">
										<input
											type="number"
											min="0"
											step="0.01"
											className={`${TABLE_INPUT} text-right tabular-nums`}
											value={row.amount}
											onChange={(e) => setEntry(row._key, 'amount', e.target.value)}
										/>
									</td>
									<td className="p-1">
										<input
											type="date"
											className={TABLE_INPUT}
											value={row.date_effective || ''}
											onChange={(e) => setEntry(row._key, 'date_effective', e.target.value)}
										/>
									</td>
									<td className="p-1">
										{row.txn_type === 'income' ? (
											<select
												className={TABLE_INPUT}
												value={row.category_id || ''}
												onChange={(e) => setEntry(row._key, 'category_id', e.target.value)}
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
											onClick={() =>
												onPatch({
													bankEntries: draft.bankEntries.filter((r) => r._key !== row._key)
												})
											}
											aria-label={`Remove ${row.title || 'entry'}`}
										>
											<Trash2 size={15} />
										</Button>
									</td>
								</tr>
								<tr className="border-line border-b last:border-b-0">
									<td colSpan={7} className="px-1 pb-2">
										<input
											className={TABLE_INPUT}
											value={row.note}
											onChange={(e) => setEntry(row._key, 'note', e.target.value)}
											placeholder="Note / purpose (optional)"
										/>
									</td>
								</tr>
							</Fragment>
						))}
					</tbody>
				</table>
			</div>

			{showRemove && (
				<Button
					variant="ghost"
					size="sm"
					className="h-11 w-full md:h-8 md:w-auto"
					onClick={onRemove}
					disabled={importing}
				>
					Remove this slip from batch
				</Button>
			)}
		</div>
	);
}

function commitErrorMessage(err) {
	const data = err?.response?.data;
	const detail =
		data?.detail ||
		data?.receipts?.[0] ||
		data?.items?.[0] ||
		data?.entries?.[0] ||
		data?.category_id?.[0] ||
		(data && typeof data === 'object'
			? Object.values(data).flat?.()?.[0] || Object.values(data)[0]
			: null);
	return typeof detail === 'string' ? detail : null;
}
