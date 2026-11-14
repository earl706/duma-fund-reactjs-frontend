import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronsUpDown } from 'lucide-react';

import { cn } from '../../lib/format';
import { Avatar } from '../ui/Avatar';
import { ListboxOption, ListboxShell } from '../ui/Listbox';
import { useProfileStore } from '../../stores/profileStore';

export function ProfileSwitcher({ className, compact = false, collapsed = false }) {
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

	const menuBody = (
		<>
			{owned.length > 0 && (
				<p className="text-muted px-3 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider uppercase">
					Your profiles
				</p>
			)}
			{owned.map((p) => (
				<ListboxOption
					key={p.id}
					selected={p.id === activeProfileId}
					onClick={() => switchTo(p.id)}
				>
					{p.name}
				</ListboxOption>
			))}
			{shared.length > 0 && (
				<p className="text-muted px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase">
					Shared with me
				</p>
			)}
			{shared.map((p) => (
				<ListboxOption
					key={p.id}
					selected={p.id === activeProfileId}
					onClick={() => switchTo(p.id)}
				>
					<span className="min-w-0 truncate">{p.name}</span>
					<span className="text-muted ml-auto pl-2 text-xs capitalize">{p.role}</span>
				</ListboxOption>
			))}
		</>
	);

	if (collapsed) {
		return (
			<ListboxShell
				className={className}
				open={open}
				onOpenChange={setOpen}
				placement="right"
				matchTriggerWidth={false}
				menuWidth={224}
				maxHeight={288}
				closeLabel="Close profile menu"
				zIndexBackdrop={40}
				zIndexMenu={50}
				menu={menuBody}
			>
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					className={cn(
						'hover:bg-surface-2 flex size-10 cursor-pointer items-center justify-center rounded-lg',
						'focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2'
					)}
					aria-haspopup="listbox"
					aria-expanded={open}
					aria-label={`Profile: ${active.name}`}
					title={active.name}
				>
					<Avatar name={active.name} size={32} />
				</button>
			</ListboxShell>
		);
	}

	return (
		<ListboxShell
			className={className}
			open={open}
			onOpenChange={setOpen}
			matchTriggerWidth
			maxHeight={288}
			closeLabel="Close profile menu"
			zIndexBackdrop={40}
			zIndexMenu={50}
			menu={menuBody}
		>
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
		</ListboxShell>
	);
}
