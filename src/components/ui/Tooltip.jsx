import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/format';

/**
 * Light hover/focus tooltip. Renders in a portal above the trigger.
 * Pass `disabled` or empty `content` to skip the tip (children still render).
 */
export function Tooltip({ content, children, disabled = false, className, contentClassName }) {
	const triggerRef = useRef(null);
	const [open, setOpen] = useState(false);
	const [coords, setCoords] = useState(null);
	const show = open && !disabled && Boolean(content);

	useLayoutEffect(() => {
		if (!show || !triggerRef.current) {
			setCoords(null);
			return;
		}
		const update = () => {
			const rect = triggerRef.current.getBoundingClientRect();
			const spaceAbove = rect.top;
			const placeBelow = spaceAbove < 40;
			setCoords({
				top: placeBelow ? rect.bottom + 8 : rect.top - 8,
				left: rect.left + rect.width / 2,
				placeBelow
			});
		};
		update();
		window.addEventListener('scroll', update, true);
		window.addEventListener('resize', update);
		return () => {
			window.removeEventListener('scroll', update, true);
			window.removeEventListener('resize', update);
		};
	}, [show, content]);

	return (
		<>
			<span
				ref={triggerRef}
				className={cn('inline-flex max-w-full', className)}
				onMouseEnter={() => setOpen(true)}
				onMouseLeave={() => setOpen(false)}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
			>
				{children}
			</span>
			{show &&
				coords &&
				createPortal(
					<span
						role="tooltip"
						style={{
							top: coords.top,
							left: coords.left,
							transform: coords.placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
						}}
						className={cn(
							'pointer-events-none fixed z-[80] max-w-[min(18rem,calc(100vw-1rem))]',
							'border-line bg-surface text-fg rounded-md border px-2 py-1 text-xs font-medium shadow-md',
							'whitespace-nowrap tabular-nums',
							contentClassName
						)}
					>
						{content}
					</span>,
					document.body
				)}
		</>
	);
}
