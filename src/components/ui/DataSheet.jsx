import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';

import { cn } from '../../lib/format';
import { Button } from './Button';

/**
 * Spreadsheet-style data table.
 * Double-click an editable cell to edit; Enter commits; Escape / blur cancels.
 * Desktop: fixed layout with truncated cells (no horizontal scroll).
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
	adding = false,
	saving = false,
	autoEdit = null,
	addLabel = 'Add row',
	emptyMessage = 'No rows yet. Add a row to get started.',
	rowLabel = (row) => row.title || 'row'
}) {
	const [edit, setEdit] = useState(null);
	const [draft, setDraft] = useState('');
	const [draftUnit, setDraftUnit] = useState('');
	const inputRef = useRef(null);
	const editorRef = useRef(null);
	const skipBlurCancel = useRef(false);
	const autoEditKey = useRef(null);

	const editableKeys = new Set(columns.filter((c) => c.editable).map((c) => c.key));

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

	const commitEdit = (overrideValue, overrideUnit) => {
		if (!edit) return;
		const row = rows.find((r) => r.id === edit.id);
		if (!row) {
			cancelEdit();
			return;
		}
		const col = columns.find((c) => c.key === edit.field);

		if (col?.type === 'qty-unit') {
			const unitKey = col.unitKey || 'unit';
			const nextQty = overrideValue !== undefined ? overrideValue : draft;
			const nextUnit = overrideUnit !== undefined ? overrideUnit : draftUnit;
			const prevQty = getDraft(row, edit.field);
			const prevUnit = getUnitDraft(row, col);
			const qtyNormalized = String(nextQty).trim();
			if (col.required && !qtyNormalized) {
				cancelEdit();
				return;
			}
			if (String(qtyNormalized) === String(prevQty) && String(nextUnit) === String(prevUnit)) {
				cancelEdit();
				return;
			}
			onCommit?.({
				id: row.id,
				field: edit.field,
				value: qtyNormalized,
				patch: { [edit.field]: qtyNormalized, [unitKey]: nextUnit }
			});
			cancelEdit();
			return;
		}

		const next = overrideValue !== undefined ? overrideValue : draft;
		const prev = getDraft(row, edit.field);
		const shouldTrim = col?.inputType !== 'number';
		const normalized = shouldTrim ? String(next).trim() : next;
		if (col?.required && !String(normalized).trim()) {
			cancelEdit();
			return;
		}
		if (String(normalized) === String(prev)) {
			cancelEdit();
			return;
		}
		onCommit?.({ id: row.id, field: edit.field, value: normalized });
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
		if (col.render) return col.render(row);
		const raw = col.getDisplay ? col.getDisplay(row) : row[col.key];
		if (raw == null || raw === '') return <span className="text-muted/50">—</span>;
		return raw;
	};

	return (
		<div className="border-line bg-surface overflow-hidden rounded-md border">
			<table className="w-full table-fixed border-collapse text-sm">
				<thead>
					<tr className="bg-surface-2 border-line border-b">
						{columns.map((col) => (
							<th
								key={col.key}
								scope="col"
								className={cn(
									'text-muted truncate px-2 py-2 text-left text-xs font-semibold tracking-wide uppercase',
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
							<td colSpan={columns.length} className="text-muted px-3 py-8 text-center text-sm">
								{emptyMessage}
							</td>
						</tr>
					) : (
						rows.map((row) => (
							<tr
								key={row.id}
								className="border-line hover:bg-surface-2/60 border-b last:border-b-0"
							>
								{columns.map((col) => {
									if (col.type === 'action-delete') {
										return (
											<td key={col.key} className={cn('px-1 py-0.5 text-center', col.className)}>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8"
													onClick={() => onRequestDelete?.(row)}
													aria-label={`Delete ${rowLabel(row)}`}
												>
													<Trash2 size={15} />
												</Button>
											</td>
										);
									}

									if (col.type === 'action-link') {
										const to = col.linkTo?.(row);
										return (
											<td key={col.key} className={cn('px-1 py-0.5 text-center', col.className)}>
												{to ? (
													<Link
														to={to}
														className="text-muted hover:text-fg hover:bg-surface-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md"
														aria-label={col.linkAriaLabel?.(row) || `Open ${rowLabel(row)}`}
													>
														<ExternalLink size={15} />
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
														className="border-primary flex h-9 w-full items-stretch border"
													>
														<input
															ref={inputRef}
															type="number"
															min={col.min ?? '0'}
															step={col.step ?? '0.01'}
															className="bg-surface text-fg min-w-0 flex-1 px-2 text-right text-sm tabular-nums focus:outline-none"
															value={draft}
															onChange={(e) => setDraft(e.target.value)}
															onKeyDown={onKeyDown}
															onBlur={onBlur}
															aria-label="Quantity"
														/>
														<select
															className="border-line bg-surface-2 text-fg w-17 shrink-0 border-l px-1 text-xs focus:outline-none"
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
												{col.type === 'select' ? (
													<select
														ref={inputRef}
														className="border-primary bg-surface text-fg h-9 w-full border px-2 text-sm focus:outline-none"
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
															'border-primary bg-surface text-fg h-9 w-full border px-2 text-sm focus:outline-none',
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
									const titleText =
										typeof shown === 'string'
											? shown
											: col.editable
												? 'Double-click to edit'
												: undefined;

									return (
										<td
											key={col.key}
											className={cn(
												'text-fg truncate px-2 py-2',
												col.align === 'right' && 'text-right tabular-nums',
												col.editable && 'hover:bg-primary/5 cursor-cell',
												!col.editable && 'text-muted',
												col.className
											)}
											onDoubleClick={() => startEdit(row, col.key)}
											title={col.editable ? 'Double-click to edit' : titleText}
										>
											{shown}
										</td>
									);
								})}
							</tr>
						))
					)}
				</tbody>
			</table>
			{onAdd && (
				<div className="border-line bg-surface-2/40 flex border-t px-2 py-1.5">
					<Button
						variant="ghost"
						size="sm"
						className="text-muted hover:text-fg"
						onClick={onAdd}
						loading={adding}
						disabled={adding}
					>
						<Plus size={15} /> {addLabel}
					</Button>
				</div>
			)}
		</div>
	);
}
