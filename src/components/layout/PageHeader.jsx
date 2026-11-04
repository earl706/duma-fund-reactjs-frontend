import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings } from 'lucide-react';

import { useMobileLayout } from '../../hooks/useMobileLayout';
import { cn } from '../../lib/format';

/**
 * Page title row. Optional `corner` sits top-right; `settingsShortcut` adds a
 * mobile-only gear link in that corner (navigates to /settings).
 * `cornerAbove` places corner + settings in one row above the title so the
 * title can use the full width (avoids truncation beside a wide control).
 */
export function PageHeader({
	title,
	description,
	actions,
	icon: Icon,
	className,
	corner,
	settingsShortcut = false,
	cornerAbove = false
}) {
	const mobile = useMobileLayout();
	const showSettings = settingsShortcut && mobile;
	const hasCorner = Boolean(corner || showSettings);

	const cornerEl = hasCorner ? (
		<div className={cn('flex shrink-0 items-center gap-2', cornerAbove && 'w-full min-w-0')}>
			{corner}
			{showSettings && (
				<Link
					to="/settings"
					aria-label="Settings"
					className={cn(
						'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md',
						'text-muted hover:bg-surface-2 hover:text-fg',
						'focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2',
						'transition-all duration-150'
					)}
				>
					<Settings size={20} strokeWidth={2} />
				</Link>
			)}
		</div>
	) : null;

	const titleBlock = (
		<div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex min-w-0 items-center gap-3">
				{Icon && (
					<div className="bg-primary/12 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-sm">
						<Icon size={20} />
					</div>
				)}
				<div className="min-w-0">
					<h1
						className={cn(
							'text-fg text-xl font-bold tracking-tight sm:text-2xl',
							!cornerAbove && 'truncate'
						)}
					>
						{title}
					</h1>
					{description && (
						<p className={cn('text-muted text-sm', !cornerAbove && 'truncate')}>{description}</p>
					)}
				</div>
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);

	return (
		<motion.div
			initial={{ opacity: 0, y: -6 }}
			animate={{ opacity: 1, y: 0 }}
			className={cn('mb-6 flex flex-col gap-3', className)}
		>
			{cornerAbove ? (
				<>
					{cornerEl}
					{titleBlock}
				</>
			) : (
				<div className="flex items-start justify-between gap-3">
					{titleBlock}
					{cornerEl}
				</div>
			)}
		</motion.div>
	);
}
