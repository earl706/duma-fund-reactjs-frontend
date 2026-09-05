/**
 * Canvas-crop a loaded image using pixel bounds from react-easy-crop.
 * Returns a File suitable for scan-receipt / commit-receipt uploads.
 */

function loadImage(src) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.addEventListener('load', () => resolve(image));
		image.addEventListener('error', () => reject(new Error('Could not load image.')));
		image.src = src;
	});
}

function canvasToBlob(canvas, type, quality) {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Could not crop image.'))),
			type,
			quality
		);
	});
}

function fileFromBlob(blob, originalFile) {
	const type = blob.type || 'image/jpeg';
	const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
	const base = (originalFile?.name || 'receipt').replace(/\.[^.]+$/, '');
	return new File([blob], `${base}.${ext}`, { type, lastModified: Date.now() });
}

function outputType(originalFile) {
	const type = originalFile?.type;
	if (type === 'image/png' || type === 'image/webp') return type;
	return 'image/jpeg';
}

export async function getCroppedImageFile(imageSrc, pixelCrop, originalFile) {
	if (!pixelCrop?.width || !pixelCrop?.height) {
		throw new Error('Select an area to crop.');
	}

	const image = await loadImage(imageSrc);
	const naturalW = image.naturalWidth || image.width;
	const naturalH = image.naturalHeight || image.height;
	const x = Math.max(0, Math.round(pixelCrop.x));
	const y = Math.max(0, Math.round(pixelCrop.y));
	const width = Math.max(1, Math.min(Math.round(pixelCrop.width), naturalW - x));
	const height = Math.max(1, Math.min(Math.round(pixelCrop.height), naturalH - y));

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not crop image.');
	ctx.drawImage(image, x, y, width, height, 0, 0, width, height);

	const type = outputType(originalFile);
	try {
		const blob = await canvasToBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined);
		return fileFromBlob(blob, originalFile);
	} catch {
		const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
		return fileFromBlob(blob, originalFile);
	}
}
