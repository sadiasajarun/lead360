// A single audit-log entry (GET /audit) — approvals, imports, and setting changes, newest first.
export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  actor: string | null;
}
