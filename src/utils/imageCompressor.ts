/**
 * Biometric Image Processing & EXIF Orientation Normalization Engine.
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
 * Normalizes any image source (HTMLVideoElement, HTMLImageElement, ImageBitmap, or Data URL)
 * for Biometric Face Detection & Deep Feature Extraction.
 * 
 * CRITICAL ADVANTAGES:
 * 1. Preserves FULL aspect ratio (NO center-cropping that cuts off foreheads, hair, or chins on mobile portrait selfies).
 * 2. Automatically corrects EXIF Orientation on iOS Safari and Android Chrome gallery uploads.
 * 3. Scales to optimal neural net resolution (max dimension 800px) with high-quality bicubic smoothing.
 */
export async function normalizeImageForBiometrics(
  source: HTMLVideoElement | HTMLImageElement | ImageBitmap | string,
  maxDimension: number = 800,
  quality: number = 0.92
): Promise<string> {
  if (!source) return '';

  return new Promise(async (resolve) => {
    // 1. Try modern createImageBitmap with EXIF orientation auto-correction for string/blob sources
    if (typeof source === 'string' && (source.startsWith('data:image') || source.startsWith('blob:') || source.startsWith('http'))) {
      try {
        const blob = await dataUrlToBlob(source);
        if (blob && typeof createImageBitmap === 'function') {
          const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
          if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
            let targetW = bitmap.width;
            let targetH = bitmap.height;
            if (Math.max(targetW, targetH) > maxDimension) {
              if (targetW >= targetH) {
                targetH = Math.round((targetH * maxDimension) / targetW);
                targetW = maxDimension;
              } else {
                targetW = Math.round((targetW * maxDimension) / targetH);
                targetH = maxDimension;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(bitmap, 0, 0, targetW, targetH);
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

    // 2. Element Processing (HTMLVideoElement, HTMLImageElement, ImageBitmap)
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

        let targetW = srcWidth;
        let targetH = srcHeight;
        if (Math.max(targetW, targetH) > maxDimension) {
          if (targetW >= targetH) {
            targetH = Math.round((targetH * maxDimension) / targetW);
            targetW = maxDimension;
          } else {
            targetW = Math.round((targetW * maxDimension) / targetH);
            targetH = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(typeof source === 'string' ? source : '');
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(el, 0, 0, targetW, targetH);

        const resultDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(resultDataUrl || (typeof source === 'string' ? source : ''));
      } catch (err) {
        console.warn('Biometric normalization error:', err);
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

/**
 * Backward-compatible wrapper for square photo normalization.
 */
export async function normalizeImageToSquareDataUrl(
  source: HTMLVideoElement | HTMLImageElement | ImageBitmap | string,
  targetSize: number = 640,
  quality: number = 0.88
): Promise<string> {
  return normalizeImageForBiometrics(source, targetSize, quality);
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

  return normalizeImageForBiometrics(dataUrl, Math.max(maxWidth, maxHeight), quality);
}
