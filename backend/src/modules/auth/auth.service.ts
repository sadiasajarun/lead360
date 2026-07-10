import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { TokenService, JwtPayload } from '../../infrastructure/token/token.service';
import { User } from '../user/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { StorageService } from '../../infrastructure/s3/storage.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly tokens: TokenService,
    private readonly storage: StorageService,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmailWithPassword(email);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  // Display name falls back to the email's unique local part ("farah.karim@..." -> "farah.karim")
  // until the user sets one (user decision 2026-07-09).
  private displayName(user: User) {
    return user.name?.trim() || user.email.split('@')[0];
  }

  private sanitize(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: this.displayName(user),
      role: user.role,
      // Cache-busted so a freshly uploaded photo replaces the old one in the browser immediately.
      avatarUrl: user.avatarKey ? `/auth/me/avatar?v=${encodeURIComponent(user.updatedAt.toISOString())}` : null,
      preferences: user.preferences ?? {},
    };
  }

  /** Personal defaults; unknown keys are dropped so the shape stays predictable. */
  async updatePreferences(userId: string, patch: Record<string, unknown>) {
    const ALLOWED = ['defaultTemplate', 'defaultCurrency', 'proposalTheme', 'language'];
    const user = await this.users.findByIdOrFail(userId);
    const clean: Record<string, unknown> = { ...(user.preferences ?? {}) };
    for (const [k, v] of Object.entries(patch)) if (ALLOWED.includes(k)) clean[k] = v;
    await this.users.update(userId, { preferences: clean });
    return this.me(userId);
  }

  /** Store a profile photo through the storage adapter (local disk in dev, S3 in prod). */
  async setAvatar(userId: string, file: { originalname: string; buffer: Buffer; mimetype: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.mimetype)) {
      throw new BadRequestException('Profile photo must be a PNG, JPG or WebP image');
    }
    if (file.buffer.length > 2 * 1024 * 1024) throw new BadRequestException('Profile photo must be under 2 MB');

    const user = await this.users.findByIdOrFail(userId);
    const ext = (file.originalname.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `avatars/${userId}.${ext}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    // Replacing a photo with a different extension would orphan the old object.
    if (user.avatarKey && user.avatarKey !== key) {
      await this.storage.delete(user.avatarKey).catch(() => undefined);
    }
    await this.users.update(userId, { avatarKey: key });
    return this.me(userId);
  }

  /** Stream the stored photo back. */
  async getAvatar(userId: string) {
    const user = await this.users.findByIdOrFail(userId);
    if (!user.avatarKey) throw new NotFoundException('No profile photo');
    const buffer = await this.storage.getObject(user.avatarKey);
    const ext = user.avatarKey.split('.').pop() ?? 'png';
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return { buffer, mime };
  }

  async removeAvatar(userId: string) {
    const user = await this.users.findByIdOrFail(userId);
    if (user.avatarKey) await this.storage.delete(user.avatarKey).catch(() => undefined);
    await this.users.update(userId, { avatarKey: null as unknown as string });
    return this.me(userId);
  }

  // Full profile for GET /auth/me — the JWT only carries id/email/role, so read the DB user.
  async me(userId: string) {
    const user = await this.users.findByIdOrFail(userId);
    return this.sanitize(user as User);
  }

  // Update own display name (PATCH /auth/me).
  async updateProfile(userId: string, name: string) {
    const clean = name.trim().slice(0, 80);
    await this.users.update(userId, { name: clean });
    return this.me(userId);
  }

  // Issue an access+refresh pair and persist the refresh token's HASH so it can be rotated/revoked.
  private async issue(user: User) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.tokens.signAccess(payload);
    const refreshToken = this.tokens.signRefresh(payload);
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: this.tokens.getExpiry(refreshToken),
      }),
    );
    return {
      user: this.sanitize(user),
      accessToken,
      refreshToken,
    };
  }

  async login(email: string, password: string) {
    return this.issue(await this.validateUser(email, password));
  }

  // Rotation + revocation: the presented refresh token must exist in the store (else it has been
  // revoked or already used — reuse detection). The used hash is deleted before a new pair is issued.
  async refresh(token: string) {
    if (!token) throw new UnauthorizedException('No refresh token');
    let payload: JwtPayload;
    try {
      payload = this.tokens.verifyRefresh(token);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const stored = await this.refreshTokens.findOne({ where: { tokenHash: this.hash(token) } });
    if (!stored) throw new UnauthorizedException('Refresh token revoked or already used');
    await this.refreshTokens.delete({ id: stored.id }); // rotation: one-time use
    await this.refreshTokens.delete({ expiresAt: LessThan(new Date()) }); // opportunistic cleanup
    return this.issue(await this.users.findByIdOrFail(payload.sub));
  }

  // Revoke a refresh token (logout). Best-effort — works even if the token is expired/absent.
  async revoke(token?: string) {
    if (token) await this.refreshTokens.delete({ tokenHash: this.hash(token) });
    return { ok: true };
  }

  // Re-authentication for destructive actions (e.g. Database "delete all" requires the password).
  // Same failure shape as login — no user enumeration.
  async verifyPassword(userId: string, password: string) {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Password is incorrect');
    return { valid: true };
  }

  // Verify the current password, store the new hash, revoke every existing refresh token
  // (logs out other sessions), then issue a fresh pair so this session's cookies stay valid.
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.update(userId, { passwordHash });
    await this.refreshTokens.delete({ userId });
    return this.issue(user);
  }
}
