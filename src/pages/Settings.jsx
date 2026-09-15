import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Search, Settings as SettingsIcon, Shield } from 'lucide-react';

import { patch } from '../lib/api';
import { isMobileApp } from '../lib/desktop';
import { updateStartingBalance, useFinanceBalance } from '../lib/resources';
import { formatCost } from '../lib/format';
import { toast } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { LLM_PROVIDERS, useLlmStore } from '../stores/llmStore';
import { useThemeStore } from '../stores/themeStore';
import { useUIStore } from '../stores/uiStore';
import { MfaDisableSection, MfaSetupModal } from '../components/auth/MfaModals';
import { PageHeader } from '../components/layout/PageHeader';
import { PurchaseAlertList } from '../components/layout/PurchaseNotifications';
import { Avatar, Button, Card, CardBody, CardHeader, Input } from '../components/ui';

const PROVIDER_LABELS = {
	openai: 'OpenAI',
	gemini: 'Gemini'
};

export default function SettingsPage() {
	const queryClient = useQueryClient();
	const user = useAuthStore((s) => s.user);
	const logout = useAuthStore((s) => s.logout);
	const updateUser = useAuthStore((s) => s.updateUser);
	const { theme, setTheme } = useThemeStore();
	const openPalette = useUIStore((s) => s.openPalette);
	const mobile = isMobileApp();
	const {
		provider,
		openaiApiKey,
		openaiModel,
		geminiApiKey,
		geminiModel,
		setProvider,
		setOpenAI,
		setGemini,
		clearKeys
	} = useLlmStore();
	const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
	const [newEmail, setNewEmail] = useState('');
	const { data: balance } = useFinanceBalance();
	const [startingDraft, setStartingDraft] = useState(null);
	const [openaiKeyDraft, setOpenaiKeyDraft] = useState(null);
	const [openaiModelDraft, setOpenaiModelDraft] = useState(null);
	const [geminiKeyDraft, setGeminiKeyDraft] = useState(null);
	const [geminiModelDraft, setGeminiModelDraft] = useState(null);

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
				{mobile && (
					<Card>
						<CardHeader
							title="Shortcuts"
							subtitle="Search and alerts used to live in the top bar"
						/>
						<CardBody className="space-y-4">
							<Button variant="secondary" className="w-full" onClick={openPalette}>
								<Search size={16} /> Search transactions
							</Button>
							<PurchaseAlertList />
						</CardBody>
					</Card>
				)}
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

					<Card>
						<CardHeader title="Receipt AI" subtitle="Used for receipt scan when a key is saved" />
						<CardBody className="space-y-4">
							<div>
								<span className="text-fg mb-1.5 block text-sm font-medium">Provider</span>
								<div className="flex gap-2">
									{LLM_PROVIDERS.map((p) => (
										<button
											key={p}
											type="button"
											onClick={() => setProvider(p)}
											className={`flex-1 cursor-pointer rounded-md border px-4 py-2 text-sm ${
												provider === p ? 'border-primary text-primary' : 'border-line text-muted'
											}`}
										>
											{PROVIDER_LABELS[p]}
										</button>
									))}
								</div>
							</div>

							{provider === 'openai' ? (
								<>
									<Input
										label="OpenAI API key"
										type="password"
										autoComplete="off"
										value={openaiKeyDraft != null ? openaiKeyDraft : openaiApiKey}
										onChange={(e) => setOpenaiKeyDraft(e.target.value)}
										onBlur={() => {
											if (openaiKeyDraft == null) return;
											if (openaiKeyDraft === openaiApiKey) {
												setOpenaiKeyDraft(null);
												return;
											}
											setOpenAI({ apiKey: openaiKeyDraft });
											setOpenaiKeyDraft(null);
										}}
										placeholder="sk-…"
									/>
									<Input
										label="OpenAI model"
										value={openaiModelDraft != null ? openaiModelDraft : openaiModel}
										onChange={(e) => setOpenaiModelDraft(e.target.value)}
										onBlur={() => {
											if (openaiModelDraft == null) return;
											if (openaiModelDraft.trim() === openaiModel) {
												setOpenaiModelDraft(null);
												return;
											}
											setOpenAI({ model: openaiModelDraft });
											setOpenaiModelDraft(null);
										}}
										placeholder="gpt-4o-mini"
									/>
								</>
							) : (
								<>
									<Input
										label="Gemini API key"
										type="password"
										autoComplete="off"
										value={geminiKeyDraft != null ? geminiKeyDraft : geminiApiKey}
										onChange={(e) => setGeminiKeyDraft(e.target.value)}
										onBlur={() => {
											if (geminiKeyDraft == null) return;
											if (geminiKeyDraft === geminiApiKey) {
												setGeminiKeyDraft(null);
												return;
											}
											setGemini({ apiKey: geminiKeyDraft });
											setGeminiKeyDraft(null);
										}}
										placeholder="AIza…"
									/>
									<Input
										label="Gemini model"
										value={geminiModelDraft != null ? geminiModelDraft : geminiModel}
										onChange={(e) => setGeminiModelDraft(e.target.value)}
										onBlur={() => {
											if (geminiModelDraft == null) return;
											if (geminiModelDraft.trim() === geminiModel) {
												setGeminiModelDraft(null);
												return;
											}
											setGemini({ model: geminiModelDraft });
											setGeminiModelDraft(null);
										}}
										placeholder="gemini-3.5-flash"
									/>
								</>
							)}

							<p className="text-muted text-xs">
								Stored in this browser and sent with receipt scans (over HTTPS). When set for the
								selected provider, these override the server env keys.
							</p>
							<Button
								type="button"
								variant="secondary"
								className="w-full"
								disabled={!openaiApiKey && !geminiApiKey}
								onClick={() => {
									clearKeys();
									setOpenaiKeyDraft(null);
									setGeminiKeyDraft(null);
									toast.success('Saved API keys cleared.');
								}}
							>
								Clear saved keys
							</Button>
						</CardBody>
					</Card>
				</div>
			</div>
			<MfaSetupModal open={mfaSetupOpen} onClose={() => setMfaSetupOpen(false)} />
		</div>
	);
}
