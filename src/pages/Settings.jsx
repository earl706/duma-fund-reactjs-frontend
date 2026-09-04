import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Settings as SettingsIcon, Shield } from 'lucide-react';

import { patch } from '../lib/api';
import { updateStartingBalance, useFinanceBalance } from '../lib/resources';
import { formatCost } from '../lib/format';
import { toast } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { MfaDisableSection, MfaSetupModal } from '../components/auth/MfaModals';
import { PageHeader } from '../components/layout/PageHeader';
import { Avatar, Button, Card, CardBody, CardHeader, Input } from '../components/ui';

export default function SettingsPage() {
	const queryClient = useQueryClient();
	const user = useAuthStore((s) => s.user);
	const logout = useAuthStore((s) => s.logout);
	const updateUser = useAuthStore((s) => s.updateUser);
	const { theme, setTheme } = useThemeStore();
	const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
	const [newEmail, setNewEmail] = useState('');
	const { data: balance } = useFinanceBalance();
	const [startingDraft, setStartingDraft] = useState(null);

	const startingValue =
		startingDraft != null ? startingDraft : (balance?.starting_balance ?? '0.00');

	const saveName = useMutation({
		mutationFn: (body) => patch('/auth/me/', body),
		onSuccess: (data) => {
			updateUser(data);
			toast.success('Profile updated.');
		},
		onError: () => toast.error('Could not update profile.')
	});

	const saveStarting = useMutation({
		mutationFn: (value) => updateStartingBalance(value),
		onSuccess: () => {
			toast.success('Starting balance updated.');
			setStartingDraft(null);
			queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
		},
		onError: () => toast.error('Could not update starting balance.')
	});

	const changeEmail = useMutation({
		mutationFn: (email) => useAuthStore.getState().changeEmail(email),
		onSuccess: (data) => {
			toast.success(data.detail || 'Confirmation sent to your new email.');
			setNewEmail('');
		},
		onError: (err) => {
			toast.error(err.response?.data?.detail || 'Could not change email.');
		}
	});

	if (!user) return null;

	return (
		<div>
			<PageHeader
				title="Settings"
				icon={SettingsIcon}
				description="Manage your account and preferences."
			/>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader title="Account" />
					<CardBody className="space-y-4">
						<div className="flex items-center gap-3">
							<Avatar name={user?.full_name || user?.email} src={user?.avatar_url} size={48} />
							<div>
								<p className="text-fg font-medium">{user?.full_name || 'Unnamed'}</p>
								<p className="text-muted text-sm">{user?.email}</p>
							</div>
						</div>
						<Input
							label="Full name"
							defaultValue={user?.full_name}
							onBlur={(e) =>
								e.target.value !== user?.full_name && saveName.mutate({ full_name: e.target.value })
							}
						/>
						<div className="space-y-2">
							<Input
								label="Email"
								type="email"
								value={newEmail}
								onChange={(e) => setNewEmail(e.target.value)}
								placeholder={user?.email}
							/>
							<Button
								type="button"
								variant="secondary"
								className="w-full"
								loading={changeEmail.isPending}
								disabled={!newEmail || newEmail.toLowerCase() === user?.email?.toLowerCase()}
								onClick={() => changeEmail.mutate(newEmail)}
							>
								Change email
							</Button>
							<p className="text-muted text-xs">
								We will send a confirmation link to the new address before it becomes active.
							</p>
						</div>
						<div>
							<span className="text-fg mb-1.5 block text-sm font-medium">Theme</span>
							<div className="flex gap-2">
								{['light', 'dark'].map((t) => (
									<button
										key={t}
										onClick={() => setTheme(t)}
										className={`flex-1 cursor-pointer rounded-md border px-4 py-2 text-sm capitalize ${
											theme === t ? 'border-primary text-primary' : 'border-line text-muted'
										}`}
									>
										{t}
									</button>
								))}
							</div>
						</div>
						<Button variant="danger" onClick={logout} className="w-full">
							<LogOut size={16} /> Sign out
						</Button>
					</CardBody>
				</Card>

				<div className="space-y-4">
					<Card>
						<CardHeader
							title="Wallet"
							subtitle={
								balance
									? `Current balance ${formatCost(balance.balance)}`
									: 'Starting balance for derived ledger total'
							}
						/>
						<CardBody className="space-y-3">
							<Input
								label="Starting balance"
								type="number"
								step="0.01"
								value={startingValue}
								onChange={(e) => setStartingDraft(e.target.value)}
								onBlur={() => {
									if (startingDraft == null) return;
									if (String(startingDraft) === String(balance?.starting_balance)) {
										setStartingDraft(null);
										return;
									}
									saveStarting.mutate(startingDraft);
								}}
							/>
							<p className="text-muted text-xs">
								Balance = starting + income − expense + transfers.
							</p>
						</CardBody>
					</Card>

					<Card>
						<CardHeader
							title="Two-factor authentication"
							subtitle="Protect your account with an authenticator app"
						/>
						<CardBody className="space-y-4">
							{user?.mfa_enabled ? (
								<MfaDisableSection />
							) : (
								<Button onClick={() => setMfaSetupOpen(true)}>
									<Shield size={16} /> Enable MFA
								</Button>
							)}
						</CardBody>
					</Card>
				</div>
			</div>
			<MfaSetupModal open={mfaSetupOpen} onClose={() => setMfaSetupOpen(false)} />
		</div>
	);
}
