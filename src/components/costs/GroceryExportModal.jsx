import { Download, Share2 } from 'lucide-react';

import { Button, Modal } from '../ui';

/**
 * Preview a grocery-receipt PNG with download and optional Web Share.
 */
export function GroceryExportModal({
	open,
	onClose,
	previewUrl,
	filename,
	canShare,
	sharing = false,
	downloading = false,
	onDownload,
	onShare
}) {
	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Grocery list image"
			size="md"
			footer={
				<>
					<Button variant="secondary" onClick={onClose}>
						Close
					</Button>
					{canShare && (
						<Button variant="secondary" loading={sharing} onClick={onShare}>
							<Share2 size={16} /> Share
						</Button>
					)}
					<Button loading={downloading} onClick={onDownload}>
						<Download size={16} /> Download PNG
					</Button>
				</>
			}
		>
			{previewUrl ? (
				<div className="bg-surface-2 flex justify-center rounded-md p-3">
					<img
						src={previewUrl}
						alt="Grocery list preview"
						className="max-h-[60vh] w-auto max-w-full rounded-sm shadow-sm"
					/>
				</div>
			) : (
				<p className="text-muted text-sm">Preparing preview…</p>
			)}
			{filename && (
				<p className="text-muted mt-3 truncate text-xs" title={filename}>
					{filename}
				</p>
			)}
		</Modal>
	);
}
