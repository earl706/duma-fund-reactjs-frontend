import { AnimatePresence, motion } from 'framer-motion';

import { cn } from '../../lib/format';
import { AppIcon } from './AppIcon';

const PULSE = {
	opacity: [0.35, 1, 0.35],
	scale: [0.96, 1, 0.96]
};

const PULSE_TRANSITION = {
	duration: 1.45,
	repeat: Infinity,
	ease: 'easeInOut'
};

const FADE = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
	transition: { duration: 0.22, ease: 'easeOut' }
};

/** Pulsing DumaFund app icon — shared loading indicator. */
export function Spinner({ size = 36, className, alt = 'Loading' }) {
	return (
		<motion.span
			role="status"
			aria-label={alt}
			className={cn('inline-flex shrink-0', className)}
			animate={PULSE}
			transition={PULSE_TRANSITION}
		>
			<AppIcon size={size} alt="" className="rounded-[22%]" />
		</motion.span>
	);
}

export function LoadingScreen({ label = 'Loading…', compact = false, className }) {
	return (
		<div
			className={cn(
				'text-muted flex flex-col items-center justify-center gap-3',
				compact ? 'h-full min-h-0 py-8' : 'h-full min-h-[40vh]',
				className
			)}
		>
			<Spinner size={compact ? 32 : 44} />
			{label ? <p className="text-sm">{label}</p> : null}
		</div>
	);
}

/** Subtle fade-in when mounted content replaces a loader. */
export function FadeIn({ children, className }) {
	return (
		<motion.div
			className={className}
			initial={FADE.initial}
			animate={FADE.animate}
			transition={FADE.transition}
		>
			{children}
		</motion.div>
	);
}

/**
 * Swap loader ↔ content with a short opacity fade.
 * Use anywhere `{loading ? <LoadingScreen /> : children}` was used.
 */
export function LoadingSwap({ loading, label = 'Loading…', compact = false, className, children }) {
	return (
		<AnimatePresence mode="wait">
			{loading ? (
				<motion.div
					key="loading"
					className={cn('h-full min-h-0', className)}
					initial={FADE.initial}
					animate={FADE.animate}
					exit={FADE.exit}
					transition={FADE.transition}
				>
					<LoadingScreen label={label} compact={compact} />
				</motion.div>
			) : (
				<motion.div
					key="content"
					className={cn('h-full min-h-0', className)}
					initial={FADE.initial}
					animate={FADE.animate}
					exit={FADE.exit}
					transition={FADE.transition}
				>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

export function Skeleton({ className }) {
	return <div className={cn('bg-surface-2 animate-pulse rounded-md', className)} />;
}

export function EmptyState({ icon: Icon, title, description, action }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			className="border-line flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-10 text-center"
		>
			{Icon && (
				<div className="bg-surface-2 text-muted flex h-12 w-12 items-center justify-center rounded-sm">
					<Icon size={22} />
				</div>
			)}
			<div>
				<p className="text-fg font-medium">{title}</p>
				{description && <p className="text-muted mt-1 text-sm">{description}</p>}
			</div>
			{action}
		</motion.div>
	);
}
