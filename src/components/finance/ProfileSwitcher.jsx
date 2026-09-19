import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronsUpDown } from 'lucide-react';

import { cn } from '../../lib/format';
import { useProfileStore } from '../../stores/profileStore';

export function ProfileSwitcher({ className, compact = false }) {
	const queryClient = useQueryClient();
	const profiles = useProfileStore((s) => s.profiles);
	const activeProfileId = useProfileStore((s) => s.activeProfileId);
	const setActive = useProfileStore((s) => s.setActive);
	const [open, setOpen] = useState(false);

	const active = useMemo(
		() => profiles.find((p) => p.id === activeProfileId) || profiles[0],
		[profiles, activeProfileId]
	);
	const owned = profiles.filter((p) => p.is_owner);
	const shared = profiles.filter((p) => !p.is_owner);

	const switchTo = (id) => {
		if (id === activeProfileId) {
			setOpen(false);
			return;
		}
		setActive(id);
		queryClient.invalidateQueries();
		setOpen(false);
	};

	if (!active) return null;

	return (
		<div className={cn('relative', className)}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="border-line bg-surface-2 hover:bg-surface-2/80 flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left"
				aria-haspopup="listbox"
				aria-expanded={open}
			>
				<div className="min-w-0 flex-1">
					<p className="text-fg truncate text-sm font-medium">{active.name}</p>
					{!compact && (
						<p className="text-muted truncate text-xs capitalize">
							{active.is_owner ? 'Owned' : 'Shared'} · {active.role}
						</p>
					)}
				</div>
				<ChevronsUpDown size={16} className="text-muted shrink-0" />
			</button>
			{open && (
				<>
					<button
						type="button"
						className="fixed inset-0 z-40 cursor-default"
						aria-label="Close profile menu"
						onClick={() => setOpen(false)}
					/>
					<div
						className="border-line bg-surface absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border py-1 shadow-lg"
						role="listbox"
					>
						{owned.length > 0 && (
							<p className="text-muted px-3 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider uppercase">
								Your profiles
							</p>
						)}
						{owned.map((p) => (
							<button
								key={p.id}
								type="button"
								role="option"
								aria-selected={p.id === activeProfileId}
								onClick={() => switchTo(p.id)}
								className={cn(
									'flex w-full cursor-pointer px-3 py-1.5 text-left text-sm',
									p.id === activeProfileId ? 'bg-primary/10 text-fg' : 'text-fg hover:bg-surface-2'
								)}
							>
								{p.name}
							</button>
						))}
						{shared.length > 0 && (
							<p className="text-muted px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase">
								Shared with me
							</p>
						)}
						{shared.map((p) => (
							<button
								key={p.id}
								type="button"
								role="option"
								aria-selected={p.id === activeProfileId}
								onClick={() => switchTo(p.id)}
								className={cn(
									'flex w-full cursor-pointer px-3 py-1.5 text-left text-sm',
									p.id === activeProfileId ? 'bg-primary/10 text-fg' : 'text-fg hover:bg-surface-2'
								)}
							>
								<span className="min-w-0 truncate">{p.name}</span>
								<span className="text-muted ml-auto pl-2 text-xs capitalize">{p.role}</span>
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
}
