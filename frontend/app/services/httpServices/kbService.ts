import { httpService } from '../httpService';
import type { KbDocument, KbTrashItem, KbUploadResult } from '~/types/kb';

// Read-only catalog of the Riseup Proposal & Budget Database (source docs for RAG grounding).
export async function getKbDocuments(): Promise<KbDocument[]> {
  const res = await httpService.get('/kb/documents');
  return res.data.data as KbDocument[];
}

// Fetch a stored KB document through the authenticated axios client (cookies + 401-refresh) and
// either open it in a new tab (preview) or trigger a browser download — robust vs. cross-port <a> links.
export async function openKbFile(id: string, mode: 'view' | 'download', filename: string): Promise<void> {
  const res = await httpService.get(`/kb/documents/${id}/${mode}`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  if (mode === 'view') {
    window.open(url, '_blank', 'noopener');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Add a document into the Database — stored (downloadable) + embedded for RAG. `name` (optional)
// becomes the display title. Override the JSON Content-Type so the browser sets the multipart boundary.
export async function uploadKbDocument(file: File, category: string, section: string, name?: string): Promise<KbUploadResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('category', category);
  fd.append('section', section);
  if (name?.trim()) fd.append('name', name.trim());
  const res = await httpService.post('/kb/documents/upload', fd, { headers: { 'Content-Type': undefined } });
  return res.data.data as KbUploadResult;
}

// Update a document's display title and/or tags (tags replace the full set).
export async function updateKbDocument(id: string, patch: { title?: string; tags?: string[] }) {
  const res = await httpService.patch(`/kb/documents/${id}`, patch);
  return res.data.data;
}

// Move a document to Trash (30-day retention; its knowledge leaves RAG immediately).
export async function trashKbDocument(id: string) {
  const res = await httpService.delete(`/kb/documents/${id}`);
  return res.data.data;
}

// --- Trash (Settings > Trash) ---
export async function getKbTrash(): Promise<KbTrashItem[]> {
  const res = await httpService.get('/kb/trash');
  return res.data.data as KbTrashItem[];
}

export async function restoreKbDocument(id: string) {
  const res = await httpService.post(`/kb/trash/${id}/restore`, {});
  return res.data.data;
}

export async function purgeKbDocument(id: string) {
  const res = await httpService.delete(`/kb/trash/${id}`);
  return res.data.data;
}

export async function purgeKbTrash(payload: { ids?: string[]; all?: boolean }) {
  const res = await httpService.post('/kb/trash/purge', payload);
  return res.data.data;
}
