import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Invitation } from './invitation.entity';
import { User } from './user.entity';
import { UserRepository } from './user.repository';
import { UserRole } from '../../common/enums';
import { PASSWORD_REGEX, passwordProblems } from '../../common/utils/password-policy';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    @InjectRepository(Invitation) private readonly invites: Repository<Invitation>,
    private readonly users: UserRepository,
    private readonly config: ConfigService,
  ) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Team list for Settings → Team & Roles (no password hashes). */
  async listTeam() {
    const users = await this.users.findAll({ order: { createdAt: 'ASC' } });
    return users.map((u: User) => ({
      id: u.id,
      name: u.name || u.email.split('@')[0],
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }));
  }

  /** Pending (unaccepted, unexpired) invitations, shown alongside the team list. */
  async listPending() {
    const rows = await this.invites.find({ order: { createdAt: 'DESC' } });
    const now = Date.now();
    return rows
      .filter((i) => !i.acceptedAt && new Date(i.expiresAt).getTime() > now)
      .map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, createdAt: i.createdAt }));
  }

  /**
   * Invite a user by email. The raw token is returned ONCE so the admin can hand over the signup
   * link — email delivery is built but disabled (EMAIL_ENABLED=false), so we never pretend to send.
   */
  async invite(email: string, invitedById: string, role: UserRole = UserRole.SALES_PM) {
    const clean = email.trim().toLowerCase();
    if (await this.users.findByEmail(clean)) {
      throw new ConflictException('That email already has a Lead360 account');
    }
    // Re-inviting the same address replaces the old (unaccepted) invitation rather than piling up.
    const existing = await this.invites.findOne({ where: { email: clean } });
    if (existing && !existing.acceptedAt) await this.invites.remove(existing);

    const token = randomBytes(32).toString('hex');
    await this.invites.save(
      this.invites.create({
        email: clean,
        tokenHash: this.hash(token),
        role,
        invitedById,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      }),
    );

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:5173');
    const inviteUrl = `${appUrl}/invite/${token}`;
    const emailEnabled = this.config.get<string>('EMAIL_ENABLED') === 'true';

    if (emailEnabled) {
      // Wire a real MailService here when email is turned on for production.
      this.logger.warn(`EMAIL_ENABLED=true but no mail transport is configured; invite link not sent to ${clean}.`);
    }

    return {
      email: clean,
      role,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      inviteUrl, // shown once to the admin to copy/share
      emailSent: false,
      note: emailEnabled
        ? 'Email transport is not configured — share the link manually.'
        : 'Email delivery is disabled in this environment — share the link manually.',
    };
  }

  /** Public: validate a token before showing the signup form. */
  async peek(token: string) {
    const invite = await this.invites.findOne({ where: { tokenHash: this.hash(token) } });
    if (!invite) throw new NotFoundException('This invitation link is not valid');
    if (invite.acceptedAt) throw new BadRequestException('This invitation has already been used');
    if (new Date(invite.expiresAt).getTime() < Date.now()) throw new BadRequestException('This invitation has expired');
    return { email: invite.email, role: invite.role };
  }

  /** Public: consume the invitation and create the account. */
  async accept(token: string, name: string, password: string) {
    const invite = await this.invites.findOne({ where: { tokenHash: this.hash(token) } });
    if (!invite) throw new NotFoundException('This invitation link is not valid');
    if (invite.acceptedAt) throw new BadRequestException('This invitation has already been used');
    if (new Date(invite.expiresAt).getTime() < Date.now()) throw new BadRequestException('This invitation has expired');

    if (!PASSWORD_REGEX.test(password)) {
      throw new BadRequestException(`Password is too weak — needs: ${passwordProblems(password).join(', ')}`);
    }
    if (await this.users.findByEmail(invite.email)) {
      throw new ConflictException('That email already has a Lead360 account');
    }

    const user = await this.users.create({
      email: invite.email,
      name: name.trim().slice(0, 80) || invite.email.split('@')[0],
      passwordHash: await bcrypt.hash(password, 10),
      role: invite.role,
      isActive: true,
    });

    invite.acceptedAt = new Date();
    await this.invites.save(invite);
    this.logger.log(`Invitation accepted: ${invite.email} (${invite.role})`);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  /** Admin: change a user's role. The last active admin can't demote themselves out of existence. */
  async setRole(id: string, role: UserRole, adminId: string) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.ADMIN && role !== UserRole.ADMIN) await this.assertNotLastAdmin(id);
    if (id === adminId && role !== UserRole.ADMIN) {
      throw new BadRequestException('You cannot remove your own admin role');
    }
    await this.users.update(id, { role });
    return { id, role };
  }

  /** Admin: deactivate (soft) — the account stays for history but can no longer sign in. */
  async setActive(id: string, isActive: boolean, adminId: string) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (!isActive) {
      if (id === adminId) throw new BadRequestException('You cannot deactivate your own account');
      if (user.role === UserRole.ADMIN) await this.assertNotLastAdmin(id);
    }
    await this.users.update(id, { isActive });
    return { id, isActive };
  }

  /** Never leave the org without an admin. */
  private async assertNotLastAdmin(excludingId: string) {
    const all = await this.users.findAll();
    const admins = all.filter((u: User) => u.role === UserRole.ADMIN && u.isActive && u.id !== excludingId);
    if (!admins.length) throw new BadRequestException('This is the last active admin — promote someone else first');
  }

  /** Admin: revoke a pending invitation. */
  async revoke(id: string) {
    const invite = await this.invites.findOne({ where: { id } });
    if (!invite) throw new NotFoundException('Invitation not found');
    await this.invites.remove(invite);
    return { id, revoked: true };
  }

  /** Housekeeping: drop expired, unaccepted invitations. */
  async purgeExpired() {
    const { affected } = await this.invites.delete({ expiresAt: LessThan(new Date()), acceptedAt: undefined });
    if (affected) this.logger.log(`Purged ${affected} expired invitation(s).`);
  }
}
