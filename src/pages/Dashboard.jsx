import { LayoutDashboard, List, Archive, Activity } from 'lucide-react';

import { useAuthStore } from '../stores/authStore';
import { costListsApi } from '../lib/resources';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardBody, CardHeader, StatCard } from '../components/ui';

function greeting() {
	const hour = new Date().getHours();
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}

export default function DashboardPage() {
	const user = useAuthStore((s) => s.user);
	const name = user?.full_name?.split(' ')[0] || 'there';

	const { data: all } = costListsApi.useList({ page_size: 1 });
	const { data: active } = costListsApi.useList({ status: 'active', page_size: 1 });
	const { data: archived } = costListsApi.useList({ status: 'archived', page_size: 1 });

	const stats = [
		{ icon: List, label: 'Total lists', value: all?.count ?? '—', tone: 'primary' },
		{ icon: Activity, label: 'Active', value: active?.count ?? '—', tone: 'success' },
		{ icon: Archive, label: 'Archived', value: archived?.count ?? '—', tone: 'warning' }
	];

	return (
		<div>
			<PageHeader
				title={`${greeting()}, ${name}`}
				icon={LayoutDashboard}
				description="Here's a quick overview of your workspace."
			/>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				{stats.map((stat) => (
					<StatCard key={stat.label} {...stat} />
				))}
			</div>

			<Card className="mt-6">
				<CardHeader title="Welcome to DumaFund" subtitle="Lists of what things cost" />
				<CardBody>
					<p className="text-muted text-sm">
						This dashboard is a starting point. Head to{' '}
						<span className="text-fg font-medium">Lists</span> to add cost lists and line items —
						search, pagination, modals, and toasts are already wired up.
					</p>
				</CardBody>
			</Card>
		</div>
	);
}
