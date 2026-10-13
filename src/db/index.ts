import Dexie, { type Table } from 'dexie';

export interface Point {
  x: number;
  y: number;
}

export interface DocumentCorners {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export type FilterType = 'magic' | 'bw' | 'grayscale' | 'sharp' | 'original';

export interface DocumentPage {
  id: string;
  documentId: string;
  pageNumber: number;
  originalImage: string; // Base64 data URL
  processedImage: string; // Base64 data URL with perspective & filter applied
  thumbnail: string;
  width: number;
  height: number;
  corners?: DocumentCorners;
  filter: FilterType;
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  rotation: number; // 0, 90, 180, 270
  ocrText?: string;
  createdAt: number;
}

export interface DocumentItem {
  id: string;
  title: string;
  category: 'general' | 'facturi' | 'contracte' | 'acte' | 'notite';
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  thumbnail: string;
}

export class ScanProDatabase extends Dexie {
  documents!: Table<DocumentItem, string>;
  pages!: Table<DocumentPage, string>;

  constructor() {
    super('ScanProDB');
    this.version(1).stores({
      documents: 'id, title, category, createdAt, updatedAt',
      pages: 'id, documentId, pageNumber, createdAt'
    });
  }
}

export const db = new ScanProDatabase();

// Helper to create a new document
export async function createDocument(title?: string, category: DocumentItem['category'] = 'general'): Promise<DocumentItem> {
  const now = Date.now();
  const dateStr = new Date(now).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const timeStr = new Date(now).toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const doc: DocumentItem = {
    id: crypto.randomUUID(),
    title: title || `Scanare ${dateStr} ${timeStr}`,
    category,
    createdAt: now,
    updatedAt: now,
    pageCount: 0,
    thumbnail: ''
  };

  await db.documents.add(doc);
  return doc;
}

// Helper to add a page to a document
export async function addPageToDocument(documentId: string, pageData: Omit<DocumentPage, 'id' | 'documentId' | 'pageNumber' | 'createdAt'>): Promise<DocumentPage> {
  const pages = await db.pages.where('documentId').equals(documentId).sortBy('pageNumber');
  const nextNumber = pages.length + 1;
  const now = Date.now();

  const newPage: DocumentPage = {
    ...pageData,
    id: crypto.randomUUID(),
    documentId,
    pageNumber: nextNumber,
    createdAt: now
  };

  await db.pages.add(newPage);

  // Update document metadata
  const doc = await db.documents.get(documentId);
  if (doc) {
    const updatedThumbnail = nextNumber === 1 ? newPage.thumbnail : doc.thumbnail;
    await db.documents.update(documentId, {
      pageCount: nextNumber,
      thumbnail: updatedThumbnail || newPage.thumbnail,
      updatedAt: now
    });
  }

  return newPage;
}

// Delete page and reorder remaining pages
export async function deletePage(pageId: string): Promise<void> {
  const page = await db.pages.get(pageId);
  if (!page) return;

  const docId = page.documentId;
  await db.pages.delete(pageId);

  // Reorder remaining pages
  const remaining = await db.pages.where('documentId').equals(docId).sortBy('pageNumber');
  for (let i = 0; i < remaining.length; i++) {
    await db.pages.update(remaining[i].id, { pageNumber: i + 1 });
  }

  const firstPage = remaining[0];
  await db.documents.update(docId, {
    pageCount: remaining.length,
    thumbnail: firstPage ? firstPage.thumbnail : '',
    updatedAt: Date.now()
  });
}

// Delete entire document and its pages
export async function deleteDocument(documentId: string): Promise<void> {
  await db.pages.where('documentId').equals(documentId).delete();
  await db.documents.delete(documentId);
}
