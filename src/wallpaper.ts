type DrawableImage = HTMLImageElement;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read the selected wallpaper.'));
    reader.readAsDataURL(file);
  });
}

async function loadImage(source: string | File): Promise<{ image: DrawableImage; dispose: () => void }> {
  const imageSource = source instanceof File ? await readFileAsDataUrl(source) : source;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve({
      image,
      dispose: () => undefined,
    });
    image.onerror = () => {
      reject(new Error('Unable to decode the selected wallpaper.'));
    };
    image.src = imageSource;
  });
}

function createScaledCanvas(image: CanvasImageSource, sourceWidth: number, sourceHeight: number, maxDimension: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas is unavailable.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function renderImage(image: DrawableImage, maxDimension: number, quality: number): string {
  const canvas = createScaledCanvas(image, image.naturalWidth || image.width, image.naturalHeight || image.height, maxDimension);
  return canvas.toDataURL('image/webp', quality);
}

export async function optimizeWallpaperFile(file: File): Promise<{ wallpaperUrl: string }> {
  const { image, dispose } = await loadImage(file);
  try {
    return {
      wallpaperUrl: renderImage(image, 3200, 0.92),
    };
  } finally {
    dispose();
  }
}

export function applyWallpaperBlurPreview(blur: number): void {
  document.documentElement.style.setProperty('--zen-wallpaper-blur', `${blur}px`);
}
