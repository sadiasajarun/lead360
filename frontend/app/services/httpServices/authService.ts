import { createAsyncThunk } from '@reduxjs/toolkit';
import { httpService } from '../httpService';
import type { AuthUser, UserPreferences } from '~/types/auth';

// READ op -> thunk (validates the session on app load).
export const fetchMe = createAsyncThunk('auth/me', async () => {
  const res = await httpService.get('/auth/me');
  return res.data.data as AuthUser;
});

// MUTATION ops -> plain service calls.
export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await httpService.post('/auth/login', { email, password });
  return res.data.data.user as AuthUser;
}

export async function logout(): Promise<void> {
  await httpService.post('/auth/logout');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await httpService.post('/auth/change-password', { currentPassword, newPassword });
}

// Re-authentication for destructive actions (e.g. Database "delete all"). Throws 401 when wrong.
export async function verifyPassword(password: string): Promise<void> {
  await httpService.post('/auth/verify-password', { password });
}

// Update own display name; server returns the fresh profile.
export async function updateProfile(name: string): Promise<AuthUser> {
  const res = await httpService.patch('/auth/me', { name });
  return res.data.data as AuthUser;
}

// Update personal defaults (template, currency, theme, language). Server returns the fresh profile.
export async function updatePreferences(patch: UserPreferences): Promise<AuthUser> {
  const res = await httpService.patch('/auth/me/preferences', patch);
  return res.data.data as AuthUser;
}

// Upload a profile photo (PNG/JPG/WebP, ≤2 MB). Override the JSON Content-Type so the browser
// sets the multipart boundary (same pattern as kbService.uploadKbDocument). Returns fresh profile.
export async function uploadAvatar(file: File): Promise<AuthUser> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await httpService.post('/auth/me/avatar', fd, { headers: { 'Content-Type': undefined } });
  return res.data.data as AuthUser;
}

export async function removeAvatar(): Promise<AuthUser> {
  const res = await httpService.delete('/auth/me/avatar');
  return res.data.data as AuthUser;
}
