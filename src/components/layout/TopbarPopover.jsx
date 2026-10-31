import { cn } from '../../lib/format';

/**
 * Topbar dropdown that stays on-screen.
 * Mobile: nearly edge-to-edge under the topbar (centered with gutters).
 * sm+: right-anchored card next to the trigger.
 */
export function TopbarPopover({ open, onClose, children, className, closeLabel = 'Close' }) {
	if (!open) return null;

	return (
		<>
			<button
				type="button"
				className="fixed inset-0 z-40 cursor-default"
				aria-label={closeLabel}
				onClick={onClose}
			/>
			<div
				role="dialog"
				className={cn(
					'border-line bg-surface z-50 rounded-md border shadow-lg',
					'fixed top-16 right-2 left-2 max-h-[min(24rem,calc(100dvh-5rem))] overflow-y-auto',
					'sm:absolute sm:top-full sm:right-0 sm:left-auto sm:mt-1 sm:max-h-80 sm:w-80',
					className
				)}
			>
				{children}
			</div>
		</>
	);
}
