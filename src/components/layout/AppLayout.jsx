import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { cn } from '../../lib/format';
import { isMobileApp } from '../../lib/desktop';
import { MfaPromptModal, MfaSetupModal } from '../auth/MfaModals';
import { LoadingScreen } from '../ui';
import { useAuthStore } from '../../stores/authStore';
import { CommandPalette } from './CommandPalette';
import { MobileTabBar } from './MobileTabBar';
import { ReceiptScanHost } from './ReceiptScanHost';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Authenticated app shell: sidebar + topbar on web; bottom tabs on iOS. */
export function AppLayout() {
	const mobile = isMobileApp();
	const location = useLocation();
	const lockHome = location.pathname === '/';
	const showMfaPrompt = useAuthStore((s) => s.user?.show_mfa_prompt);
	const [promptOpen, setPromptOpen] = useState(Boolean(showMfaPrompt));
	const [setupOpen, setSetupOpen] = useState(false);

	return (
		<div className="bg-bg flex h-full overflow-hidden">
			{!mobile && <Sidebar />}
			<div className="flex min-w-0 flex-1 flex-col">
				{!mobile && <Topbar />}
				<main
					className={cn(
						'flex min-h-0 flex-1 flex-col',
						lockHome ? 'overflow-hidden' : 'overflow-y-auto',
						mobile && !lockHome && 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]'
					)}
					id="main-content"
				>
					<div
						className={cn(
							'mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6 lg:px-8',
							lockHome
								? mobile
									? 'min-h-0 overflow-hidden pt-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))]'
									: 'min-h-0 overflow-hidden py-4'
								: 'py-6'
						)}
					>
						<Suspense fallback={<LoadingScreen />}>
							<Outlet />
						</Suspense>
					</div>
				</main>
			</div>
			{mobile && <MobileTabBar />}
			{mobile && <ReceiptScanHost />}
			<CommandPalette />
			<MfaPromptModal
				open={promptOpen && showMfaPrompt}
				onClose={() => {
					setPromptOpen(false);
					setSetupOpen(true);
				}}
			/>
			<MfaSetupModal open={setupOpen} onClose={() => setSetupOpen(false)} />
		</div>
	);
}
