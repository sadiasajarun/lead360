import { httpService } from '../httpService';
import type { AuditEntry } from '~/types/audit';

// Recent audit entries (approvals, imports, settings changes), newest first.
export async function getAudit(limit = 50): Promise<AuditEntry[]> {
  const res = await httpService.get(`/audit?limit=${limit}`);
  return res.data.data as AuditEntry[];
}
