import { httpService } from '../httpService';
import { UserRole } from '~/enums/role.enum';
import type { InviteResult, PendingInvitation, TeamMember } from '~/types/user';

// Team list (Settings → Team & Roles).
export async function getTeam(): Promise<TeamMember[]> {
  const res = await httpService.get('/users');
  return res.data.data as TeamMember[];
}

// Pending (unaccepted, unexpired) invitations.
export async function getInvitations(): Promise<PendingInvitation[]> {
  const res = await httpService.get('/users/invitations');
  return res.data.data as PendingInvitation[];
}

// Invite a user by email; returns the one-time signup link (email delivery is disabled).
export async function inviteUser(email: string, role: UserRole): Promise<InviteResult> {
  const res = await httpService.post('/users/invite', { email, role });
  return res.data.data as InviteResult;
}

// Revoke a pending invitation.
export async function revokeInvitation(id: string): Promise<void> {
  await httpService.delete(`/users/invitations/${id}`);
}

// Change a user's role (400 on self-demotion / last active admin).
export async function setUserRole(id: string, role: UserRole): Promise<void> {
  await httpService.patch(`/users/${id}/role`, { role });
}

// Activate / deactivate a user (400 on self-deactivation / last active admin).
export async function setUserActive(id: string, isActive: boolean): Promise<void> {
  await httpService.patch(`/users/${id}/active`, { isActive });
}
