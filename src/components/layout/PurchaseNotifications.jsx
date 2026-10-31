import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';

import { usePurchaseNotifications } from '../../lib/purchases';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../../stores/toastStore';
import { Button } from '../ui';
import { TopbarPopover } from './TopbarPopover';

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

function useDismissedNotes() {
	const user = useAuthStore((s) => s.user);
	const [dismissed, setDismissed] = useState(readDismissed);
	const toasted = useRef(false);
	const { data } = usePurchaseNotifications({ enabled: Boolean(user) });
	const allNotes = data?.notifications || [];
	const notes = allNotes.filter((n) => !dismissed.has(n.id));

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

	const dismiss = (id) => {
		setDismissed((prev) => {
			const next = new Set(prev);
			next.add(id);
			writeDismissed(next);
			return next;
		});
	};

	return { notes, unread: notes.length, dismiss };
}

function NoteList({ notes, dismiss, onNavigate, emptyClassName }) {
	const navigate = useNavigate();
	if (notes.length === 0) {
		return <p className={emptyClassName || 'text-muted px-3 py-4 text-sm'}>No alerts right now.</p>;
	}
	return (
		<ul>
			{notes.map((n) => (
				<li key={n.id} className="border-line border-b px-3 py-2 last:border-b-0">
					<p className="text-fg text-sm">{n.message}</p>
					<div className="mt-1.5 flex gap-2">
						{n.transaction_id ? (
							<button
								type="button"
								className="text-primary text-xs hover:underline"
								onClick={() => {
									onNavigate?.();
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
	);
}

/** Bell dropdown for the desktop topbar. */
export function PurchaseBell() {
	const [open, setOpen] = useState(false);
	const { notes, unread, dismiss } = useDismissedNotes();

	return (
		<div className="relative">
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
			<TopbarPopover
				open={open}
				onClose={() => setOpen(false)}
				closeLabel="Close purchase notifications"
			>
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
				<NoteList notes={notes} dismiss={dismiss} onNavigate={() => setOpen(false)} />
			</TopbarPopover>
		</div>
	);
}

/** Inline list for the iOS Profile (Settings) screen. */
export function PurchaseAlertList() {
	const { notes, unread, dismiss } = useDismissedNotes();
	return (
		<div>
			<div className="mb-2 flex items-center justify-between">
				<span className="text-fg text-sm font-medium">
					Regular buy alerts{unread > 0 ? ` (${unread})` : ''}
				</span>
				<Link to="/regular-buys" className="text-primary text-xs hover:underline">
					Open page
				</Link>
			</div>
			<div className="border-line max-h-80 overflow-y-auto rounded-md border">
				<NoteList notes={notes} dismiss={dismiss} emptyClassName="text-muted px-3 py-3 text-sm" />
			</div>
		</div>
	);
}
