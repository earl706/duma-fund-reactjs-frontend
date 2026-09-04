import { get } from './api';
import { formatCost, formatDate } from './format';

const PAGE_SIZE = 100;

/** Fetch every item on a transaction (ignores UI filters/pagination). */
export async function fetchAllCostItems(transactionId) {
	const items = [];
	let page = 1;
	let totalPages = 1;
	while (page <= totalPages) {
		const data = await get(`/finance/transactions/${transactionId}/items/`, {
			params: { page, page_size: PAGE_SIZE, ordering: 'title' }
		});
		items.push(...(data.results || []));
		totalPages = data.total_pages || 1;
		page += 1;
	}
	return items;
}

function slugify(value) {
	return (
		String(value || 'list')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 48) || 'list'
	);
}

export function groceryFilename(list) {
	const date = list.date_effective || new Date().toISOString().slice(0, 10);
	return `${slugify(list.title)}-${date}.png`;
}

function wrapText(ctx, text, maxWidth) {
	const words = String(text || '')
		.split(/\s+/)
		.filter(Boolean);
	if (!words.length) return [''];
	const lines = [];
	let current = words[0];
	for (let i = 1; i < words.length; i += 1) {
		const next = `${current} ${words[i]}`;
		if (ctx.measureText(next).width <= maxWidth) current = next;
		else {
			lines.push(current);
			current = words[i];
		}
	}
	lines.push(current);
	return lines;
}

function formatQty(value) {
	const n = Number(value ?? 0);
	if (Number.isNaN(n)) return String(value ?? '');
	return n.toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	});
}

/**
 * Draw a print-friendly light receipt / grocery checklist onto a canvas.
 * Returns { canvas, total }.
 */
export function renderGroceryReceiptCanvas(list, items) {
	const width = 640;
	const padX = 40;
	const padY = 36;
	const lineGap = 10;
	const titleSize = 28;
	const metaSize = 14;
	const itemSize = 16;
	const totalSize = 18;
	const checkSize = 16;
	const qtyCol = 110;

	const measure = document.createElement('canvas').getContext('2d');
	measure.font = `600 ${titleSize}px Georgia, "Times New Roman", serif`;
	const titleLines = wrapText(measure, list.title || 'Grocery list', width - padX * 2);
	measure.font = `${itemSize}px ui-sans-serif, system-ui, sans-serif`;

	const itemBlocks = items.map((item) => {
		const title = item.title || 'Untitled';
		const qty = formatQty(item.quantity);
		const unit = item.unit || 'pcs';
		const qtyLabel = `${qty} ${unit}`;
		const textMax = width - padX * 2 - checkSize - 16 - qtyCol;
		const lines = wrapText(measure, title, textMax);
		return { lines, qtyLabel, lineTotal: Number(item.cost || 0) * Number(item.quantity || 0) };
	});

	let contentHeight = padY + titleLines.length * (titleSize + 6) + 8 + metaSize + 24 + 2 + 16;

	for (const block of itemBlocks) {
		contentHeight += Math.max(block.lines.length, 1) * (itemSize + 4) + lineGap + 8;
	}

	contentHeight += 24 + 2 + 20 + totalSize + padY;

	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(width * dpr);
	canvas.height = Math.round(contentHeight * dpr);
	canvas.style.width = `${width}px`;
	canvas.style.height = `${contentHeight}px`;

	const ctx = canvas.getContext('2d');
	ctx.scale(dpr, dpr);

	// Paper background
	ctx.fillStyle = '#f7f3ea';
	ctx.fillRect(0, 0, width, contentHeight);
	ctx.strokeStyle = '#e4ddd0';
	ctx.lineWidth = 2;
	ctx.strokeRect(1, 1, width - 2, contentHeight - 2);

	let y = padY;
	ctx.fillStyle = '#1a1726';
	ctx.font = `600 ${titleSize}px Georgia, "Times New Roman", serif`;
	ctx.textBaseline = 'top';
	for (const line of titleLines) {
		ctx.fillText(line, padX, y);
		y += titleSize + 6;
	}

	y += 4;
	ctx.fillStyle = '#6b6779';
	ctx.font = `${metaSize}px ui-sans-serif, system-ui, sans-serif`;
	const effective = list.date_effective
		? formatDate(list.date_effective)
		: formatDate(new Date().toISOString().slice(0, 10));
	ctx.fillText(`Effective ${effective}`, padX, y);
	y += metaSize + 20;

	// Divider
	ctx.strokeStyle = '#cfc6b6';
	ctx.setLineDash([4, 4]);
	ctx.beginPath();
	ctx.moveTo(padX, y);
	ctx.lineTo(width - padX, y);
	ctx.stroke();
	ctx.setLineDash([]);
	y += 18;

	const total = itemBlocks.reduce((sum, b) => sum + b.lineTotal, 0);

	for (const block of itemBlocks) {
		const rowTop = y;
		const rowHeight = Math.max(block.lines.length, 1) * (itemSize + 4);

		// Checkbox
		ctx.strokeStyle = '#8a8376';
		ctx.lineWidth = 1.5;
		ctx.strokeRect(padX, rowTop + 2, checkSize, checkSize);

		ctx.fillStyle = '#1a1726';
		ctx.font = `${itemSize}px ui-sans-serif, system-ui, sans-serif`;
		let textY = rowTop;
		for (const line of block.lines) {
			ctx.fillText(line, padX + checkSize + 12, textY);
			textY += itemSize + 4;
		}

		ctx.fillStyle = '#6b6779';
		ctx.textAlign = 'right';
		ctx.fillText(`× ${block.qtyLabel}`, width - padX, rowTop);
		ctx.textAlign = 'left';

		y = rowTop + rowHeight + lineGap;

		ctx.strokeStyle = '#e7e0d4';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(padX + checkSize + 12, y - lineGap / 2);
		ctx.lineTo(width - padX, y - lineGap / 2);
		ctx.stroke();
		y += 4;
	}

	y += 12;
	ctx.strokeStyle = '#cfc6b6';
	ctx.setLineDash([4, 4]);
	ctx.beginPath();
	ctx.moveTo(padX, y);
	ctx.lineTo(width - padX, y);
	ctx.stroke();
	ctx.setLineDash([]);
	y += 18;

	ctx.fillStyle = '#1a1726';
	ctx.font = `600 ${totalSize}px ui-sans-serif, system-ui, sans-serif`;
	ctx.fillText('Total', padX, y);
	ctx.textAlign = 'right';
	ctx.fillText(formatCost(total), width - padX, y);
	ctx.textAlign = 'left';

	return { canvas, total };
}

export function canvasToBlob(canvas) {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Could not create image.'))),
			'image/png'
		);
	});
}

export function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

export function canShareImageFile(file) {
	try {
		return typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] });
	} catch {
		return false;
	}
}

export async function shareImageFile(file, title) {
	await navigator.share({
		files: [file],
		title: title || 'Grocery list',
		text: title || 'Grocery list'
	});
}
