import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { formatCost, formatDateShort, parseDateShort } from '../../lib/format';
import { post } from '../../lib/api';
import { toast } from '../../stores/toastStore';
import { Button, Input, Modal, Select } from '../ui';
import { MoneyField } from './MoneyField';

function todayShort() {
	return formatDateShort(new Date());
}

function activeSources(sources = []) {
	return sources.filter((s) => s.status !== 'archived');
}

/**
 * Create a one-row internal wallet move (from → to + optional fee).
 */
export function MoveMoneyModal({ open, onClose, sources = [], defaultFromId }) {
	const queryClient = useQueryClient();
	const options = useMemo(() => activeSources(sources), [sources]);

	const [fromId, setFromId] = useState('');
	const [toId, setToId] = useState('');
	const [amount, setAmount] = useState('');
	const [fee, setFee] = useState('0.00');
	const [dateEffective, setDateEffective] = useState(todayShort);
	const [note, setNote] = useState('');
	const [error, setError] = useState('');

	useEffect(() => {
		if (!open) return;
		const cash = options.find((s) => s.kind === 'cash');
		const preferred =
			(defaultFromId != null && options.find((s) => String(s.id) === String(defaultFromId))) ||
			cash ||
			options[0];
		const from = preferred ? String(preferred.id) : '';
		const toOpt = options.find((s) => String(s.id) !== from);
		setFromId(from);
		setToId(toOpt ? String(toOpt.id) : '');
		setAmount('');
		setFee('0.00');
		setDateEffective(todayShort());
		setNote('');
		setError('');
	}, [open, options, defaultFromId]);

	const fromSrc = options.find((s) => String(s.id) === String(fromId));
	const toSrc = options.find((s) => String(s.id) === String(toId));
	const principal = Number(amount || 0);
	const feeNum = Number(fee || 0);
	const debit = principal + feeNum;

	const toOptions = options.filter((s) => String(s.id) !== String(fromId));

	const mutate = useMutation({
		mutationFn: (body) => post('/finance/transfers/', body),
		onSuccess: async (_data, vars) => {
			toast.success(`Moved ${formatCost(vars.amount)} to ${toSrc?.name || 'destination'}.`);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['finance-balance'] }),
				queryClient.invalidateQueries({ queryKey: ['finance-transactions'] }),
				queryClient.invalidateQueries({ queryKey: ['finance-analytics'] }),
				queryClient.invalidateQueries({ queryKey: ['finance-analytics-breakdown'] })
			]);
			onClose?.();
		},
		onError: (err) => {
			const data = err?.response?.data;
			const detail =
				(typeof data?.detail === 'string' && data.detail) ||
				(typeof data?.to_source === 'string' && data.to_source) ||
				(Array.isArray(data?.to_source) && data.to_source[0]) ||
				(typeof data?.from_source === 'string' && data.from_source) ||
				(typeof data?.amount === 'string' && data.amount) ||
				'Could not move money.';
			setError(detail);
			toast.error(detail);
		}
	});

	const submit = () => {
		setError('');
		if (!fromId || !toId) {
			setError('Choose From and To sources.');
			return;
		}
		if (!amount || Number.isNaN(principal) || principal <= 0) {
			setError('Enter an amount greater than zero.');
			return;
		}
		if (Number.isNaN(feeNum) || feeNum < 0) {
			setError('Fee must be zero or positive.');
			return;
		}
		const iso = parseDateShort(dateEffective);
		if (!iso) {
			setError('Use date format DD/MM/YY.');
			return;
		}
		mutate.mutate({
			from_source: Number(fromId),
			to_source: Number(toId),
			amount: String(amount),
			fee: fee === '' ? '0.00' : String(fee),
			date_effective: iso,
			note: note.trim()
		});
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Move money"
			size="md"
			footer={
				<>
					<Button variant="secondary" onClick={onClose} disabled={mutate.isPending}>
						Cancel
					</Button>
					<Button onClick={submit} loading={mutate.isPending} disabled={options.length < 2}>
						Move
					</Button>
				</>
			}
		>
			{options.length < 2 ? (
				<p className="text-muted text-sm">
					Add another bank or e-wallet in Wallet before moving money between sources.
				</p>
			) : (
				<div className="space-y-4">
					<Select
						label="From"
						value={fromId}
						onChange={(e) => {
							const next = e.target.value;
							setFromId(next);
							if (String(toId) === next) {
								const alt = options.find((s) => String(s.id) !== next);
								setToId(alt ? String(alt.id) : '');
							}
						}}
					>
						{options.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</Select>

					<Select label="To" value={toId} onChange={(e) => setToId(e.target.value)}>
						{toOptions.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</Select>

					<MoneyField
						id="move-money-amount"
						label="Amount"
						step="0.01"
						min="0"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0.00"
					/>

					<MoneyField
						id="move-money-fee"
						label="Fee"
						step="0.01"
						min="0"
						value={fee}
						onChange={(e) => setFee(e.target.value)}
					/>

					<Input
						label="Effective (DD/MM/YY)"
						value={dateEffective}
						onChange={(e) => setDateEffective(e.target.value)}
						placeholder="DD/MM/YY"
					/>

					<Input
						label="Note"
						value={note}
						onChange={(e) => setNote(e.target.value)}
						placeholder="Optional"
					/>

					<p className="text-muted text-xs leading-relaxed">
						{fromSrc?.name || 'From'} −{formatCost(debit)} · {toSrc?.name || 'To'} +
						{formatCost(principal)} · Profile −{formatCost(feeNum)}
					</p>

					{error && (
						<p className="bg-danger/10 text-danger rounded-md px-3 py-2 text-sm">{error}</p>
					)}
				</div>
			)}
		</Modal>
	);
}
