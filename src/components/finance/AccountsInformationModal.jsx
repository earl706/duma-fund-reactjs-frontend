import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookUser, Copy, Pencil, Plus, QrCode, Trash2 } from 'lucide-react';

import { patch, post } from '../../lib/api';
import { mediaUrl } from '../../lib/receiptScan';
import { payeesApi } from '../../lib/resources';
import { useCanEditLedger } from '../../stores/profileStore';
import { toast } from '../../stores/toastStore';
import { Button, EmptyState, Input, LoadingScreen, Modal, Select, Textarea } from '../ui';

const CHANNELS = [
	{ value: 'ewallet', label: 'E-wallet' },
	{ value: 'bank', label: 'Bank' }
];

const EMPTY_FORM = {
	display_name: '',
	channel: 'ewallet',
	account_name: '',
	account_number: '',
	note: ''
};

function channelLabel(channel) {
	return CHANNELS.find((c) => c.value === channel)?.label || channel;
}

function errorDetail(err) {
	const data = err?.response?.data;
	if (!data) return null;
	if (typeof data.detail === 'string') return data.detail;
	if (typeof data.display_name === 'string') return data.display_name;
	if (Array.isArray(data.display_name)) return data.display_name[0];
	if (typeof data.channel === 'string') return data.channel;
	return null;
}

