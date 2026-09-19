import { useMemo, useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
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
	if (period === 'day') {
		return {
			grain: 'day',
			start: format(subDays(parseISO(end), 6), 'yyyy-MM-dd'),
			end,
			include_archived: '0'
		};
	}
	return { grain: 'day', start, end, include_archived: '0' };
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
	const [period, setPeriod] = useState('week');
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
		const cats = data?.categories || [];
		const denom = cats.reduce((sum, row) => sum + Number(row.amount || 0), 0);
		if (denom <= 0) return [];
		return cats
			.map((row) => ({
				id: row.id,
				name: row.name,
				amount: Number(row.amount || 0),
				percent: Math.round((Number(row.amount || 0) / denom) * 100)
			}))
			.filter((row) => row.amount > 0);
	}, [data]);

	const chartPoints = useMemo(() => {
		const points = series?.points || [];
		const month = period === 'month';
		return points.map((row) => {
			const d = parseISO(row.period);
			return {
				label: month ? format(d, 'd') : format(d, 'EEE'),
				spend: Number(row.txn_spend || 0)
			};
		});
	}, [series, period]);

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
