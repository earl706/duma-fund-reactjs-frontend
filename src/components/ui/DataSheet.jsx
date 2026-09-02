import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Info, Plus, Trash2 } from 'lucide-react';

import { cn } from '../../lib/format';
import { Button } from './Button';

const STATUS_DOT = {
	active: 'bg-primary',
	archived: 'bg-muted'
};

function StatusDot({ status }) {
	const tone = STATUS_DOT[status] || 'bg-muted';
	return (
		<span
			className={cn('inline-block h-2 w-2 shrink-0 rounded-full', tone)}
			title={status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
			aria-label={status || 'unknown'}
		/>
	);
}

/**
 * Spreadsheet-style data table.
 * Click a cell to select it; Shift+click extends the selection. Drag the fill
 * handle (bottom-right dot) vertically to copy the anchor cell's value down/up
 * the same column. Double-click to edit a single cell; Enter commits; Escape
 * cancels. Row checkboxes (optional) are for bulk delete only.
 *
 * Column type `qty-unit`: number + unit select in one cell. Commit sends
 * `{ id, field, value, patch: { [field]: qty, [unitKey]: unit } }`.
 */
export function DataSheet({
	rows,
	columns,
	onCommit,
	onAdd,
	onRequestDelete,
	onRequestInfo,
	onBulkDelete,
	selectable = false,
	adding = false,
	saving = false,
	autoEdit = null,
	addLabel = 'Add row',
	emptyMessage = 'No rows yet. Add a row to get started.',
	rowLabel = (row) => row.title || 'row',
	compact = true
}) {
	const [edit, setEdit] = useState(null);
	const [draft, setDraft] = useState('');
	const [draftUnit, setDraftUnit] = useState('');
	const [selectedIds, setSelectedIds] = useState(() => new Set());
	const [cellAnchor, setCellAnchor] = useState(null);
	const [cellFocus, setCellFocus] = useState(null);
	const [fillPreviewEnd, setFillPreviewEnd] = useState(null);
	const [isFillDragging, setIsFillDragging] = useState(false);
	const inputRef = useRef(null);
	const editorRef = useRef(null);
	const tableRef = useRef(null);
	const skipBlurCancel = useRef(false);
	const autoEditKey = useRef(null);
	const fillDragging = useRef(false);

	const rowIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
	const editableKeys = new Set(columns.filter((c) => c.editable).map((c) => c.key));

	const rowIndex = useCallback((id) => rows.findIndex((r) => r.id === id), [rows]);
	const colIndex = useCallback((key) => columns.findIndex((c) => c.key === key), [columns]);

	const cellSelection = useMemo(() => {
		if (!cellAnchor || !cellFocus) return null;
		const r1 = rowIndex(cellAnchor.rowId);
		const r2 = rowIndex(cellFocus.rowId);
		const c1 = colIndex(cellAnchor.colKey);
		const c2 = colIndex(cellFocus.colKey);
		if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return null;
		return {
			minRow: Math.min(r1, r2),
			maxRow: Math.max(r1, r2),
			minCol: Math.min(c1, c2),
			maxCol: Math.max(c1, c2)
		};
	}, [cellAnchor, cellFocus, rowIndex, colIndex]);

	const fillPreview = useMemo(() => {
		if (!fillPreviewEnd || !cellAnchor) return null;
		const r1 = rowIndex(cellAnchor.rowId);
		const r2 = rowIndex(fillPreviewEnd.rowId);
		if (r1 < 0 || r2 < 0) return null;
		return { minRow: Math.min(r1, r2), maxRow: Math.max(r1, r2), colKey: cellAnchor.colKey };
	}, [fillPreviewEnd, cellAnchor, rowIndex]);

	const isFillableCell = (col) => col.editable || col.type === 'status-icon';

	const fillHandleCell = useMemo(() => {
		if (!cellAnchor || !cellSelection || isFillDragging) return null;
		const anchorCol = colIndex(cellAnchor.colKey);
		if (anchorCol < 0) return null;
		if (anchorCol < cellSelection.minCol || anchorCol > cellSelection.maxCol) return null;
		const col = columns.find((c) => c.key === cellAnchor.colKey);
		if (!col || !isFillableCell(col)) return null;
		return {
			rowId: rows[cellSelection.maxRow]?.id,
			colKey: cellAnchor.colKey
		};
	}, [cellAnchor, cellSelection, columns, rows, colIndex, isFillDragging]);

	const isCellInSelection = (rowId, colKey) => {
		if (fillPreview) {
			const ri = rowIndex(rowId);
			const ci = colIndex(colKey);
			if (
				ci === colIndex(fillPreview.colKey) &&
				ri >= fillPreview.minRow &&
				ri <= fillPreview.maxRow
			) {
				return true;
			}
		}
		if (!cellSelection) return false;
		const ri = rowIndex(rowId);
		const ci = colIndex(colKey);
		if (ri < 0 || ci < 0) return false;
		return (
			ri >= cellSelection.minRow &&
			ri <= cellSelection.maxRow &&
			ci >= cellSelection.minCol &&
			ci <= cellSelection.maxCol
		);
	};

	const isFillPreviewCell = (rowId, colKey) => {
		if (!fillPreview) return false;
		const ri = rowIndex(rowId);
		if (ri < 0 || colKey !== fillPreview.colKey) return false;
		return ri >= fillPreview.minRow && ri <= fillPreview.maxRow;
	};

	const handleCellSelect = (e, row, col) => {
		if (!isFillableCell(col)) return;
		if (fillDragging.current) return;
		const point = { rowId: row.id, colKey: col.key };
		if (e.shiftKey && cellAnchor) {
			setCellFocus(point);
		} else {
			setCellAnchor(point);
			setCellFocus(point);
		}
	};

	const rowIdAtClientY = useCallback((clientY) => {
		const table = tableRef.current;
		if (!table) return null;
		const rowEls = table.querySelectorAll('tbody tr[data-row-id]');
		for (const el of rowEls) {
			const rect = el.getBoundingClientRect();
			if (clientY >= rect.top && clientY <= rect.bottom) {
				return Number(el.dataset.rowId);
			}
		}
		return null;
	}, []);

	useEffect(() => {
		setCellAnchor((prev) => (prev && rowIds.has(prev.rowId) ? prev : null));
		setCellFocus((prev) => (prev && rowIds.has(prev.rowId) ? prev : null));
	}, [rowIds]);

	useEffect(() => {
		setSelectedIds((prev) => {
			const next = new Set([...prev].filter((id) => rowIds.has(id)));
			return next.size === prev.size ? prev : next;
		});
	}, [rowIds]);

	const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
	const someSelected = rows.some((r) => selectedIds.has(r.id));

	const toggleRow = (id) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleAll = () => {
		if (allSelected) {
			setSelectedIds(new Set());
			return;
		}
		setSelectedIds(new Set(rows.map((r) => r.id)));
	};

	const getDraft = (row, field) => {
		const col = columns.find((c) => c.key === field);
		if (col?.getDraft) return col.getDraft(row);
		return row[field] != null ? String(row[field]) : '';
	};

	const getUnitDraft = (row, col) => {
		const unitKey = col?.unitKey || 'unit';
		if (col?.getUnitDraft) return col.getUnitDraft(row);
		return row[unitKey] != null ? String(row[unitKey]) : col?.unitOptions?.[0]?.value || '';
	};

	useEffect(() => {
		if (!autoEdit?.id || !autoEdit?.field || !autoEdit?.key) return;
		if (autoEditKey.current === autoEdit.key) return;
		const row = rows.find((r) => r.id === autoEdit.id);
		if (!row) return;
		autoEditKey.current = autoEdit.key;
		const col = columns.find((c) => c.key === autoEdit.field);
		setEdit({ id: autoEdit.id, field: autoEdit.field });
		setDraft(getDraft(row, autoEdit.field));
		if (col?.type === 'qty-unit') setDraftUnit(getUnitDraft(row, col));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only re-enter on autoEdit key / row presence
	}, [autoEdit, rows]);

	useEffect(() => {
		if (!edit) return;
		const el = inputRef.current;
		if (!el) return;
		el.focus();
		if (el.select) el.select();
	}, [edit]);

	const startEdit = (row, field) => {
		if (!editableKeys.has(field) || saving) return;
		const col = columns.find((c) => c.key === field);
		setEdit({ id: row.id, field });
		setDraft(getDraft(row, field));
		if (col?.type === 'qty-unit') setDraftUnit(getUnitDraft(row, col));
	};

	const cancelEdit = () => {
		setEdit(null);
		setDraft('');
		setDraftUnit('');
	};

	const commitForRow = (targetRow, field, nextValue, nextUnit, col) => {
		if (col?.type === 'qty-unit') {
			const unitKey = col.unitKey || 'unit';
			const qtyNormalized = String(nextValue).trim();
			const prevQty = getDraft(targetRow, field);
			const prevUnit = getUnitDraft(targetRow, col);
			if (col.required && !qtyNormalized) return;
			if (String(qtyNormalized) === String(prevQty) && String(nextUnit) === String(prevUnit))
				return;
			onCommit?.({
				id: targetRow.id,
				field,
				value: qtyNormalized,
				patch: { [field]: qtyNormalized, [unitKey]: nextUnit }
			});
			return;
		}

		const shouldTrim = col?.inputType !== 'number';
		const normalized = shouldTrim ? String(nextValue).trim() : nextValue;
		const prev = getDraft(targetRow, field);
		if (col?.required && !String(normalized).trim()) return;
		if (String(normalized) === String(prev)) return;
		onCommit?.({ id: targetRow.id, field, value: normalized });
	};

	const applyFill = (source, end) => {
		if (!source || !end || saving) return;
		const col = columns.find((c) => c.key === source.colKey);
		if (!col || !isFillableCell(col)) return;
		const sourceRow = rows.find((r) => r.id === source.rowId);
		if (!sourceRow) return;

		const r1 = rowIndex(source.rowId);
		const r2 = rowIndex(end.rowId);
		if (r1 < 0 || r2 < 0) return;

		const minR = Math.min(r1, r2);
		const maxR = Math.max(r1, r2);
		const sourceValue = getDraft(sourceRow, source.colKey);
		const sourceUnit = col.type === 'qty-unit' ? getUnitDraft(sourceRow, col) : undefined;

		for (let i = minR; i <= maxR; i++) {
			const targetRow = rows[i];
			commitForRow(targetRow, source.colKey, sourceValue, sourceUnit, col);
		}

		setCellFocus({ rowId: end.rowId, colKey: source.colKey });
	};

	const startFillDrag = (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (!cellAnchor || saving) return;
		const col = columns.find((c) => c.key === cellAnchor.colKey);
		if (!col || !isFillableCell(col)) return;

		const source = { ...cellAnchor };
		fillDragging.current = true;
		setIsFillDragging(true);
		setFillPreviewEnd(source);

		const onMove = (ev) => {
			const rowId = rowIdAtClientY(ev.clientY);
			if (rowId == null) return;
			const end = { rowId, colKey: source.colKey };
			setFillPreviewEnd(end);
			setCellFocus(end);
		};

		const onUp = (ev) => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			fillDragging.current = false;
			setIsFillDragging(false);
			const rowId = rowIdAtClientY(ev.clientY);
			const end = rowId != null ? { rowId, colKey: source.colKey } : fillPreviewEnd || source;
			setFillPreviewEnd(null);
			applyFill(source, end);
		};

		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	};

	const commitEdit = (overrideValue, overrideUnit) => {
		if (!edit) return;
		const row = rows.find((r) => r.id === edit.id);
		if (!row) {
			cancelEdit();
			return;
		}
		const col = columns.find((c) => c.key === edit.field);
		const nextValue = overrideValue !== undefined ? overrideValue : draft;
		const nextUnit = overrideUnit !== undefined ? overrideUnit : draftUnit;

		if (col?.type === 'qty-unit') {
			const qtyNormalized = String(nextValue).trim();
			if (col.required && !qtyNormalized) {
				cancelEdit();
				return;
			}
		} else {
			const shouldTrim = col?.inputType !== 'number';
			const normalized = shouldTrim ? String(nextValue).trim() : nextValue;
			if (col?.required && !String(normalized).trim()) {
				cancelEdit();
				return;
			}
		}

		commitForRow(row, edit.field, nextValue, nextUnit, col);
		cancelEdit();
	};

	const onKeyDown = (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			skipBlurCancel.current = true;
			commitEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			skipBlurCancel.current = true;
			cancelEdit();
		}
	};

	const onBlur = (e) => {
		if (skipBlurCancel.current) {
			skipBlurCancel.current = false;
			return;
		}
		if (editorRef.current?.contains(e.relatedTarget)) return;
		cancelEdit();
	};

	const isEditing = (rowId, field) => edit?.id === rowId && edit?.field === field;

	const displayCell = (row, col) => {
		if (col.type === 'status-icon') {
			return <StatusDot status={row[col.key]} />;
		}
		if (col.render) return col.render(row);
		const raw = col.getDisplay ? col.getDisplay(row) : row[col.key];
		if (raw == null || raw === '') return <span className="text-muted/50">—</span>;
		return raw;
	};

	const cellText = compact ? 'text-xs' : 'text-sm';
	const headText = compact ? 'text-[10px]' : 'text-xs';
	const cellPad = compact ? 'px-1.5 py-1' : 'px-2 py-2';
	const headPad = compact ? 'px-1.5 py-1.5' : 'px-2 py-2';

	const renderActions = (row, col) => {
		const actions = col.actions || (col.type === 'action-delete' ? ['delete'] : []);
		return (
			<td key={col.key} className={cn('px-0.5 py-0.5', col.className)}>
				<div className="flex items-center justify-center gap-0">
					{actions.includes('info') && (
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={() => onRequestInfo?.(row)}
							aria-label={`Info for ${rowLabel(row)}`}
						>
							<Info size={14} />
						</Button>
					)}
					{actions.includes('delete') && (
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={() => onRequestDelete?.(row)}
							aria-label={`Delete ${rowLabel(row)}`}
						>
							<Trash2 size={14} />
						</Button>
					)}
				</div>
			</td>
		);
	};

	const showFillHandle =
		fillHandleCell && fillHandleCell.rowId === rows[cellSelection?.maxRow ?? -1]?.id && !edit;

	return (
		<div className="border-line bg-surface overflow-hidden rounded-md border">
			{selectable && selectedIds.size > 0 && (
				<div className="border-line bg-surface-2 flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
					<span className={cn('text-muted', cellText)}>{selectedIds.size} selected</span>
					{onBulkDelete && (
						<Button
							variant="danger"
							size="sm"
							className="h-7 text-xs"
							onClick={() => onBulkDelete(Array.from(selectedIds))}
						>
							Delete selected
						</Button>
					)}
					<Button
						variant="ghost"
						size="sm"
						className="text-muted h-7 text-xs"
						onClick={() => setSelectedIds(new Set())}
					>
						Clear
					</Button>
				</div>
			)}
			<table ref={tableRef} className={cn('w-full table-fixed border-collapse', cellText)}>
				<thead>
					<tr className="bg-surface-2 border-line border-b">
						{selectable && (
							<th scope="col" className={cn('w-8', headPad)}>
								<input
									type="checkbox"
									className="accent-primary h-3.5 w-3.5 cursor-pointer"
									checked={allSelected}
									ref={(el) => {
										if (el) el.indeterminate = someSelected && !allSelected;
									}}
									onChange={toggleAll}
									aria-label="Select all rows"
								/>
							</th>
						)}
						{columns.map((col) => (
							<th
								key={col.key}
								scope="col"
								className={cn(
									'text-muted truncate font-semibold tracking-wide uppercase',
									headText,
									headPad,
									col.align === 'right' && 'text-right',
									col.className
								)}
							>
								{col.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td
								colSpan={columns.length + (selectable ? 1 : 0)}
								className="text-muted px-3 py-8 text-center text-sm"
							>
								{emptyMessage}
							</td>
						</tr>
					) : (
						rows.map((row) => {
							const selected = selectedIds.has(row.id);
							return (
								<tr
									key={row.id}
									data-row-id={row.id}
									className={cn(
										'border-line border-b last:border-b-0',
										selected ? 'bg-primary/8' : 'hover:bg-surface-2/60'
									)}
								>
									{selectable && (
										<td className={cn('w-8 text-center', cellPad)}>
											<input
												type="checkbox"
												className="accent-primary h-3.5 w-3.5 cursor-pointer"
												onChange={() => toggleRow(row.id)}
												checked={selected}
												aria-label={`Select ${rowLabel(row)}`}
											/>
										</td>
									)}
									{columns.map((col) => {
										if (col.type === 'actions' || col.type === 'action-delete') {
											return renderActions(row, col);
										}

										if (col.type === 'action-link') {
											const to = col.linkTo?.(row);
											return (
												<td
													key={col.key}
													className={cn('px-0.5 py-0.5 text-center', col.className)}
												>
													{to ? (
														<Link
															to={to}
															className="text-muted hover:text-fg hover:bg-surface-2 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md"
															aria-label={col.linkAriaLabel?.(row) || `Open ${rowLabel(row)}`}
														>
															<ExternalLink size={14} />
														</Link>
													) : null}
												</td>
											);
										}

										if (isEditing(row.id, col.key)) {
											const inputType = col.inputType || 'text';

											if (col.type === 'qty-unit') {
												return (
													<td key={col.key} className={cn('p-0', col.className)}>
														<div
															ref={editorRef}
															className="border-primary flex h-7 w-full items-stretch border"
														>
															<input
																ref={inputRef}
																type="number"
																min={col.min ?? '0'}
																step={col.step ?? '0.01'}
																className="bg-surface text-fg min-w-0 flex-1 px-1.5 text-right text-xs tabular-nums focus:outline-none"
																value={draft}
																onChange={(e) => setDraft(e.target.value)}
																onKeyDown={onKeyDown}
																onBlur={onBlur}
																aria-label="Quantity"
															/>
															<select
																className="border-line bg-surface-2 text-fg w-14 shrink-0 border-l px-0.5 text-[10px] focus:outline-none"
																value={draftUnit}
																onChange={(e) => {
																	skipBlurCancel.current = true;
																	commitEdit(draft, e.target.value);
																}}
																onKeyDown={onKeyDown}
																onBlur={onBlur}
																aria-label="Unit"
															>
																{(col.unitOptions || []).map((opt) => (
																	<option key={opt.value} value={opt.value}>
																		{opt.label}
																	</option>
																))}
															</select>
														</div>
													</td>
												);
											}

											return (
												<td key={col.key} className={cn('p-0', col.className)}>
													{col.type === 'select' || col.type === 'status-icon' ? (
														<select
															ref={inputRef}
															className="border-primary bg-surface text-fg h-7 w-full border px-1.5 text-xs focus:outline-none"
															value={draft}
															onChange={(e) => {
																skipBlurCancel.current = true;
																commitEdit(e.target.value);
															}}
															onKeyDown={onKeyDown}
															onBlur={onBlur}
														>
															{(col.options || []).map((opt) => (
																<option key={opt.value} value={opt.value}>
																	{opt.label}
																</option>
															))}
														</select>
													) : (
														<input
															ref={inputRef}
															type={inputType}
															min={inputType === 'number' ? (col.min ?? '0') : undefined}
															step={inputType === 'number' ? (col.step ?? '0.01') : undefined}
															className={cn(
																'border-primary bg-surface text-fg h-7 w-full border px-1.5 text-xs focus:outline-none',
																col.align === 'right' && 'text-right tabular-nums'
															)}
															value={draft}
															onChange={(e) => setDraft(e.target.value)}
															onKeyDown={onKeyDown}
															onBlur={onBlur}
														/>
													)}
												</td>
											);
										}

										const shown = displayCell(row, col);
										const cellSelected = isCellInSelection(row.id, col.key);
										const fillTarget = isFillPreviewCell(row.id, col.key);
										const hasFillHandle =
											showFillHandle &&
											fillHandleCell?.rowId === row.id &&
											fillHandleCell?.colKey === col.key;
										const titleText = isFillableCell(col)
											? 'Click to select · double-click to edit · drag fill handle to copy down'
											: col.type === 'status-icon'
												? row[col.key]
												: undefined;

										return (
											<td
												key={col.key}
												className={cn(
													'text-fg relative truncate select-none',
													cellPad,
													col.align === 'right' && 'text-right tabular-nums',
													isFillableCell(col) && 'hover:bg-primary/5 cursor-cell',
													cellSelected && 'bg-primary/15 ring-primary/35 ring-1 ring-inset',
													fillTarget &&
														isFillDragging &&
														'bg-primary/25 ring-primary/50 ring-1 ring-inset',
													!col.editable && col.type !== 'status-icon' && 'text-muted',
													col.type === 'status-icon' && 'text-center',
													col.className
												)}
												onMouseDown={(e) => {
													if (e.shiftKey) e.preventDefault();
													handleCellSelect(e, row, col);
												}}
												onDoubleClick={() => startEdit(row, col.key)}
												title={titleText}
											>
												{shown}
												{hasFillHandle && (
													<span
														role="button"
														tabIndex={-1}
														className="border-primary bg-primary absolute right-0 bottom-0 z-10 h-2.5 w-2.5 translate-x-1/2 translate-y-1/2 cursor-crosshair rounded-full border-2"
														title="Drag to fill cells below"
														aria-label="Fill handle"
														onMouseDown={startFillDrag}
													/>
												)}
											</td>
										);
									})}
								</tr>
							);
						})
					)}
				</tbody>
			</table>
			{onAdd && (
				<div className="border-line bg-surface-2/40 flex border-t px-2 py-1">
					<Button
						variant="ghost"
						size="sm"
						className="text-muted hover:text-fg h-7 text-xs"
						onClick={onAdd}
						loading={adding}
						disabled={adding}
					>
						<Plus size={14} /> {addLabel}
					</Button>
				</div>
			)}
		</div>
	);
}
