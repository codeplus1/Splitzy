/**
 * Receipt processing & file compression helpers for Splitzy
 */

export interface ProcessedReceipt {
  dataUrl: string;
  fileName: string;
  fileSize: number;
}

/**
 * Formats file size in bytes to a human-readable string (KB/MB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Resizes and compresses an image client-side to ensure it stays within
 * storage and network constraints while maintaining high legibility.
 */
export async function processReceiptFile(file: File): Promise<ProcessedReceipt> {
  const isImage = file.type.startsWith('image/');

  if (!isImage) {
    // Non-image files (e.g. PDF) are read directly as DataURL
    const dataUrl = await readFileAsDataUrl(file);
    return {
      dataUrl,
      fileName: file.name,
      fileSize: file.size,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = e => {
      const src = e.target?.result as string;
      const img = new Image();

      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.onload = () => {
        try {
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1600;
          let { width, height } = img;

          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return resolve({
              dataUrl: src,
              fileName: file.name,
              fileSize: file.size,
            });
          }

          // Fill white background for transparency handling
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // Export as compressed JPEG
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          // Estimate byte size from Base64
          const base64Length = compressedDataUrl.length - (compressedDataUrl.indexOf(',') + 1);
          const estimatedSize = Math.round((base64Length * 3) / 4);

          resolve({
            dataUrl: compressedDataUrl,
            fileName: file.name,
            fileSize: estimatedSize,
          });
        } catch {
          // Fallback to original
          resolve({
            dataUrl: src,
            fileName: file.name,
            fileSize: file.size,
          });
        }
      };

      img.src = src;
    };

    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Resizes and center-crops an uploaded profile photo into a compact 256x256 JPEG data URL
 * so it syncs instantaneously across Firestore and renders crisply in avatars.
 */
export async function processAvatarImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file (PNG, JPG, WEBP).');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = e => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image.'));
      img.onload = () => {
        try {
          const TARGET_SIZE = 256;
          const canvas = document.createElement('canvas');
          canvas.width = TARGET_SIZE;
          canvas.height = TARGET_SIZE;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return resolve(src);
          }

          // Center square crop
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, TARGET_SIZE, TARGET_SIZE);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl);
        } catch {
          resolve(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
