/** Downscale and re-encode invoice photos so OCR requests stay under serverless body limits. */
export async function prepareImageDataUrlForOcr(
  dataUrl: string,
  options?: { maxEdge?: number; quality?: number; maxBase64Chars?: number }
): Promise<{ dataUrl: string; mimeType: string }> {
  const maxEdge = options?.maxEdge ?? 1680;
  const quality = options?.quality ?? 0.78;
  const maxBase64Chars = options?.maxBase64Chars ?? 2_400_000;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { dataUrl, mimeType: 'image/jpeg' };
  }

  const mimeType = match[1];
  const base64Payload = match[2];
  const needsTranscode = /heic|heif/i.test(mimeType);
  if (!needsTranscode && base64Payload.length <= maxBase64Chars && mimeType === 'image/jpeg') {
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
      const jpegUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ dataUrl: jpegUrl, mimeType: 'image/jpeg' });
    };
    img.onerror = () => reject(new Error('Could not prepare the photo for upload. Try another image.'));
    img.src = dataUrl;
  });
}