export function AccountsInformationModal({ open, onClose }) {
	const queryClient = useQueryClient();
	const canEdit = useCanEditLedger();
	const { data, isLoading } = payeesApi.useList({ page_size: 100 }, { enabled: open });
	const payees = data?.results || [];

	const [form, setForm] = useState(null);
	const [qrFile, setQrFile] = useState(null);
	const [clearQr, setClearQr] = useState(false);
	const [qrPreview, setQrPreview] = useState(null);
	const [formQrSrc, setFormQrSrc] = useState(null);

	useEffect(() => {
		if (!open) {
			setForm(null);
			setQrFile(null);
			setClearQr(false);
			setQrPreview(null);
		}
	}, [open]);

	useEffect(() => {
		if (qrFile) {
			const url = URL.createObjectURL(qrFile);
			setFormQrSrc(url);
			return () => URL.revokeObjectURL(url);
		}
		setFormQrSrc(!clearQr ? mediaUrl(form?.qr_image) : null);
		return undefined;
	}, [qrFile, clearQr, form?.qr_image]);

	const savePayee = useMutation({
		mutationFn: ({ id, body }) =>
			id == null ? post('/finance/payees/', body) : patch(`/finance/payees/${id}/`, body),
		onSuccess: async () => {
			toast.success(form?.id ? 'Contact updated.' : 'Contact added.');
			setForm(null);
			setQrFile(null);
			setClearQr(false);
			await queryClient.invalidateQueries({ queryKey: ['finance-payees'] });
		},
		onError: (err) => toast.error(errorDetail(err) || 'Could not save contact.')
	});

	const removePayee = payeesApi.useRemove({
		onSuccess: () => toast.success('Contact removed.')
	});

	const startCreate = () => {
		setForm({ ...EMPTY_FORM });
		setQrFile(null);
		setClearQr(false);
	};

	const startEdit = (row) => {
		setForm({
			id: row.id,
			display_name: row.display_name || '',
			channel: row.channel || 'ewallet',
			account_name: row.account_name || '',
			account_number: row.account_number || '',
			note: row.note || '',
			qr_image: row.qr_image
		});
		setQrFile(null);
		setClearQr(false);
	};

	const copyText = async (value, label = 'Copied') => {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			toast.success(`${label}.`);
		} catch {
			toast.error('Could not copy.');
		}
	};

	const submitForm = () => {
		const name = form?.display_name?.trim();
		if (!name) {
			toast.error('Name is required.');
			return;
		}
		const body = new FormData();
		body.append('display_name', name);
		body.append('channel', form.channel);
		body.append('account_name', (form.account_name || '').trim());
		body.append('account_number', (form.account_number || '').trim());
		body.append('note', (form.note || '').trim());
		if (qrFile) body.append('qr_image', qrFile);
		if (form.id && clearQr && !qrFile) body.append('clear_qr', 'true');
		savePayee.mutate({ id: form.id ?? null, body });
	};

	const qrSrc = (row) => mediaUrl(row?.qr_image);

	return (
		<>
			<Modal
				open={open}
				onClose={onClose}
				title="Accounts information"
				size="2xl"
				footer={
					form && canEdit ? (
						<>
							<Button
								variant="secondary"
								onClick={() => {
									setForm(null);
									setQrFile(null);
									setClearQr(false);
								}}
								disabled={savePayee.isPending}
							>
								Cancel
							</Button>
							<Button onClick={submitForm} loading={savePayee.isPending}>
								{form.id ? 'Save' : 'Add'}
							</Button>
						</>
					) : (
						<Button variant="secondary" onClick={onClose}>
							Close
						</Button>
					)
				}
			>
				<div className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="text-muted min-w-0 flex-1 text-sm">
							People and shops you send money to. Separate from your Wallet sources.
						</p>
						{canEdit && !form && (
							<Button variant="secondary" size="sm" className="shrink-0" onClick={startCreate}>
								<Plus size={16} /> Add Account
							</Button>
						)}
					</div>

					{form && canEdit && (
						<div className="border-line space-y-3 rounded-md border px-3 py-3">
							<div className="grid gap-2 sm:grid-cols-2">
								<Input
									label="Name"
									name="payee-display-name"
									autoComplete="off"
									value={form.display_name}
									onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
									placeholder="Ana, Sari-sari…"
								/>
								<Select
									label="Channel"
									name="payee-channel"
									autoComplete="off"
									value={form.channel}
									onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value }))}
								>
									{CHANNELS.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</Select>
								<Input
									label="Account name"
									name="payee-account-name"
									autoComplete="off"
									value={form.account_name}
									onChange={(e) => setForm((prev) => ({ ...prev, account_name: e.target.value }))}
								/>
								<Input
									label="Account number"
									name="payee-account-number"
									autoComplete="off"
									value={form.account_number}
									onChange={(e) => setForm((prev) => ({ ...prev, account_number: e.target.value }))}
								/>
							</div>
							<Textarea
								label="Note"
								name="payee-note"
								autoComplete="off"
								rows={2}
								value={form.note}
								onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
							/>
							<div className="space-y-2">
								<label className="text-fg block text-sm font-medium" htmlFor="payee-qr">
									QR code
								</label>
								{formQrSrc && (
									<button
										type="button"
										className="border-line block overflow-hidden rounded-md border"
										onClick={() => setQrPreview(formQrSrc)}
									>
										<img src={formQrSrc} alt="QR preview" className="h-28 w-28 object-cover" />
									</button>
								)}
								<input
									id="payee-qr"
									type="file"
									accept="image/*"
									className="text-muted text-sm"
									onChange={(e) => {
										const file = e.target.files?.[0] || null;
										setQrFile(file);
										if (file) setClearQr(false);
									}}
								/>
								{formQrSrc && (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => {
											setQrFile(null);
											setClearQr(true);
										}}
									>
										Remove QR
									</Button>
								)}
							</div>
						</div>
					)}

					{isLoading ? (
						<LoadingScreen />
					) : payees.length === 0 && !form ? (
						<EmptyState
							icon={BookUser}
							title="No payment contacts"
							description={
								canEdit
									? 'Add a bank or e-wallet so you can copy details or show a QR when sending money.'
									: 'No contacts have been added to this profile yet.'
							}
						/>
					) : (
						<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							{payees.map((row) => {
								const src = qrSrc(row);
								return (
									<li key={row.id} className="border-line relative rounded-md border py-3">
										{canEdit && (
											<div className="absolute top-2 right-2 z-10 flex gap-0.5">
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="text-muted hover:text-fg h-7 w-7"
													onClick={() => startEdit(row)}
													aria-label={`Edit ${row.display_name}`}
													title="Edit"
												>
													<Pencil size={14} />
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="text-muted hover:text-danger h-7 w-7"
													onClick={() => removePayee.mutate(row.id)}
													disabled={removePayee.isPending}
													aria-label={`Delete ${row.display_name}`}
													title="Delete"
												>
													<Trash2 size={14} />
												</Button>
											</div>
										)}
										<div
											className={`grid grid-cols-[auto_1fr] items-start gap-3 ${
												canEdit ? 'pr-14' : ''
											}`}
										>
											{src ? (
												<button
													type="button"
													className="shrink-0 overflow-hidden"
													onClick={() => setQrPreview(src)}
													aria-label={`Show QR for ${row.display_name}`}
												>
													<img
														src={src}
														alt=""
														className="h-36 w-36 object-contain sm:h-50 sm:w-50"
													/>
												</button>
											) : (
												<div className="border-line text-muted flex h-36 w-36 shrink-0 items-center justify-center rounded-md border sm:h-40 sm:w-40">
													<QrCode size={28} />
												</div>
											)}
											<div className="min-w-0">
												<div className="flex items-center gap-1.5">
													<p className="text-fg min-w-0 truncate text-sm font-medium">
														{row.display_name}
													</p>
													{src ? (
														<Button
															type="button"
															variant="ghost"
															size="icon"
															className="text-muted hover:text-fg h-7 w-7 shrink-0"
															onClick={() => setQrPreview(src)}
															aria-label={`Open QR for ${row.display_name}`}
															title="Open QR"
														>
															<QrCode size={14} />
														</Button>
													) : null}
												</div>
												<div className="mt-0.5 flex min-h-[1.25rem] items-center gap-1.5">
													<p className="text-muted min-w-0 truncate text-xs">
														{channelLabel(row.channel)}
														{row.account_name ? ` · ${row.account_name}` : ''}
													</p>
													{row.account_name ? (
														<Button
															type="button"
															variant="ghost"
															size="icon"
															className="text-muted hover:text-fg h-7 w-7 shrink-0"
															onClick={() => copyText(row.account_name, 'Account name copied')}
															aria-label={`Copy account name for ${row.display_name}`}
															title="Copy account name"
														>
															<Copy size={14} />
														</Button>
													) : null}
												</div>
												<div className="mt-1 flex min-h-[1.5rem] items-center gap-1.5">
													{row.account_number ? (
														<>
															<p className="text-fg min-w-0 truncate font-mono text-sm">
																{row.account_number}
															</p>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="text-muted hover:text-fg h-7 w-7 shrink-0"
																onClick={() =>
																	copyText(row.account_number, 'Account number copied')
																}
																aria-label={`Copy account number for ${row.display_name}`}
																title="Copy number"
															>
																<Copy size={14} />
															</Button>
														</>
													) : (
														<p className="text-muted text-xs">No account number</p>
													)}
												</div>
												{row.note ? <p className="text-muted mt-1 text-xs">{row.note}</p> : null}
											</div>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</Modal>

			<Modal open={Boolean(qrPreview)} onClose={() => setQrPreview(null)} title="QR code" size="sm">
				{qrPreview ? (
					<img
						src={qrPreview}
						alt="Payment QR"
						className="mx-auto max-h-[70vh] w-full object-contain"
					/>
				) : null}
			</Modal>
		</>
	);
}
