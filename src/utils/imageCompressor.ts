/**
 * Utility to compress image data URLs to ensure Firestore document payload size stays well under 1MB.
 */
export async function compressImage(
  dataUrl: string,
  maxWidth: number = 360,
  maxHeight: number = 360,
  quality: number = 0.72
): Promise<string> {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    return dataUrl || '';
  }

  // If image string is already small (< 60 KB in string length), return as is
  if (dataUrl.length < 80000) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let width = img.width || maxWidth;
        let height = img.height || maxHeight;

        // Calculate constrained dimensions preserving aspect ratio
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

        if (compressedDataUrl && compressedDataUrl.length > 50) {
          resolve(compressedDataUrl);
        } else {
          resolve(dataUrl);
        }
      } catch (err) {
        console.warn('Image compression fallback:', err);
        resolve(dataUrl);
      }
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}
