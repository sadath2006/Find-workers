/**
 * Utility to compress and normalize image data URLs and video streams.
 */

/**
 * Converts a data URL or URL string into a Blob.
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Normalizes any image source (HTMLVideoElement, HTMLImageElement, ImageBitmap, or Data URL string)
 * into a standardized 1:1 square JPEG Data URL (640x640 by default).
 * 
 * Automatically applies EXIF Orientation correction (crucial for mobile gallery uploads in PWA/Web)
 * and center-crops the input so there is NO aspect ratio stretching or letterboxing.
 */
export async function normalizeImageToSquareDataUrl(
  source: HTMLVideoElement | HTMLImageElement | ImageBitmap | string,
  targetSize: number = 640,
  quality: number = 0.88
): Promise<string> {
  if (!source) return '';

  return new Promise(async (resolve) => {
    // 1. Try modern createImageBitmap with EXIF orientation auto-correction for string sources
    if (typeof source === 'string' && (source.startsWith('data:image') || source.startsWith('blob:') || source.startsWith('http'))) {
      try {
        const blob = await dataUrlToBlob(source);
        if (blob && typeof createImageBitmap === 'function') {
          const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
          if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
            const cropSize = Math.min(bitmap.width, bitmap.height);
            const sx = Math.floor((bitmap.width - cropSize) / 2);
            const sy = Math.floor((bitmap.height - cropSize) / 2);

            const canvas = document.createElement('canvas');
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(bitmap, sx, sy, cropSize, cropSize, 0, 0, targetSize, targetSize);
              const resultDataUrl = canvas.toDataURL('image/jpeg', quality);
              bitmap.close();
              if (resultDataUrl) {
                resolve(resultDataUrl);
                return;
              }
            }
          }
        }
      } catch (err) {
        console.warn('createImageBitmap EXIF normalization notice, falling back to Image element:', err);
      }
    }

    // 2. Fallback processing for video elements, image elements or plain images
    const processElement = (el: HTMLVideoElement | HTMLImageElement | ImageBitmap) => {
      try {
        let srcWidth = 0;
        let srcHeight = 0;

        if (el instanceof HTMLVideoElement) {
          srcWidth = el.videoWidth || 640;
          srcHeight = el.videoHeight || 480;
        } else if (el instanceof HTMLImageElement) {
          srcWidth = el.naturalWidth || el.width || 640;
          srcHeight = el.naturalHeight || el.height || 480;
        } else if (typeof ImageBitmap !== 'undefined' && el instanceof ImageBitmap) {
          srcWidth = el.width || 640;
          srcHeight = el.height || 480;
        }

        if (srcWidth <= 0 || srcHeight <= 0) {
          srcWidth = 640;
          srcHeight = 480;
        }

        // Center square crop
        const cropSize = Math.min(srcWidth, srcHeight);
        const sx = Math.floor((srcWidth - cropSize) / 2);
        const sy = Math.floor((srcHeight - cropSize) / 2);

        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(typeof source === 'string' ? source : '');
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(el, sx, sy, cropSize, cropSize, 0, 0, targetSize, targetSize);

        const resultDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(resultDataUrl || (typeof source === 'string' ? source : ''));
      } catch (err) {
        console.warn('Square normalization error:', err);
        resolve(typeof source === 'string' ? source : '');
      }
    };

    if (typeof source === 'string') {
      if (!source.startsWith('data:image') && !source.startsWith('http') && !source.startsWith('blob:')) {
        resolve(source);
        return;
      }
      const img = new Image();
      if (!source.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => processElement(img);
      img.onerror = () => resolve(source);
      img.src = source;
    } else {
      processElement(source);
    }
  });
}

export async function compressImage(
  dataUrl: string,
  maxWidth: number = 640,
  maxHeight: number = 640,
  quality: number = 0.88
): Promise<string> {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    return dataUrl || '';
  }

  return normalizeImageToSquareDataUrl(dataUrl, Math.max(maxWidth, maxHeight), quality);
}
