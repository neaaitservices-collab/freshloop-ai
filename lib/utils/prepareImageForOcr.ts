export const OCR_IMAGE_MAX_EDGE = 1200;
export const OCR_IMAGE_JPEG_QUALITY = 0.78;

function encodeCanvasForOcr(
  canvas: HTMLCanvasElement,
  quality: number
): { dataUrl: string; mimeType: string } {
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) {
    return { dataUrl: webp, mimeType: 'image/webp' };
  }
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), mimeType: 'image/jpeg' };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read the image file.'));
    };
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.readAsDataURL(file);
  });
}

/** Compress invoice / supplier-sheet photos before OCR API calls. */
export async function prepareImageFileForOcr(
  file: File,
  options?: { maxEdge?: number; quality?: number; maxBase64Chars?: number }
): Promise<{ dataUrl: string; mimeType: string; previewUrl: string }> {
  const raw = await readFileAsDataUrl(file);
  const prepared = await prepareImageDataUrlForOcr(raw, options);
  return { ...prepared, previewUrl: prepared.dataUrl };
}

/** Downscale and re-encode invoice photos so OCR requests stay under serverless body limits. */
export async function prepareImageDataUrlForOcr(
  dataUrl: string,
  options?: { maxEdge?: number; quality?: number; maxBase64Chars?: number }
): Promise<{ dataUrl: string; mimeType: string }> {
  const maxEdge = options?.maxEdge ?? OCR_IMAGE_MAX_EDGE;
  const quality = options?.quality ?? OCR_IMAGE_JPEG_QUALITY;
  const maxBase64Chars = options?.maxBase64Chars ?? 1_800_000;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { dataUrl, mimeType: 'image/jpeg' };
  }

  const mimeType = match[1];
  const base64Payload = match[2];
  const needsTranscode = /heic|heif/i.test(mimeType);
  const acceptableMime =
    mimeType === 'image/jpeg' || mimeType === 'image/webp' || mimeType === 'image/jpg';
  if (!needsTranscode && base64Payload.length <= maxBase64Chars && acceptableMime) {
    return { dataUrl, mimeType };
  }

  if (typeof document === 'undefined') {
    return { dataUrl, mimeType: mimeType || 'image/jpeg' };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);
      const scale = longest > maxEdge ? maxEdge / longest : 1;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl, mimeType: mimeType || 'image/jpeg' });
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(encodeCanvasForOcr(canvas, quality));
    };
    img.onerror = () => reject(new Error('Could not prepare the photo for upload. Try another image.'));
    img.src = dataUrl;
  });
}
