import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';

import { useProfileStore } from '../../stores/profileStore';
import { toast } from '../../stores/toastStore';
import { Button } from '../ui';

export function InviteBell() {
	const pendingInvites = useProfileStore((s) => s.pendingInvites);
	const [open, setOpen] = useState(false);
	const count = pendingInvites.length;

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="text-muted hover:text-fg relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-md"
				aria-label="Profile invites"
			>
				<Mail size={18} />
				{count > 0 && (
					<span className="bg-primary text-primary-fg absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
						{count}
					</span>
				)}
			</button>
			{open && (
				<>
					<button
						type="button"
						className="fixed inset-0 z-40 cursor-default"
						aria-label="Close invites"
						onClick={() => setOpen(false)}
					/>
					<div className="border-line bg-surface absolute top-10 right-0 z-50 w-80 rounded-md border p-3 shadow-lg">
						<p className="text-fg mb-2 text-sm font-semibold">Profile invites</p>
						<InviteList onDone={() => setOpen(false)} />
					</div>
				</>
			)}
		</div>
	);
}

export function InviteList({ onDone }) {
	const queryClient = useQueryClient();
	const pendingInvites = useProfileStore((s) => s.pendingInvites);
	const acceptInvite = useProfileStore((s) => s.acceptInvite);
	const declineInvite = useProfileStore((s) => s.declineInvite);
	const [busyId, setBusyId] = useState(null);

	if (!pendingInvites.length) {
		return <p className="text-muted text-sm">No pending invites.</p>;
	}

	return (
		<ul className="space-y-3">
			{pendingInvites.map((inv) => (
				<li key={inv.id} className="border-line rounded-md border p-2">
					<p className="text-fg text-sm font-medium">{inv.profile?.name}</p>
					<p className="text-muted mb-2 text-xs">
						{inv.invited_by?.full_name || inv.invited_by?.email} invited you as {inv.role}
					</p>
					<div className="flex gap-2">
						<Button
							size="sm"
							loading={busyId === `a-${inv.id}`}
							onClick={async () => {
								setBusyId(`a-${inv.id}`);
								try {
									await acceptInvite(inv.id);
									queryClient.invalidateQueries();
									toast.success(`Joined ${inv.profile?.name}.`);
									onDone?.();
								} catch {
									toast.error('Could not accept invite.');
								} finally {
									setBusyId(null);
								}
							}}
						>
							Accept
						</Button>
						<Button
							size="sm"
							variant="secondary"
							loading={busyId === `d-${inv.id}`}
							onClick={async () => {
								setBusyId(`d-${inv.id}`);
								try {
									await declineInvite(inv.id);
									toast.success('Invite declined.');
								} catch {
									toast.error('Could not decline invite.');
								} finally {
									setBusyId(null);
								}
							}}
						>
							Decline
						</Button>
					</div>
				</li>
			))}
		</ul>
	);
}
