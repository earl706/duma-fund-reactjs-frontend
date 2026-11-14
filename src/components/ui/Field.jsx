import { Children, isValidElement, useId, useMemo, useState } from 'react';

import { cn } from '../../lib/format';
import { ListboxOption, ListboxShell, ListboxTrigger } from './Listbox';

const baseControl =
	'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg ' +
	'placeholder:text-muted focus:border-primary focus:outline-none ' +
	'focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-colors';

/** Labeled text input with accessible association and error messaging. */
export function Input({ label, error, className, id, ...props }) {
	const generated = useId();
	const fieldId = id || generated;
	return (
		<div className="space-y-1.5">
			{label && (
				<label htmlFor={fieldId} className="text-fg block text-sm font-medium">
					{label}
				</label>
			)}
			<input
				id={fieldId}
				className={cn(baseControl, error && 'border-danger', className)}
				aria-invalid={error ? 'true' : undefined}
				{...props}
			/>
			{error && <p className="text-danger text-xs">{error}</p>}
		</div>
	);
}

export function Textarea({ label, error, className, id, rows = 4, ...props }) {
	const generated = useId();
	const fieldId = id || generated;
	return (
		<div className="space-y-1.5">
			{label && (
				<label htmlFor={fieldId} className="text-fg block text-sm font-medium">
					{label}
				</label>
			)}
			<textarea
				id={fieldId}
				rows={rows}
				className={cn(baseControl, 'resize-y', error && 'border-danger', className)}
				{...props}
			/>
			{error && <p className="text-danger text-xs">{error}</p>}
		</div>
	);
}

function optionLabel(node) {
	if (node == null || typeof node === 'boolean') return '';
	if (typeof node === 'string' || typeof node === 'number') return String(node);
	if (Array.isArray(node)) return node.map(optionLabel).join('');
	if (isValidElement(node)) return optionLabel(node.props.children);
	return '';
}

/** Parse `<option>` children into { value, label, disabled }. */
function parseSelectOptions(children) {
	const options = [];
	Children.forEach(children, (child) => {
		if (!isValidElement(child)) return;
		if (child.type !== 'option') return;
		const value =
			child.props.value !== undefined && child.props.value !== null
				? String(child.props.value)
				: optionLabel(child.props.children);
		options.push({
			value,
			label: optionLabel(child.props.children) || value,
			disabled: Boolean(child.props.disabled)
		});
	});
	return options;
}

/**
 * ProfileSwitcher-style listbox select. Keeps native-select call shape:
 * `<Select value onChange={(e) => …}><option>…</option></Select>`
 *
 * @param {'field'|'compact'} [props.variant]
 */
export function Select({
	label,
	error,
	className,
	id,
	children,
	value,
	onChange,
	disabled = false,
	name,
	variant = 'field',
	placeholder,
	triggerRef,
	onBlur,
	onKeyDown,
	onMouseDown,
	'aria-label': ariaLabel
}) {
	const generated = useId();
	const fieldId = id || generated;
	const labelId = `${fieldId}-label`;
	const [open, setOpen] = useState(false);

	const options = useMemo(() => parseSelectOptions(children), [children]);
	const stringValue = value == null ? '' : String(value);
	const selected = options.find((o) => o.value === stringValue) || null;
	const displayLabel = selected?.label || placeholder || '';
	const isPlaceholder = !selected || selected.value === '';

	const emit = (next) => {
		onChange?.({
			target: { value: next, name: name ?? '' },
			currentTarget: { value: next, name: name ?? '' }
		});
	};

	const pick = (next) => {
		if (disabled) return;
		emit(next);
		setOpen(false);
	};

	const compact = variant === 'compact';

	const menu = (
		<>
			{options.length === 0 ? (
				<p className="text-muted px-3 py-1.5 text-sm">No options</p>
			) : (
				options.map((opt) => (
					<ListboxOption
						key={opt.value === '' ? '__empty' : opt.value}
						selected={opt.value === stringValue}
						disabled={opt.disabled}
						onClick={() => pick(opt.value)}
						className={compact ? 'px-2 py-1 text-xs' : undefined}
					>
						{opt.label || (opt.value === '' ? '—' : opt.value)}
					</ListboxOption>
				))
			)}
		</>
	);

	return (
		<div className={compact ? undefined : 'space-y-1.5'}>
			{label && !compact && (
				<label id={labelId} htmlFor={fieldId} className="text-fg block text-sm font-medium">
					{label}
				</label>
			)}
			<ListboxShell
				open={open}
				onOpenChange={(next) => {
					if (disabled) return;
					setOpen(next);
				}}
				closeLabel={label ? `Close ${label}` : 'Close menu'}
				matchTriggerWidth
				menu={menu}
			>
				<ListboxTrigger
					ref={triggerRef}
					id={fieldId}
					open={open}
					disabled={disabled}
					variant={variant}
					placeholder={isPlaceholder}
					className={cn(error && 'border-danger', className)}
					aria-labelledby={label && !compact ? labelId : undefined}
					aria-label={ariaLabel || (compact ? label : undefined)}
					aria-invalid={error ? 'true' : undefined}
					onClick={() => !disabled && setOpen((v) => !v)}
					onBlur={onBlur}
					onKeyDown={onKeyDown}
					onMouseDown={onMouseDown}
				>
					{displayLabel || placeholder || 'Select…'}
				</ListboxTrigger>
			</ListboxShell>
			{error && <p className="text-danger text-xs">{error}</p>}
		</div>
	);
}
