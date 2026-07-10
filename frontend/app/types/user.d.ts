import type { UserRole } from '~/enums/role.enum';

// Team member row (GET /users) — no password hashes.
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

// Pending (unaccepted, unexpired) invitation (GET /users/invitations).
export interface PendingInvitation {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  createdAt: string;
}

// Result of POST /users/invite — the one-time signup link is returned once so the admin can share it.
export interface InviteResult {
  email: string;
  role: UserRole;
  expiresAt: string;
  inviteUrl: string;
  emailSent: boolean;
  note: string;
}
