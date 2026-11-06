import { useEffect, useId, useRef } from 'react';
import { Calculator } from 'lucide-react';

import { cn } from '../../lib/format';
import { useCalculatorStore } from '../../stores/calculatorStore';

/**
 * Register a money field as the calculator bind target.
 * Call from raw <input>s / DataSheet editors that cannot use MoneyField.
 */
export function useMoneyBind({
	id,
	value,
	onApply,
	label,
	disabled = false,
	clampNonNegative = true
}) {
	const setBind = useCalculatorStore((s) => s.setBind);
	const clearBind = useCalculatorStore((s) => s.clearBind);
	const openCalculator = useCalculatorStore((s) => s.openCalculator);
	const bindId = id;
	const onApplyRef = useRef(onApply);
	onApplyRef.current = onApply;

	const bindNow = (nextValue = value) => {
		if (disabled) return;
		setBind({
			id: bindId,
			label,
			value: nextValue == null ? '' : String(nextValue),
			clampNonNegative,
			onApply: (v) => onApplyRef.current?.(v)
		});
	};

	const openFromField = (nextValue = value) => {
		if (disabled) return;
		bindNow(nextValue);
		openCalculator({ seedFromBind: true, seedValue: nextValue == null ? '' : String(nextValue) });
	};

	useEffect(
		() => () => {
			clearBind(bindId);
		},
		[bindId, clearBind]
	);

	return {
		bindId,
		onFocus: () => bindNow(value),
		openFromField,
		bindNow
	};
}

export function CalcIconButton({ onClick, disabled, className }) {
	return (
		<button
			type="button"
			tabIndex={-1}
			disabled={disabled}
			onMouseDown={(e) => {
				// Keep focus on the money input so blur/commit races don't clear bind.
				e.preventDefault();
			}}
			onClick={onClick}
			aria-label="Open money calculator"
			className={cn(
				'text-muted/70 hover:text-fg pointer-events-auto absolute top-1/2 left-1 z-10 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm disabled:cursor-default disabled:opacity-40',
				className
			)}
		>
			<Calculator size={14} strokeWidth={2} />
		</button>
	);
}

/**
 * Labeled money Input with a left-overlaid calculator accessory (no layout shift).
 * Forwards standard Input props; onChange still receives the event.
 */
export function MoneyField({
	id,
	label,
	value,
	onChange,
	disabled,
	clampNonNegative = true,
	className,
	inputClassName,
	...props
}) {
	const generated = useId();
	const fieldId = id || generated;
	const applyFromCalc = (next) => {
		onChange?.({ target: { value: next } });
	};
	const { onFocus, openFromField } = useMoneyBind({
		id: fieldId,
		value,
		onApply: applyFromCalc,
		label,
		disabled,
		clampNonNegative
	});

	return (
		<div className={cn('space-y-1.5', className)}>
			{label && (
				<label htmlFor={fieldId} className="text-fg block text-sm font-medium">
					{label}
				</label>
			)}
			<div className="relative">
				<input
					id={fieldId}
					type="number"
					inputMode="decimal"
					disabled={disabled}
					value={value}
					onChange={onChange}
					onFocus={onFocus}
					className={cn(
						// pl-8 clears the left overlay icon without changing outer field size
						'border-line bg-surface text-fg w-full rounded-md border py-2 pr-3 pl-8 text-sm',
						'placeholder:text-muted focus:border-primary focus:outline-none',
						// Inset ring avoids the outer “double frame” with the border
						'transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-inset',
						'disabled:cursor-not-allowed disabled:opacity-60',
						inputClassName
					)}
					{...props}
				/>
				<CalcIconButton disabled={disabled} onClick={() => openFromField(value)} />
			</div>
		</div>
	);
}

/** Standalone trailing button that binds + opens (for raw inputs that manage focus themselves). */
export function MoneyCalcTrigger({
	id,
	value,
	onApply,
	label,
	disabled,
	clampNonNegative = true,
	className
}) {
	const { openFromField } = useMoneyBind({
		id,
		value,
		onApply,
		label,
		disabled,
		clampNonNegative
	});
	return (
		<CalcIconButton
			disabled={disabled}
			onClick={() => openFromField(value)}
			className={className}
		/>
	);
}

/**
 * Compact money number input + left-overlaid calc icon for table / DataSheet cells.
 * Wrapper is layout-neutral (relative only); icon does not take flex space.
 */
export function InlineMoneyInput({
	id,
	value,
	onChange,
	onApply,
	label,
	disabled,
	clampNonNegative = true,
	className,
	inputClassName,
	inputRef,
	onKeyDown,
	onBlur,
	onBeforeOpen,
	min = '0',
	step = '0.01',
	...props
}) {
	const generated = useId();
	const bindId = id || generated;
	const apply = onApply || ((v) => onChange?.({ target: { value: v } }));
	const { onFocus, openFromField } = useMoneyBind({
		id: bindId,
		value,
		onApply: apply,
		label,
		disabled,
		clampNonNegative
	});

	return (
		<div className={cn('relative h-full min-w-0', className)}>
			<input
				ref={inputRef}
				type="number"
				inputMode="decimal"
				min={min}
				step={step}
				disabled={disabled}
				value={value}
				onChange={onChange}
				onFocus={onFocus}
				onKeyDown={onKeyDown}
				onBlur={onBlur}
				className={cn('h-full w-full pl-6', inputClassName)}
				{...props}
			/>
			<CalcIconButton
				disabled={disabled}
				onClick={() => {
					onBeforeOpen?.();
					openFromField(value);
				}}
			/>
		</div>
	);
}
