import { jsPDF } from 'jspdf';
import type { DocumentPage, DocumentItem } from '../db';
import { loadImage } from './imageProcessing';

export interface PdfExportOptions {
  fileName: string;
  pageSize: 'a4' | 'letter' | 'fit';
  quality: 'high' | 'medium' | 'low';
  marginMm: number; // 0 for full bleed, 10 for standard
  watermarkText?: string; // Diagonal security watermark across each page
  showPageNumbers?: boolean; // Footer "Pagina X din Y"
  includeSearchableOcr?: boolean; // Embed OCR text layer in PDF
}

export async function generatePdfBlob(
  docItem: DocumentItem,
  pages: DocumentPage[],
  options: PdfExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  if (pages.length === 0) {
    throw new Error('Documentul nu are pagini de exportat.');
  }

  const qualityJpeg =
    options.quality === 'high' ? 0.92 : options.quality === 'medium' ? 0.78 : 0.58;

  const orientation = 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: options.pageSize === 'letter' ? 'letter' : 'a4'
  });

  // Set PDF metadata
  pdf.setProperties({
    title: docItem.title || options.fileName,
    creator: 'ScanPro PWA v2.1',
    subject: `Document scanat (${pages.length} pagini)`
  });

  const total = pages.length;

  for (let i = 0; i < total; i++) {
    if (onProgress) onProgress(i + 1, total);

    const page = pages[i];
    const img = await loadImage(page.processedImage || page.originalImage);

    const imgWidthPx = img.width;
    const imgHeightPx = img.height;
    const imgRatio = imgWidthPx / imgHeightPx;

    // Convert image to desired quality JPEG (with optional watermark baked cleanly onto canvas)
    const canvas = document.createElement('canvas');
    canvas.width = imgWidthPx;
    canvas.height = imgHeightPx;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    // Optional diagonal watermark rendered at full print resolution
    if (options.watermarkText && options.watermarkText.trim()) {
      const wm = options.watermarkText.trim().toUpperCase();
      ctx.save();
      ctx.translate(imgWidthPx / 2, imgHeightPx / 2);
      ctx.rotate(-Math.PI / 6);
      const fontSize = Math.max(24, Math.round(Math.min(imgWidthPx, imgHeightPx) * 0.048));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = 'rgba(180, 25, 25, 0.16)';
      ctx.textAlign = 'center';

      const stepY = fontSize * 4.5;
      for (let y = -imgHeightPx * 0.6; y <= imgHeightPx * 0.6; y += stepY) {
        ctx.fillText(wm, 0, y);
      }
      ctx.restore();
    }

    const jpegDataUrl = canvas.toDataURL('image/jpeg', qualityJpeg);

    let pageWidthMm = 210;
    let pageHeightMm = 297;

    if (options.pageSize === 'letter') {
      pageWidthMm = 215.9;
      pageHeightMm = 279.4;
    } else if (options.pageSize === 'fit') {
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
      pdf.setPage(1);
    }

    const margin = options.marginMm;
    const footerReserve = options.showPageNumbers ? 6 : 0;
    const printableWidth = pageWidthMm - margin * 2;
    const printableHeight = pageHeightMm - margin * 2 - footerReserve;
    const printableRatio = printableWidth / printableHeight;

    let drawWidth = printableWidth;
    let drawHeight = printableHeight;
    let offsetX = margin;
    let offsetY = margin;

    if (imgRatio > printableRatio) {
      drawWidth = printableWidth;
      drawHeight = printableWidth / imgRatio;
      offsetY = margin + (printableHeight - drawHeight) / 2;
    } else {
      drawHeight = printableHeight;
      drawWidth = printableHeight * imgRatio;
      offsetX = margin + (printableWidth - drawWidth) / 2;
    }

    // Embed searchable OCR text behind the scanned page image if available
    if (options.includeSearchableOcr && page.ocrText && page.ocrText.trim()) {
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      const lines = pdf.splitTextToSize(page.ocrText.trim(), drawWidth - 10);
      pdf.text(lines.slice(0, 65), offsetX + 5, offsetY + 10);
    }

    pdf.addImage(jpegDataUrl, 'JPEG', offsetX, offsetY, drawWidth, drawHeight, undefined, 'FAST');

    // Footer Page Numbers ("Pagina X din Y")
    if (options.showPageNumbers) {
      pdf.setFontSize(8.5);
      pdf.setTextColor(110, 110, 110);
      const footerStr = `${docItem.title}  •  Pagina ${i + 1} din ${total}`;
      pdf.text(footerStr, pageWidthMm / 2, pageHeightMm - 4, { align: 'center' });
    }
  }

  return pdf.output('blob');
}

/**
 * Exports the document (OCR text + high-res scanned pages) as a Microsoft Word (.doc) file
 */
export function exportToWordDoc(
  docItem: DocumentItem,
  pages: DocumentPage[],
  fileName: string
): void {
  const htmlParts: string[] = [
    `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>`,
    `<head><meta charset='utf-8'><title>${docItem.title}</title></head>`,
    `<body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">`,
    `<h1 style="font-size: 18pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">${docItem.title}</h1>`
  ];

  pages.forEach((p, idx) => {
    htmlParts.push(`<h3>Pagina ${idx + 1}</h3>`);
    if (p.ocrText && p.ocrText.trim()) {
      const escaped = p.ocrText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');
      htmlParts.push(
        `<div style="background:#f8fafc; padding:12px; border:1px solid #e2e8f0; margin-bottom:12px;">${escaped}</div>`
      );
    }
    const imgSrc = p.processedImage || p.originalImage;
    htmlParts.push(
      `<p><img src="${imgSrc}" style="max-width: 100%; height: auto; border: 1px solid #cbd5e1;" /></p>`
    );
    if (idx < pages.length - 1) {
      htmlParts.push(`<br clear="all" style="page-break-before:always" />`);
    }
  });

  htmlParts.push(`</body></html>`);

  const blob = new Blob(['\ufeff', htmlParts.join('\n')], {
    type: 'application/msword;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName.replace(/\.pdf$/i, '')}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
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

  downloadBlob(blob, validFileName);
  return true;
}
