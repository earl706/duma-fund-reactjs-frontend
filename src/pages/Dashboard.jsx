import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';

import { isMobileApp } from '../lib/desktop';
import { useAuthStore } from '../stores/authStore';
import { useCanEditLedger } from '../stores/profileStore';
import {
	categoriesApi,
	transactionsApi,
	useFinanceAnalytics,
	useFinanceBalance,
	useFinanceBreakdown
} from '../lib/resources';
import { ReceiptImportModal } from '../components/finance/ReceiptImportModal';
import { DashboardHome } from '../components/finance/DashboardHome';

function greeting() {
	const hour = new Date().getHours();
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}

function formatRangeLabel(start, end) {
	if (!start || !end) return 'This period';
	const s = typeof start === 'string' ? parseISO(start) : start;
	const e = typeof end === 'string' ? parseISO(end) : end;
	if (format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd')) {
		return format(s, 'MMM d, yyyy');
	}
	return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
}

function chartWindow(period, start, end) {
	if (!start || !end) return null;
	return {
		grain: Number(period) === 120 ? 'week' : 'day',
		start,
		end,
		include_archived: '0'
	};
}

function flowTotals(totals) {
	const income = Number(totals?.income || 0);
	const expense = Number(totals?.expense || 0);
	const transferIn = Number(totals?.transfer_in || 0);
	const transferOut = Number(totals?.transfer_out || 0);
	const moneyIn = income + transferIn;
	const moneyOut = expense + transferOut;
	return { moneyIn, moneyOut, net: moneyIn - moneyOut };
}

function rowMatchesChip(row, chipId) {
	if (chipId == null) return true;
	const ids = row.categories?.length ? row.categories : row.category != null ? [row.category] : [];
	return ids.map(Number).includes(Number(chipId));
}

export default function DashboardPage() {
	const queryClient = useQueryClient();
	const user = useAuthStore((s) => s.user);
	const mobile = isMobileApp();
	const canEdit = useCanEditLedger();
	const name = user?.full_name?.split(' ')[0] || 'there';
	const [period, setPeriod] = useState('28');
	const [selectedChip, setSelectedChip] = useState(null);
	const [scanOpen, setScanOpen] = useState(false);

	const { data: balance } = useFinanceBalance();
	const { data: categoriesData } = categoriesApi.useList({ page_size: 100, kind: 'expense' });
	const { data: incomeCatsData } = categoriesApi.useList({ page_size: 100, kind: 'income' });
	const expenseCategories = categoriesData?.results || [];
	const incomeCategories = incomeCatsData?.results || [];

	const {
		data,
		isLoading: breakdownLoading,
		isError: breakdownError
	} = useFinanceBreakdown({
		period,
		include_archived: '0'
	});

	const analyticsParams = useMemo(
		() => chartWindow(period, data?.start, data?.end),
		[period, data?.start, data?.end]
	);

	const { data: series, isLoading: chartLoading } = useFinanceAnalytics(analyticsParams || {}, {
		enabled: analyticsParams != null
	});

	const { data: txnPage, isLoading: recentLoading } = transactionsApi.useList({
		ordering: '-date_effective',
		status: 'active',
		page_size: 50
	});

	const chips = useMemo(
		() => (data?.categories || []).filter((row) => row.id != null && Number(row.amount) > 0),
		[data]
	);

	const recent = useMemo(() => {
		const rows = txnPage?.results || [];
		return rows.filter((row) => rowMatchesChip(row, selectedChip)).slice(0, 5);
	}, [txnPage, selectedChip]);

	const barRows = useMemo(() => {
		const merged = [];
		const byName = new Map();
		for (const row of data?.categories || []) {
			const amount = Number(row.amount || 0);
			if (amount <= 0) continue;
			const name = row.name || 'Uncategorized';
			const key = name.toLowerCase();
			const existing = byName.get(key);
			if (existing) {
				existing.amount += amount;
			} else {
				const next = { id: row.id, name, amount };
				byName.set(key, next);
				merged.push(next);
			}
		}
		const denom = merged.reduce((sum, row) => sum + row.amount, 0);
		if (denom <= 0) return [];
		return merged.map((row) => ({
			...row,
			percent: Math.round((row.amount / denom) * 100)
		}));
	}, [data]);

	const chartPoints = useMemo(() => {
		const points = series?.points || [];
		const weekly = Number(period) === 120;
		const compact = points.length <= 7;
		return points.map((row) => {
			const d = parseISO(row.period);
			return {
				label: weekly || !compact ? format(d, 'MMM d') : format(d, 'EEE'),
				moneyIn: Number(row.money_in || 0),
				moneyOut: Number(row.money_out || 0)
			};
		});
	}, [series, period]);

	const { net } = flowTotals(data?.totals);

	const onPeriod = (next) => {
		setPeriod(next);
		setSelectedChip(null);
	};

	return (
		<>
			<div className="flex min-h-0 flex-1 flex-col">
				<DashboardHome
					pager={mobile}
					greeting={greeting()}
					name={name}
					balance={balance}
					period={period}
					onPeriod={onPeriod}
					rangeLabel={formatRangeLabel(data?.start, data?.end)}
					income={data?.totals?.income ?? '0'}
					expense={data?.totals?.expense ?? data?.balance_composition?.spent ?? '0'}
					net={net}
					chips={chips}
					selectedChip={selectedChip}
					onChip={setSelectedChip}
					recent={recent}
					recentLoading={recentLoading}
					chartPoints={chartPoints}
					chartLoading={chartLoading}
					barRows={barRows}
					breakdownLoading={breakdownLoading}
					breakdownError={breakdownError}
					showScan={!mobile && canEdit}
					onScan={() => setScanOpen(true)}
				/>
			</div>

			{!mobile && (
				<ReceiptImportModal
					open={scanOpen}
					onClose={() => setScanOpen(false)}
					categories={expenseCategories}
					incomeCategories={incomeCategories}
					onCommitted={() => {
						queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
						queryClient.invalidateQueries({ queryKey: ['finance-balance'] });
						queryClient.invalidateQueries({ queryKey: ['finance-analytics'] });
						queryClient.invalidateQueries({ queryKey: ['finance-analytics-breakdown'] });
						queryClient.invalidateQueries({ queryKey: ['finance-purchase-insights'] });
						queryClient.invalidateQueries({ queryKey: ['finance-purchase-notifications'] });
						queryClient.invalidateQueries({ queryKey: ['finance-purchase-lookup'] });
					}}
				/>
			)}
		</>
	);
}
