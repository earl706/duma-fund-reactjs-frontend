/**
 * Canvas crop / perspective-warp a loaded image.
 * Accepts either:
 *   - axis-aligned { x, y, width, height } (legacy)
 *   - { corners: [{x,y}×4] } in TL → TR → BR → BL image-pixel order
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

function dist(a, b) {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.hypot(dx, dy);
}

function clampPoint(p, maxX, maxY) {
	return {
		x: Math.min(maxX, Math.max(0, p.x)),
		y: Math.min(maxY, Math.max(0, p.y))
	};
}

/** True if polygon is convex and wound consistently (area > 0). */
export function isConvexQuad(corners) {
	if (!corners || corners.length !== 4) return false;
	let sign = 0;
	for (let i = 0; i < 4; i++) {
		const a = corners[i];
		const b = corners[(i + 1) % 4];
		const c = corners[(i + 2) % 4];
		const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
		if (Math.abs(cross) < 1e-6) continue;
		const s = cross > 0 ? 1 : -1;
		if (sign === 0) sign = s;
		else if (s !== sign) return false;
	}
	return sign !== 0;
}

function normalizeCorners(corners, naturalW, naturalH) {
	if (!Array.isArray(corners) || corners.length !== 4) {
		throw new Error('Select an area to crop.');
	}
	const clamped = corners.map((p) =>
		clampPoint(
			{ x: Number(p.x), y: Number(p.y) },
			Math.max(0, naturalW - 1),
			Math.max(0, naturalH - 1)
		)
	);
	if (!isConvexQuad(clamped)) {
		throw new Error('Crop area must stay a convex shape.');
	}
	return clamped;
}

/**
 * Homography mapping destination (u,v,1) → source (x,y).
 * src/dst are length-4 point arrays. Returns 3×3 row-major H or null.
 */
function computeHomography(src, dst) {
	// Solve for H such that src ~ H * dst (homogeneous).
	// For each point: x = (h0 u + h1 v + h2) / (h6 u + h7 v + h8)
	// with h8 = 1.
	const A = Array.from({ length: 8 }, () => Array(8).fill(0));
	const b = Array(8).fill(0);
	for (let i = 0; i < 4; i++) {
		const { x, y } = src[i];
		const { x: u, y: v } = dst[i];
		const r = i * 2;
		A[r][0] = u;
		A[r][1] = v;
		A[r][2] = 1;
		A[r][6] = -u * x;
		A[r][7] = -v * x;
		b[r] = x;
		A[r + 1][3] = u;
		A[r + 1][4] = v;
		A[r + 1][5] = 1;
		A[r + 1][6] = -u * y;
		A[r + 1][7] = -v * y;
		b[r + 1] = y;
	}

	// Gaussian elimination 8×8
	const M = A.map((row, i) => [...row, b[i]]);
	for (let col = 0; col < 8; col++) {
		let pivot = col;
		for (let r = col + 1; r < 8; r++) {
			if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
		}
		if (Math.abs(M[pivot][col]) < 1e-12) return null;
		if (pivot !== col) {
			const tmp = M[col];
			M[col] = M[pivot];
			M[pivot] = tmp;
		}
		const div = M[col][col];
		for (let c = col; c < 9; c++) M[col][c] /= div;
		for (let r = 0; r < 8; r++) {
			if (r === col) continue;
			const f = M[r][col];
			for (let c = col; c < 9; c++) M[r][c] -= f * M[col][c];
		}
	}
	const h = M.map((row) => row[8]);
	return [
		[h[0], h[1], h[2]],
		[h[3], h[4], h[5]],
		[h[6], h[7], 1]
	];
}

function applyHomography(H, u, v) {
	const w = H[2][0] * u + H[2][1] * v + H[2][2];
	if (Math.abs(w) < 1e-12) return null;
	return {
		x: (H[0][0] * u + H[0][1] * v + H[0][2]) / w,
		y: (H[1][0] * u + H[1][1] * v + H[1][2]) / w
	};
}

function sampleBilinear(data, width, height, x, y) {
	if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
		const xi = Math.min(width - 1, Math.max(0, Math.round(x)));
		const yi = Math.min(height - 1, Math.max(0, Math.round(y)));
		const i = (yi * width + xi) * 4;
		return [data[i], data[i + 1], data[i + 2], data[i + 3]];
	}
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = x0 + 1;
	const y1 = y0 + 1;
	const fx = x - x0;
	const fy = y - y0;
	const i00 = (y0 * width + x0) * 4;
	const i10 = (y0 * width + x1) * 4;
	const i01 = (y1 * width + x0) * 4;
	const i11 = (y1 * width + x1) * 4;
	const out = [0, 0, 0, 0];
	for (let c = 0; c < 4; c++) {
		const v00 = data[i00 + c];
		const v10 = data[i10 + c];
		const v01 = data[i01 + c];
		const v11 = data[i11 + c];
		out[c] = Math.round(
			v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
		);
	}
	return out;
}

