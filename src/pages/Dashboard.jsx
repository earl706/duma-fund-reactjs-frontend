import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, ScanLine } from 'lucide-react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../stores/authStore';
import { categoriesApi, useFinanceBalance, useFinanceBreakdown } from '../lib/resources';
import { usePurchaseInsights } from '../lib/purchases';
import { formatCost } from '../lib/format';
import { ReceiptImportModal } from '../components/finance/ReceiptImportModal';
import { PageHeader } from '../components/layout/PageHeader';
import {
	Button,
	Card,
	CardBody,
	CardHeader,
	EmptyState,
	LoadingScreen,
	StatCard
} from '../components/ui';

const PERIODS = [
	{ value: 'day', label: 'This day' },
	{ value: 'week', label: 'This week' },
	{ value: 'month', label: 'This month' }
];

const CATEGORY_COLORS = [
	'var(--primary)',
	'var(--accent)',
	'#5b8a72',
	'#c4a35a',
	'#7a6bb5',
	'#8a8f98'
];

const BALANCE_COLORS = {
	starting_balance: 'var(--primary)',
	spent: 'var(--accent)'
};

function formatRangeLabel(start, end) {
	if (!start || !end) return '';
	const s = typeof start === 'string' ? parseISO(start) : start;
	const e = typeof end === 'string' ? parseISO(end) : end;
	if (format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd')) {
		return format(s, 'MMM d, yyyy');
	}
	return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
}

function greeting() {
	const hour = new Date().getHours();
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}

