import { cn } from '../../lib/format';

/**
 * Compact icon-above + label control (Timer alarm pattern).
 * Use in a flex row with `flex-1` siblings for equal-width choices.
 */
export function IconChoice({
	selected = false,
	disabled = false,
	icon: Icon,
	label,
	onClick,
	ariaLabel,
	className
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			aria-label={ariaLabel || label}
			aria-pressed={selected}
			title={label}
			className={cn(
				'inline-flex w-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-center transition-colors duration-150',
				'focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2',
				'disabled:pointer-events-none disabled:opacity-50',
				selected ? 'text-primary' : 'text-muted hover:text-fg',
				className
			)}
		>
			{Icon ? <Icon size={16} className="shrink-0" aria-hidden /> : null}
			<span className="max-w-full truncate text-center text-[10px] font-medium tracking-wide">
				{label}
			</span>
		</button>
	);
}
