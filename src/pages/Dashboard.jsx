import { useMemo, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import {
	Area,
	AreaChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis
} from 'recharts';
import { format, parseISO } from 'date-fns';

import { useAuthStore } from '../stores/authStore';
import { useCostAnalytics } from '../lib/resources';
import { formatCost } from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, CardBody, CardHeader, EmptyState, LoadingScreen } from '../components/ui';

const GRAINS = [
	{ value: 'day', label: 'Daily' },
	{ value: 'week', label: 'Weekly' },
	{ value: 'month', label: 'Monthly' }
];

function formatPeriodLabel(period, grain) {
	if (!period) return '';
	const d = typeof period === 'string' ? parseISO(period) : period;
	if (grain === 'month') return format(d, 'MMM yyyy');
	if (grain === 'week') return `Week of ${format(d, 'MMM d')}`;
	return format(d, 'MMM d');
}

function greeting() {
	const hour = new Date().getHours();
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}

export default function DashboardPage() {
	const user = useAuthStore((s) => s.user);
	const name = user?.full_name?.split(' ')[0] || 'there';
	const [grain, setGrain] = useState('day');
	const [includeArchived, setIncludeArchived] = useState(false);

	const { data, isLoading, isError } = useCostAnalytics({
		grain,
		include_archived: includeArchived ? '1' : '0'
	});

	const chartData = useMemo(() => {
		const points = data?.points || [];
		return points.map((p) => ({
			period: p.period,
			label: formatPeriodLabel(p.period, grain),
			item_spend: Number(p.item_spend || 0),
			list_spend: Number(p.list_spend || 0),
			list_count: Number(p.list_count || 0)
		}));
	}, [data, grain]);

	const rangeLabel =
		data?.start && data?.end
			? `${formatPeriodLabel(data.start, 'day')} – ${formatPeriodLabel(data.end, 'day')}`
			: 'Last 30 days';

	return (
		<div>
			<PageHeader
				title={`${greeting()}, ${name}`}
				icon={LayoutDashboard}
				description={`Spend over ${rangeLabel} by effective date.`}
			/>

			<Card>
				<CardHeader
					title="Expense activity"
					subtitle="Item line totals and list totals by date effective"
					action={
						<div className="flex flex-wrap items-center justify-end gap-2">
							<div className="border-line bg-surface-2 inline-flex rounded-md border p-0.5">
								{GRAINS.map((g) => (
									<Button
										key={g.value}
										size="sm"
										variant={grain === g.value ? 'primary' : 'ghost'}
										className="h-8"
										onClick={() => setGrain(g.value)}
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
						<div className="h-80 w-full">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
									<defs>
										<linearGradient id="itemSpendFill" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
											<stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
										</linearGradient>
										<linearGradient id="listSpendFill" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
											<stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
										</linearGradient>
									</defs>
									<CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
									<XAxis
										dataKey="label"
										tick={{ fill: 'var(--muted)', fontSize: 11 }}
										tickLine={false}
										axisLine={{ stroke: 'var(--line)' }}
										interval="preserveStartEnd"
										minTickGap={28}
									/>
									<YAxis
										tick={{ fill: 'var(--muted)', fontSize: 11 }}
										tickLine={false}
										axisLine={false}
										tickFormatter={(v) => formatCost(v)}
										width={64}
									/>
									<Tooltip
										contentStyle={{
											background: 'var(--surface)',
											border: '1px solid var(--line)',
											borderRadius: 8,
											color: 'var(--fg)'
										}}
										formatter={(value, name) => {
											if (name === 'list_count') return [value, 'Lists'];
											const label = name === 'item_spend' ? 'Items' : 'Lists (total)';
											return [formatCost(value), label];
										}}
										labelFormatter={(label) => label}
									/>
									<Legend
										formatter={(value) =>
											value === 'item_spend'
												? 'Item spend'
												: value === 'list_spend'
													? 'List spend'
													: value
										}
									/>
									<Area
										type="monotone"
										dataKey="item_spend"
										name="item_spend"
										stroke="var(--primary)"
										fill="url(#itemSpendFill)"
										strokeWidth={2}
										dot={false}
										activeDot={{ r: 4 }}
									/>
									<Area
										type="monotone"
										dataKey="list_spend"
										name="list_spend"
										stroke="var(--accent)"
										fill="url(#listSpendFill)"
										strokeWidth={2}
										dot={false}
										activeDot={{ r: 4 }}
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
					)}
				</CardBody>
			</Card>
		</div>
	);
}
