import { createWorker } from 'tesseract.js';

export async function recognizeTextFromImage(
  imageDataUrl: string,
  language: 'ron+eng' | 'eng' | 'ron' = 'ron+eng',
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  const worker = await createWorker(language, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round((m.progress || 0) * 100), 'Recunoaștere text în curs...');
      } else if (onProgress) {
        onProgress(Math.round((m.progress || 0) * 100), m.status || 'Inițializare OCR...');
      }
    }
  });

  try {
    const ret = await worker.recognize(imageDataUrl);
    await worker.terminate();
    return ret.data.text.trim();
  } catch (err) {
    await worker.terminate();
    throw err;
  }
}
