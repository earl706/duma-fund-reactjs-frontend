import { cn, costParts } from '../../lib/format';
import { Tooltip } from '../ui/Tooltip';

/**
 * Money label that shows a styled tooltip with the full amount when compact
 * (k / M / B) formatting is used.
 */
export function CostAmount({
	value,
	minCompact = 10000,
	prefix = '',
	className,
	tooltipClassName,
	as: Comp = 'span'
}) {
	const { display, full, compact } = costParts(value, { minCompact });
	const shown = display === '—' ? display : `${prefix}${display}`;
	const tip = compact && display !== '—' ? `${prefix}${full}` : null;
	const node = <Comp className={cn('tabular-nums', className)}>{shown}</Comp>;
	if (!tip) return node;
	return (
		<Tooltip content={tip} className={tooltipClassName}>
			{node}
		</Tooltip>
	);
}
