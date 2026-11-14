import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown } from 'lucide-react';

import { cn } from '../../lib/format';

/**
 * Shared ProfileSwitcher-style listbox shell: portal menu, backdrop, Escape,
 * and auto flip above/below (or fixed-right for collapsed triggers).
 *
 * `children` is the trigger; `menu` is the listbox body.
 * Positioning uses a wrapper ref around the trigger (no render-prop ref).
 */
export function ListboxShell({
	open,
	onOpenChange,
	children,
	menu,
	menuClassName,
	placement = 'auto',
	matchTriggerWidth = true,
	menuWidth = 224,
	maxHeight = 288,
	closeLabel = 'Close menu',
	zIndexBackdrop = 60,
	zIndexMenu = 70,
	className
}) {
	const anchorRef = useRef(null);
	const [menuStyle, setMenuStyle] = useState(null);

	useLayoutEffect(() => {
		if (!open || !anchorRef.current) {
			setMenuStyle(null);
			return undefined;
		}
		const place = () => {
			const el = anchorRef.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();

			if (placement === 'right') {
				setMenuStyle({
					position: 'fixed',
					top: rect.top,
					left: rect.right + 8,
					width: menuWidth,
					maxHeight
				});
				return;
			}

			const spaceBelow = window.innerHeight - rect.bottom - 8;
			const spaceAbove = rect.top - 8;
			const openUp = spaceBelow < Math.min(maxHeight, 160) && spaceAbove > spaceBelow;
			const height = Math.min(maxHeight, openUp ? spaceAbove : spaceBelow);
			setMenuStyle({
				position: 'fixed',
				left: rect.left,
				width: matchTriggerWidth ? rect.width : menuWidth,
				maxHeight: Math.max(80, height),
				...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 })
			});
		};
		place();
		window.addEventListener('resize', place);
		window.addEventListener('scroll', place, true);
		return () => {
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
		};
	}, [open, placement, matchTriggerWidth, menuWidth, maxHeight]);

	useEffect(() => {
		if (!open) return undefined;
		const onKey = (e) => {
			if (e.key === 'Escape') onOpenChange(false);
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, onOpenChange]);

	return (
		<div ref={anchorRef} className={cn('relative', className)}>
			{children}
			{open &&
				createPortal(
					<>
						<button
							type="button"
							className="fixed inset-0 cursor-default"
							style={{ zIndex: zIndexBackdrop }}
							aria-label={closeLabel}
							onClick={() => onOpenChange(false)}
						/>
						{menuStyle && (
							<div
								className={cn(
									'border-line bg-surface overflow-y-auto rounded-md border py-1 shadow-lg',
									menuClassName
								)}
								style={{ ...menuStyle, zIndex: zIndexMenu }}
								role="listbox"
							>
								{menu}
							</div>
						)}
					</>,
					document.body
				)}
		</div>
	);
}

/** Option row styles matching ProfileSwitcher. */
export function ListboxOption({
	selected = false,
	disabled = false,
	onClick,
	className,
	children,
	...props
}) {
	return (
		<button
			type="button"
			role="option"
			aria-selected={selected}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				'flex w-full cursor-pointer px-3 py-1.5 text-left text-sm',
				disabled && 'pointer-events-none opacity-40',
				selected ? 'bg-primary/10 text-fg' : 'text-fg hover:bg-surface-2',
				className
			)}
			{...props}
		>
			{children}
		</button>
	);
}

/**
 * Default field/compact trigger button (ProfileSwitcher chrome).
 * Forward ref so sheets can focus / bind key handlers.
 */
export function ListboxTrigger({
	ref,
	open,
	disabled = false,
	variant = 'field',
	placeholder = false,
	className,
	children,
	chevron = true,
	...props
}) {
	return (
		<button
			ref={ref}
			type="button"
			disabled={disabled}
			aria-haspopup="listbox"
			aria-expanded={open}
			className={cn(
				'border-line bg-surface-2 hover:bg-surface-2/80 flex w-full cursor-pointer items-center gap-2 border text-left',
				'focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2',
				disabled && 'pointer-events-none opacity-60',
				variant === 'compact' ? 'h-7 gap-1 rounded-sm px-1.5 py-0 text-xs' : 'rounded-md px-3 py-2',
				className
			)}
			{...props}
		>
			<span
				className={cn(
					'min-w-0 flex-1 truncate font-medium',
					variant === 'compact' ? 'text-xs' : 'text-sm',
					placeholder ? 'text-muted' : 'text-fg'
				)}
			>
				{children}
			</span>
			{chevron && (
				<ChevronsUpDown size={variant === 'compact' ? 12 : 16} className="text-muted shrink-0" />
			)}
		</button>
	);
}
