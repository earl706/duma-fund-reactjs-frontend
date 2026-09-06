import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Menu, Search } from 'lucide-react';

import { usePurchaseNotifications } from '../../lib/purchases';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { toast } from '../../stores/toastStore';
import { Avatar, Button } from '../ui';
import { ThemeToggle } from './ThemeToggle';

const DISMISS_KEY = 'dumafund.purchaseNotifDismissed';
const SESSION_TOAST_KEY = 'dumafund.purchaseDueToast';

function readDismissed() {
	try {
		return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'));
	} catch {
		return new Set();
	}
}

function writeDismissed(ids) {
	try {
		localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids].slice(-80)));
	} catch {
		/* ignore */
	}
}

export function Topbar() {
	const navigate = useNavigate();
	const user = useAuthStore((s) => s.user);
	const { toggleSidebar, openPalette } = useUIStore();
	const [open, setOpen] = useState(false);
	const [dismissed, setDismissed] = useState(readDismissed);
	const panelRef = useRef(null);
	const toasted = useRef(false);

	const { data } = usePurchaseNotifications({
		enabled: Boolean(user)
	});
	const allNotes = data?.notifications || [];
	const notes = allNotes.filter((n) => !dismissed.has(n.id));
	const unread = notes.length;

	useEffect(() => {
		if (toasted.current) return;
		const dueCount = allNotes.filter((n) => n.kind === 'due_soon').length;
		if (dueCount <= 0) return;
		try {
			if (sessionStorage.getItem(SESSION_TOAST_KEY)) return;
			sessionStorage.setItem(SESSION_TOAST_KEY, '1');
		} catch {
			/* ignore */
		}
		toasted.current = true;
		toast.info(
			dueCount === 1
				? '1 regular buy may be due soon.'
				: `${dueCount} regular buys may be due soon.`
		);
	}, [allNotes]);

	useEffect(() => {
		if (!open) return;
		const onDoc = (e) => {
			if (panelRef.current && !panelRef.current.contains(e.target)) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [open]);

	const dismiss = (id) => {
		setDismissed((prev) => {
			const next = new Set(prev);
			next.add(id);
			writeDismissed(next);
			return next;
		});
	};

	return (
		<header className="border-line bg-surface/80 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 backdrop-blur">
			<Button
				variant="ghost"
				size="icon"
				className="lg:hidden"
				onClick={toggleSidebar}
				aria-label="Open navigation menu"
			>
				<Menu size={20} />
			</Button>

			<button
				onClick={openPalette}
				className="border-line bg-surface-2 text-muted hover:border-primary/40 flex h-10 flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors sm:max-w-xs"
			>
				<Search size={16} />
				<span>Search…</span>
				<kbd className="border-line ml-auto hidden rounded-sm border px-1.5 text-xs sm:inline">
					⌘K
				</kbd>
			</button>

			<div className="flex flex-1 items-center justify-end gap-1">
				<ThemeToggle />
				<div className="relative" ref={panelRef}>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setOpen((v) => !v)}
						aria-label="Purchase notifications"
						aria-expanded={open}
						className="relative"
						title="Regular buy alerts"
					>
						<Bell size={18} />
						{unread > 0 && (
							<span className="bg-danger absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
								{unread > 9 ? '9+' : unread}
							</span>
						)}
					</Button>
					{open && (
						<div className="border-line bg-surface absolute top-full right-0 z-50 mt-1 w-[min(100vw-2rem,22rem)] rounded-md border shadow-lg">
							<div className="border-line flex items-center justify-between border-b px-3 py-2">
								<span className="text-fg text-sm font-semibold">Regular buys</span>
								<Link
									to="/regular-buys"
									className="text-primary text-xs hover:underline"
									onClick={() => setOpen(false)}
								>
									Open page
								</Link>
							</div>
							{notes.length === 0 ? (
								<p className="text-muted px-3 py-4 text-sm">No alerts right now.</p>
							) : (
								<ul className="max-h-80 overflow-y-auto">
									{notes.map((n) => (
										<li key={n.id} className="border-line border-b px-3 py-2 last:border-b-0">
											<p className="text-fg text-sm">{n.message}</p>
											<div className="mt-1.5 flex gap-2">
												{n.transaction_id ? (
													<button
														type="button"
														className="text-primary text-xs hover:underline"
														onClick={() => {
															setOpen(false);
															navigate(`/transactions/${n.transaction_id}`);
														}}
													>
														View
													</button>
												) : null}
												<button
													type="button"
													className="text-muted text-xs hover:underline"
													onClick={() => dismiss(n.id)}
												>
													Dismiss
												</button>
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>
				<button
					onClick={() => navigate('/settings')}
					className="focus-visible:outline-primary ml-1 cursor-pointer rounded-full focus-visible:outline-2"
					aria-label="Account settings"
				>
					<Avatar name={user?.full_name || user?.email} src={user?.avatar_url} size={34} />
				</button>
			</div>
		</header>
	);
}