function CompactPie({ title, data, colors, emptyLabel }) {
	const total = data.reduce((sum, row) => sum + Number(row.value || 0), 0);
	if (!data.length || total <= 0) {
		return (
			<div className="flex min-h-[220px] flex-col">
				<h3 className="text-fg mb-2 text-sm font-semibold">{title}</h3>
				<p className="text-muted flex flex-1 items-center justify-center text-sm">{emptyLabel}</p>
			</div>
		);
	}

	return (
		<div className="flex min-h-[220px] flex-col">
			<h3 className="text-fg mb-1 text-sm font-semibold">{title}</h3>
			<p className="text-muted mb-2 text-xs">Total {formatCost(total)}</p>
			<div className="h-[200px] w-full">
				<ResponsiveContainer width="100%" height="100%">
					<PieChart>
						<Pie
							data={data}
							dataKey="value"
							nameKey="name"
							cx="50%"
							cy="42%"
							innerRadius={42}
							outerRadius={68}
							paddingAngle={1}
							stroke="var(--surface)"
							strokeWidth={1}
						>
							{data.map((entry, index) => (
								<Cell
									key={entry.name}
									fill={
										typeof colors === 'function'
											? colors(entry, index)
											: colors[index % colors.length]
									}
								/>
							))}
						</Pie>
						<Tooltip
							contentStyle={{
								background: 'var(--surface)',
								border: '1px solid var(--line)',
								borderRadius: 8,
								color: 'var(--fg)',
								fontSize: 12
							}}
							formatter={(value, name) => [formatCost(value), name]}
						/>
						<Legend
							verticalAlign="bottom"
							align="center"
							iconType="circle"
							iconSize={8}
							wrapperStyle={{ fontSize: 11, color: 'var(--muted)', paddingTop: 4 }}
							formatter={(value) => <span className="text-muted text-[11px]">{value}</span>}
						/>
					</PieChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}

export default function DashboardPage() {
	const queryClient = useQueryClient();
	const user = useAuthStore((s) => s.user);
	const name = user?.full_name?.split(' ')[0] || 'there';
	const [period, setPeriod] = useState('week');
	const [includeArchived, setIncludeArchived] = useState(false);
	const [scanOpen, setScanOpen] = useState(false);

	const { data: balance } = useFinanceBalance();
	const { data: categoriesData } = categoriesApi.useList({ page_size: 100, kind: 'expense' });
	const { data: incomeCatsData } = categoriesApi.useList({ page_size: 100, kind: 'income' });
	const expenseCategories = categoriesData?.results || [];
	const incomeCategories = incomeCatsData?.results || [];

	const { data, isLoading, isError } = useFinanceBreakdown({
		period,
		include_archived: includeArchived ? '1' : '0'
	});

	const { data: purchaseInsights } = usePurchaseInsights();

	const dashboardPurchaseRows = useMemo(() => {
		if (!purchaseInsights) return [];
		const due = (purchaseInsights.due_soon || []).slice(0, 2).map((row) => ({
			...row,
			_kind: 'due'
		}));
		const lapsed = (purchaseInsights.lapsed || []).slice(0, 2).map((row) => ({
			...row,
			_kind: 'lapsed'
		}));
		const seen = new Set([...due, ...lapsed].map((r) => r.normalized_title));
		const regular = (purchaseInsights.regular || [])
			.filter((row) => !seen.has(row.normalized_title))
			.slice(0, 3)
			.map((row) => ({ ...row, _kind: 'regular' }));
		return [...due, ...lapsed, ...regular];
	}, [purchaseInsights]);

	const categoryPieData = useMemo(
		() =>
			(data?.categories || [])
				.map((row) => ({
					name: row.name,
					value: Number(row.amount || 0)
				}))
				.filter((row) => row.value > 0),
		[data]
	);

	const balancePieData = useMemo(() => {
		const starting = Number(data?.balance_composition?.starting_balance || 0);
		const spent = Number(data?.balance_composition?.spent || 0);
		const slices = [];
		if (starting > 0) slices.push({ name: 'Starting', value: starting, key: 'starting_balance' });
		if (spent > 0) slices.push({ name: 'Spent', value: spent, key: 'spent' });
		return slices;
	}, [data]);

	const rangeLabel = formatRangeLabel(data?.start, data?.end) || 'This period';

	return (
		<div>
			<PageHeader
				title={`${greeting()}, ${name}`}
				icon={LayoutDashboard}
				description={`Category and balance mix for ${rangeLabel}.`}
				actions={
					<Button variant="secondary" onClick={() => setScanOpen(true)}>
						<ScanLine size={16} /> Scan receipt
					</Button>
				}
			/>

			{balance && (
				<div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
					<StatCard label="Balance" value={formatCost(balance.balance)} />
					<StatCard label="Starting" value={formatCost(balance.starting_balance)} />
					<StatCard label="Expenses (all time)" value={formatCost(balance.totals?.expense)} />
				</div>
			)}

			<Card>
				<CardHeader
					title="Spend mix"
					subtitle="Expense categories and starting vs spent this period"
					action={
						<div className="flex flex-wrap items-center justify-end gap-2">
							<div className="border-line bg-surface-2 inline-flex rounded-md border p-0.5">
								{PERIODS.map((g) => (
									<Button
										key={g.value}
										size="sm"
										variant={period === g.value ? 'primary' : 'ghost'}
										className="h-8"
										onClick={() => setPeriod(g.value)}
									>
										{g.label}
									</Button>
								))}
							</div>
							<Button
								size="sm"
								variant={includeArchived ? 'secondary' : 'ghost'}
								className="h-8"
								onClick={() => setIncludeArchived((v) => !v)}
							>
								{includeArchived ? 'Including archived' : 'Active only'}
							</Button>
						</div>
					}
				/>
				<CardBody>
					{isLoading ? (
						<LoadingScreen />
					) : isError ? (
						<EmptyState
							icon={LayoutDashboard}
							title="Could not load analytics"
							description="Something went wrong while fetching spend data."
						/>
					) : (
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							<CompactPie
								title="By category"
								data={categoryPieData}
								colors={CATEGORY_COLORS}
								emptyLabel="No line-item spend in this period."
							/>
							<CompactPie
								title="Starting vs spent"
								data={balancePieData}
								colors={(entry) => BALANCE_COLORS[entry.key] || 'var(--muted)'}
								emptyLabel="No starting balance or spend to compare."
							/>
						</div>
					)}
				</CardBody>
			</Card>

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
		</div>
	);
}
