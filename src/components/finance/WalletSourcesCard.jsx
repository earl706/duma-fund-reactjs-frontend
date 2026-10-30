import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';

import { BANK_PRESETS, EWALLET_PRESETS, kindLabel, unusedPresets } from '../../lib/balanceSources';
import { formatCost } from '../../lib/format';
import { sourcesApi, useFinanceBalance } from '../../lib/resources';
import { toast } from '../../stores/toastStore';
import { useIsProfileOwner, useProfileStore } from '../../stores/profileStore';
import { Button, Card, CardBody, CardHeader, Input, Select } from '../ui';

function errorDetail(err) {
	const data = err?.response?.data;
	if (!data) return null;
	if (typeof data.detail === 'string') return data.detail;
	if (typeof data.name === 'string') return data.name;
	if (Array.isArray(data.name)) return data.name[0];
	if (typeof data.kind === 'string') return data.kind;
	return null;
}

export function WalletSourcesCard() {
	const queryClient = useQueryClient();
	const isOwner = useIsProfileOwner();
	const profileName = useProfileStore((s) => s.activeProfile()?.name);
	const hydrate = useProfileStore((s) => s.hydrate);
	const { data: balance } = useFinanceBalance();
	const sources = balance?.sources || [];

	const [startingDrafts, setStartingDrafts] = useState({});
	const [adding, setAdding] = useState(false);
	const [customName, setCustomName] = useState('');
	const [customKind, setCustomKind] = useState('ewallet');
	const [customStart, setCustomStart] = useState('0.00');

	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ['finance-balance'] }),
			queryClient.invalidateQueries({ queryKey: ['finance-sources'] }),
			hydrate()
		]);
	};

	const createSource = sourcesApi.useCreate({
		onSuccess: async () => {
			toast.success('Source added.');
			setCustomName('');
			setCustomStart('0.00');
			await invalidate();
		},
		onError: (err) => toast.error(errorDetail(err) || 'Could not add source.')
	});
	const updateSource = sourcesApi.useUpdate({
		onSuccess: async () => {
			toast.success('Source updated.');
			await invalidate();
		},
		onError: (err) => toast.error(errorDetail(err) || 'Could not update source.')
	});
	const removeSource = sourcesApi.useRemove({
		onSuccess: async () => {
			toast.success('Source removed.');
			await invalidate();
		},
		onError: (err) => toast.error(errorDetail(err) || 'Could not delete source.')
	});

	const availableWallets = useMemo(() => unusedPresets(sources, EWALLET_PRESETS), [sources]);
	const availableBanks = useMemo(() => unusedPresets(sources, BANK_PRESETS), [sources]);

	const saveStarting = (src) => {
		if (!isOwner) return;
		const draft = startingDrafts[src.id];
		if (draft == null) return;
		if (String(draft) === String(src.starting_balance)) {
			setStartingDrafts((prev) => {
				const next = { ...prev };
				delete next[src.id];
				return next;
			});
			return;
		}
		updateSource.mutate(
			{ id: src.id, starting_balance: draft },
			{
				onSuccess: () => {
					setStartingDrafts((prev) => {
						const next = { ...prev };
						delete next[src.id];
						return next;
					});
				}
			}
		);
	};

	const addPreset = (name, kind) => {
		createSource.mutate({ name, kind, starting_balance: '0.00' });
	};

	const addCustom = () => {
		const name = customName.trim();
		if (!name) {
			toast.error('Name is required.');
			return;
		}
		createSource.mutate({
			name,
			kind: customKind,
			starting_balance: customStart || '0.00'
		});
	};

	const addControls = isOwner ? (
		adding ? (
			<Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
				Done
			</Button>
		) : (
			<Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
				<Plus size={16} /> Add bank or e-wallet
			</Button>
		)
	) : null;

	return (
		<Card>
			<CardHeader
				title="Wallet"
				subtitle={
					balance
						? `${profileName || 'Profile'} · current ${formatCost(balance.balance)}`
						: 'Balance sources for the active profile'
				}
				action={addControls}
			/>
			<CardBody className="space-y-4">
				{isOwner && adding && (
					<div className="border-line space-y-3 rounded-md border px-3 py-3">
						{availableWallets.length > 0 && (
							<div>
								<p className="text-fg mb-1.5 text-xs font-medium">E-wallets</p>
								<div className="flex flex-wrap gap-1.5">
									{availableWallets.map((name) => (
										<Button
											key={name}
											type="button"
											size="sm"
											variant="secondary"
											onClick={() => addPreset(name, 'ewallet')}
											disabled={createSource.isPending}
										>
											{name}
										</Button>
									))}
								</div>
							</div>
						)}
						{availableBanks.length > 0 && (
							<div>
								<p className="text-fg mb-1.5 text-xs font-medium">Banks</p>
								<div className="flex flex-wrap gap-1.5">
									{availableBanks.map((name) => (
										<Button
											key={name}
											type="button"
											size="sm"
											variant="secondary"
											onClick={() => addPreset(name, 'bank')}
											disabled={createSource.isPending}
										>
											{name}
										</Button>
									))}
								</div>
							</div>
						)}
						<div className="grid gap-2 sm:grid-cols-[1fr_8rem_7rem_auto]">
							<Input
								label="Custom name"
								name="wallet-source-name"
								autoComplete="off"
								value={customName}
								onChange={(e) => setCustomName(e.target.value)}
								placeholder="GCash, BPI…"
							/>
							<Select
								label="Kind"
								name="wallet-source-kind"
								autoComplete="off"
								value={customKind}
								onChange={(e) => setCustomKind(e.target.value)}
							>
								<option value="ewallet">E-wallet</option>
								<option value="bank">Bank</option>
							</Select>
							<Input
								label="Starting"
								type="number"
								step="0.01"
								name="wallet-source-starting"
								autoComplete="transaction-amount"
								value={customStart}
								onChange={(e) => setCustomStart(e.target.value)}
							/>
							<Button
								className="sm:mb-0.5 sm:self-end"
								onClick={addCustom}
								loading={createSource.isPending}
							>
								Add
							</Button>
						</div>
					</div>
				)}

				<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{sources.map((src) => {
						const startingValue =
							startingDrafts[src.id] != null ? startingDrafts[src.id] : src.starting_balance;
						const archived = src.status === 'archived';
						return (
							<li
								key={src.id}
								className={`border-line rounded-md border px-3 py-3 ${archived ? 'opacity-60' : ''}`}
							>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div className="min-w-0">
										<p className="text-fg text-sm font-medium">
											{src.name}
											{archived ? ' · archived' : ''}
										</p>
										<p className="text-muted text-xs">{kindLabel(src.kind)}</p>
									</div>
									<p className="text-fg text-sm font-semibold tabular-nums">
										{formatCost(src.balance)}
									</p>
								</div>
								<form
									className="mt-3 flex flex-wrap items-end gap-2"
									autoComplete="off"
									onSubmit={(e) => {
										e.preventDefault();
										saveStarting(src);
									}}
								>
									<div className="min-w-[8rem] flex-1">
										<Input
											label="Starting"
											type="number"
											step="0.01"
											name={`wallet-starting-${src.id}`}
											autoComplete="transaction-amount"
											value={startingValue}
											onChange={(e) =>
												isOwner &&
												setStartingDrafts((prev) => ({ ...prev, [src.id]: e.target.value }))
											}
											disabled={!isOwner}
										/>
									</div>
									{isOwner &&
										startingDrafts[src.id] != null &&
										String(startingDrafts[src.id]) !== String(src.starting_balance) && (
											<Button type="submit" size="sm" loading={updateSource.isPending}>
												Save
											</Button>
										)}
									{isOwner && !src.is_system && !archived && (
										<Button
											type="button"
											variant="secondary"
											size="sm"
											onClick={() => updateSource.mutate({ id: src.id, status: 'archived' })}
											disabled={updateSource.isPending}
										>
											Archive
										</Button>
									)}
									{isOwner && !src.is_system && (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="text-muted hover:text-danger"
											onClick={() => removeSource.mutate(src.id)}
											disabled={removeSource.isPending}
											aria-label={`Delete ${src.name}`}
										>
											<Trash2 size={16} />
										</Button>
									)}
								</form>
							</li>
						);
					})}
				</ul>

				{!isOwner && (
					<p className="text-muted text-xs">Only the profile owner can add or edit sources.</p>
				)}
			</CardBody>
		</Card>
	);
}