function isAxisAlignedQuad(corners, tol = 3) {
	const [tl, tr, br, bl] = corners;
	return (
		Math.abs(tl.y - tr.y) <= tol &&
		Math.abs(bl.y - br.y) <= tol &&
		Math.abs(tl.x - bl.x) <= tol &&
		Math.abs(tr.x - br.x) <= tol
	);
}

function axisAlignedBounds(corners) {
	const xs = corners.map((p) => p.x);
	const ys = corners.map((p) => p.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return {
		x,
		y,
		width: Math.max(...xs) - x,
		height: Math.max(...ys) - y
	};
}

async function rasterizeImage(image) {
	const width = image.naturalWidth || image.width;
	const height = image.naturalHeight || image.height;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Could not crop image.');

	let drawable = image;
	let closeBitmap = null;
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
			// Only use oriented bitmap when it matches <img> natural size (same space as crop handles).
			if (bitmap.width === width && bitmap.height === height) {
				drawable = bitmap;
				closeBitmap = () => bitmap.close();
			} else {
				bitmap.close();
			}
		} catch {
			/* fall back to HTMLImageElement */
		}
	}

	ctx.drawImage(drawable, 0, 0, width, height);
	if (closeBitmap) closeBitmap();
	return {
		width,
		height,
		data: ctx.getImageData(0, 0, width, height).data
	};
}

async function warpQuadToRect(image, corners) {
	const raster = await rasterizeImage(image);
	const naturalW = raster.width;
	const naturalH = raster.height;
	const src = normalizeCorners(corners, naturalW, naturalH);

	// Default / rectangular crops: use drawImage — sharper text for OCR than full resample.
	if (isAxisAlignedQuad(src)) {
		return cropAxisAligned(image, axisAlignedBounds(src));
	}

	const [tl, tr, br, bl] = src;

	const outW = Math.max(1, Math.round(Math.max(dist(tl, tr), dist(bl, br))));
	const outH = Math.max(1, Math.round(Math.max(dist(tl, bl), dist(tr, br))));

	const dst = [
		{ x: 0, y: 0 },
		{ x: outW - 1, y: 0 },
		{ x: outW - 1, y: outH - 1 },
		{ x: 0, y: outH - 1 }
	];

	const H = computeHomography(src, dst);
	if (!H) throw new Error('Could not crop image.');

	const outCanvas = document.createElement('canvas');
	outCanvas.width = outW;
	outCanvas.height = outH;
	const outCtx = outCanvas.getContext('2d');
	if (!outCtx) throw new Error('Could not crop image.');
	const outImage = outCtx.createImageData(outW, outH);
	const out = outImage.data;

	for (let v = 0; v < outH; v++) {
		for (let u = 0; u < outW; u++) {
			const p = applyHomography(H, u, v);
			const i = (v * outW + u) * 4;
			if (!p) {
				out[i + 3] = 0;
				continue;
			}
			const [r, g, b, a] = sampleBilinear(raster.data, naturalW, naturalH, p.x, p.y);
			out[i] = r;
			out[i + 1] = g;
			out[i + 2] = b;
			out[i + 3] = a;
		}
	}
	outCtx.putImageData(outImage, 0, 0);
	return outCanvas;
}

async function cropAxisAligned(image, pixelCrop) {
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
	return canvas;
}

export async function getCroppedImageFile(imageSrc, cropRegion, originalFile) {
	if (!cropRegion) throw new Error('Select an area to crop.');

	const image = await loadImage(imageSrc);
	let canvas;
	if (Array.isArray(cropRegion.corners) && cropRegion.corners.length === 4) {
		canvas = await warpQuadToRect(image, cropRegion.corners);
	} else if (cropRegion.width && cropRegion.height) {
		canvas = await cropAxisAligned(image, cropRegion);
	} else {
		throw new Error('Select an area to crop.');
	}

	const type = outputType(originalFile);
	try {
		const blob = await canvasToBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined);
		return fileFromBlob(blob, originalFile);
	} catch {
		const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
		return fileFromBlob(blob, originalFile);
	}
}
