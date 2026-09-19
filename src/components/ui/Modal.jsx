import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import { Button } from './Button';

/**
 * Accessible modal dialog.
 * - Closes on Escape and backdrop click.
 * - Locks body scroll while open.
 * - role="dialog" + aria-modal for screen readers.
 * - size="xl" is a full-viewport sheet on narrow screens (safe-area padded).
 */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e) => e.key === 'Escape' && onClose?.();
		document.addEventListener('keydown', onKey);
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = '';
		};
	}, [open, onClose]);

	const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
	const fullBleed = size === 'xl';

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
				>
					<div
						className="absolute inset-0 cursor-pointer bg-black/50 backdrop-blur-sm"
						onClick={onClose}
						aria-hidden="true"
					/>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-label={title}
						className={`relative flex w-full flex-col overflow-hidden ${widths[size]} border-line bg-surface border shadow-xl ${
							fullBleed
								? 'h-dvh max-h-dvh rounded-none sm:h-auto sm:max-h-[min(90vh,52rem)] sm:rounded-lg'
								: 'max-h-[85dvh] rounded-t-lg sm:rounded-lg'
						}`}
						initial={{ y: 24, opacity: 0, scale: 0.98 }}
						animate={{ y: 0, opacity: 1, scale: 1 }}
						exit={{ y: 24, opacity: 0, scale: 0.98 }}
						transition={{ type: 'spring', stiffness: 320, damping: 30 }}
					>
						<div
							className={`border-line flex shrink-0 items-center justify-between border-b px-4 py-3 sm:p-4 ${
								fullBleed ? 'pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-4' : ''
							}`}
						>
							<h2 className="text-fg min-w-0 truncate pr-2 font-semibold">{title}</h2>
							<Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
								<X size={18} />
							</Button>
						</div>
						<div
							className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:p-5 ${
								fullBleed ? '' : 'max-h-[70vh]'
							}`}
						>
							{children}
						</div>
						{footer && (
							<div className="border-line bg-surface relative z-10 flex shrink-0 flex-row gap-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-end sm:p-4 [&>button]:min-w-0 [&>button]:flex-1 sm:[&>button]:w-auto sm:[&>button]:flex-none">
								{footer}
							</div>
						)}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
