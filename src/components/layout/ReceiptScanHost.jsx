import { useQueryClient } from '@tanstack/react-query';

import { categoriesApi } from '../../lib/resources';
import { useUIStore } from '../../stores/uiStore';
import { ReceiptImportModal } from '../finance/ReceiptImportModal';

/** App-shell receipt scan so the iOS center tab can open it from any page. */
export function ReceiptScanHost() {
	const queryClient = useQueryClient();
	const { scanOpen, closeScan } = useUIStore();
	const { data: categoriesData } = categoriesApi.useList({ page_size: 100, kind: 'expense' });
	const { data: incomeCatsData } = categoriesApi.useList({ page_size: 100, kind: 'income' });

	return (
		<ReceiptImportModal
			open={scanOpen}
			onClose={closeScan}
			categories={categoriesData?.results || []}
			incomeCategories={incomeCatsData?.results || []}
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
	);
}
