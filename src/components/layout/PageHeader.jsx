import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings } from 'lucide-react';

import { useMobileLayout } from '../../hooks/useMobileLayout';
import { cn } from '../../lib/format';

/**
 * Page title row. Optional `corner` sits top-right; `settingsShortcut` adds a
 * mobile-only gear link outermost in that corner (navigates to /settings).
 */
export function PageHeader({
	title,
	description,
	actions,
	icon: Icon,
	className,
	corner,
	settingsShortcut = false
}) {
	const mobile = useMobileLayout();
	const showSettings = settingsShortcut && mobile;

	return (
		<motion.div
			initial={{ opacity: 0, y: -6 }}
			animate={{ opacity: 1, y: 0 }}
			className={cn('mb-6 flex flex-col gap-3', className)}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex min-w-0 items-center gap-3">
						{Icon && (
							<div className="bg-primary/12 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-sm">
								<Icon size={20} />
							</div>
						)}
						<div className="min-w-0">
							<h1 className="text-fg truncate text-xl font-bold tracking-tight sm:text-2xl">
								{title}
							</h1>
							{description && <p className="text-muted truncate text-sm">{description}</p>}
						</div>
					</div>
					{actions && <div className="flex items-center gap-2">{actions}</div>}
				</div>
				{(corner || showSettings) && (
					<div className="flex shrink-0 items-center gap-2">
						{corner}
						{showSettings && (
							<Link
								to="/settings"
								aria-label="Settings"
								className={cn(
									'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md',
									'text-muted hover:bg-surface-2 hover:text-fg',
									'focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2',
									'transition-all duration-150'
								)}
							>
								<Settings size={20} strokeWidth={2} />
							</Link>
						)}
					</div>
				)}
			</div>
		</motion.div>
	);
}
