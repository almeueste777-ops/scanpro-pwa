import { jsPDF } from 'jspdf';
import type { DocumentPage, DocumentItem } from '../db';
import { loadImage } from './imageProcessing';

export interface PdfExportOptions {
  fileName: string;
  pageSize: 'a4' | 'letter' | 'fit';
  quality: 'high' | 'medium' | 'low';
  marginMm: number; // 0 for full bleed, 10 for standard
}

export async function generatePdfBlob(
  _doc: DocumentItem,
  pages: DocumentPage[],
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  if (pages.length === 0) {
    throw new Error('Documentul nu are pagini de exportat.');
  }

  const qualityJpeg = options.quality === 'high' ? 0.92 : options.quality === 'medium' ? 0.78 : 0.58;

  // Initialize jsPDF
  // We'll configure per page or standard
  const orientation = 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: options.pageSize === 'letter' ? 'letter' : 'a4'
  });

  const total = pages.length;

  for (let i = 0; i < total; i++) {
    if (onProgress) onProgress(i + 1, total);

    const page = pages[i];
    const img = await loadImage(page.processedImage || page.originalImage);

    const imgWidthPx = img.width;
    const imgHeightPx = img.height;
    const imgRatio = imgWidthPx / imgHeightPx;

    // Convert image to desired quality JPEG
    const canvas = document.createElement('canvas');
    canvas.width = imgWidthPx;
    canvas.height = imgHeightPx;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const jpegDataUrl = canvas.toDataURL('image/jpeg', qualityJpeg);

    let pageWidthMm = 210;
    let pageHeightMm = 297;

    if (options.pageSize === 'letter') {
      pageWidthMm = 215.9;
      pageHeightMm = 279.4;
    } else if (options.pageSize === 'fit') {
      // Calculate exact mm based on aspect ratio (target ~A4 height or width)
      if (imgRatio >= 1) {
        pageWidthMm = 297;
        pageHeightMm = 297 / imgRatio;
      } else {
        pageHeightMm = 297;
        pageWidthMm = 297 * imgRatio;
      }
    }

    if (i > 0) {
      pdf.addPage([pageWidthMm, pageHeightMm], imgRatio > 1 ? 'landscape' : 'portrait');
    } else {
      // Set first page dimensions
      pdf.setPage(1);
    }

    const margin = options.marginMm;
    const printableWidth = pageWidthMm - margin * 2;
    const printableHeight = pageHeightMm - margin * 2;
    const printableRatio = printableWidth / printableHeight;

    let drawWidth = printableWidth;
    let drawHeight = printableHeight;
    let offsetX = margin;
    let offsetY = margin;

    if (imgRatio > printableRatio) {
      // Image is wider than printable area
      drawWidth = printableWidth;
      drawHeight = printableWidth / imgRatio;
      offsetY = margin + (printableHeight - drawHeight) / 2;
    } else {
      // Image is taller than printable area
      drawHeight = printableHeight;
      drawWidth = printableHeight * imgRatio;
      offsetX = margin + (printableWidth - drawWidth) / 2;
    }

    pdf.addImage(jpegDataUrl, 'JPEG', offsetX, offsetY, drawWidth, drawHeight, undefined, 'FAST');
  }

  return pdf.output('blob');
}

/**
 * Downloads a Blob as a file
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Native Mobile Share Sheet using Web Share API
 */
export async function sharePdfFile(blob: Blob, fileName: string, title: string): Promise<boolean> {
  const validFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const file = new File([blob], validFileName, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: title || 'Document ScanPro',
        text: 'Document scanat cu ScanPro',
        files: [file]
      });
      return true;
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.warn('Share failed, fallback to download', e);
      }
      return false;
    }
  }

  // Fallback to download if Web Share is not supported
  downloadBlob(blob, validFileName);
  return true;
}
