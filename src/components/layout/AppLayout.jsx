import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { cn } from '../../lib/format';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { MfaPromptModal, MfaSetupModal } from '../auth/MfaModals';
import { MoneyCalculatorSheet } from '../finance/MoneyCalculatorSheet';
import { LoadingScreen } from '../ui';
import { useAuthStore } from '../../stores/authStore';
import { useCalculatorStore } from '../../stores/calculatorStore';
import { CommandPalette } from './CommandPalette';
import { MobileTabBar } from './MobileTabBar';
import { ReceiptScanHost } from './ReceiptScanHost';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

function isTypingInNonMoneyField(target) {
	if (!target || !(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return false;
	if (target.isContentEditable) return true;
	if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
	const type = (target.getAttribute('type') || 'text').toLowerCase();
	if (type === 'number') return false;
	return true;
}

/** Authenticated app shell: sidebar + topbar on wide web; bottom tabs on iOS / narrow. */
export function AppLayout() {
	const mobile = useMobileLayout();
	const location = useLocation();
	const lockHome = location.pathname === '/';
	const showMfaPrompt = useAuthStore((s) => s.user?.show_mfa_prompt);
	const [promptOpen, setPromptOpen] = useState(Boolean(showMfaPrompt));
	const [setupOpen, setSetupOpen] = useState(false);
	const openCalculator = useCalculatorStore((s) => s.openCalculator);
	const calcOpen = useCalculatorStore((s) => s.open);

	useEffect(() => {
		const onKey = (e) => {
			if (!(e.metaKey || e.ctrlKey)) return;
			// Ctrl/Cmd+= (and Ctrl/Cmd++ on some layouts)
			if (e.key !== '=' && e.key !== '+') return;
			if (calcOpen) return;
			if (isTypingInNonMoneyField(e.target)) return;
			e.preventDefault();
			openCalculator();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [openCalculator, calcOpen]);

	return (
		<div className="bg-bg flex h-full min-h-0 overflow-hidden">
			{!mobile && <Sidebar />}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{!mobile && <Topbar />}
				<main
					className={cn(
						'flex min-h-0 flex-1 flex-col',
						lockHome ? 'overflow-hidden' : 'overflow-y-auto overscroll-y-contain',
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
			<MoneyCalculatorSheet />
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
