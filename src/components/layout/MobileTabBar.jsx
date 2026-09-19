import { NavLink, useLocation } from 'react-router-dom';

import { cn } from '../../lib/format';
import { useUIStore } from '../../stores/uiStore';
import { useCanEditLedger } from '../../stores/profileStore';
import { mobileTabs } from './navItems';

function isTabActive(tab, pathname) {
	if (tab.end) return pathname === tab.to;
	return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
}

/**
 * GCash-style bottom tabs for the iOS shell. Scan is a raised center action,
 * not a route. Safe-area padding sits inside the bar.
 */
export function MobileTabBar() {
	const location = useLocation();
	const { scanOpen, openScan } = useUIStore();
	const canEdit = useCanEditLedger();

	return (
		<nav
			className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur"
			aria-label="Primary"
		>
			<ul className="grid h-16 grid-cols-5 items-end px-1">
				{mobileTabs.map((tab) => {
					if (tab.kind === 'scan') {
						const Icon = tab.icon;
						return (
							<li key="scan" className="flex justify-center">
								<button
									type="button"
									onClick={canEdit ? openScan : undefined}
									disabled={!canEdit}
									aria-label="Scan receipt"
									aria-pressed={scanOpen}
									className="flex -translate-y-4 cursor-pointer flex-col items-center disabled:cursor-default disabled:opacity-40"
								>
									<span
										className={cn(
											'flex h-14 w-14 items-center justify-center rounded-full shadow-lg',
											scanOpen
												? 'bg-primary text-primary-fg'
												: 'bg-primary text-primary-fg opacity-95'
										)}
									>
										<Icon size={26} strokeWidth={2.2} />
									</span>
									<span className="text-primary mt-0.5 text-[10px] font-semibold">{tab.label}</span>
								</button>
							</li>
						);
					}

					const Icon = tab.icon;
					const active = isTabActive(tab, location.pathname);
					return (
						<li key={tab.to} className="flex h-full items-center justify-center">
							<NavLink
								to={tab.to}
								end={tab.end}
								className={cn(
									'flex h-full min-w-[3.5rem] cursor-pointer flex-col items-center justify-center gap-0.5 px-1',
									active ? 'text-primary' : 'text-muted'
								)}
							>
								<Icon size={22} strokeWidth={active ? 2.4 : 2} />
								<span className="text-[10px] font-medium">{tab.label}</span>
							</NavLink>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
