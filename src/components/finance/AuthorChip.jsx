import { cn } from '../../lib/format';
import { Avatar } from '../ui/Avatar';

/** Circular initials chip for the transaction author (last editor / creator). */
export function AuthorChip({ author, size = 22, className }) {
	if (!author) return null;
	const name = (author.full_name || '').trim() || author.email || 'Unknown';
	return (
		<span
			className={cn('inline-flex shrink-0', className)}
			title={name}
			aria-label={`Author ${name}`}
		>
			<Avatar name={name} size={size} />
		</span>
	);
}

export function authorDisplayName(author) {
	if (!author) return '';
	return (author.full_name || '').trim() || author.email || '';
}
