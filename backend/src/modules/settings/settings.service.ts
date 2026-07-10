import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrgSetting } from './org-setting.entity';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../../infrastructure/s3/storage.service';
import { LossReason, TemplateType } from '../../common/enums';

/**
 * Section defaults. A GET always returns a complete object (defaults merged under whatever is
 * stored), so the UI never has to invent a fallback value.
 */
export const SECTION_DEFAULTS: Record<string, Record<string, unknown>> = {
  branding: {
    companyName: 'Riseup Labs',
    website: 'riseuplabs.com',
    contactEmail: 'hello@riseuplabs.com',
    primaryColor: '#EA5400',
    textColor: '#1A1715',
    fileNaming: '{Client}-{Type}-{Date}',
    footerText: 'Riseup Labs · riseuplabs.com · Confidential',
    /** Object-storage key of an uploaded logo; null = use the bundled Riseup mark. */
    logoKey: null,
  },
  approvals: {
    requireAdminApproval: true,
    readinessThreshold: 80,
    lossReasons: Object.values(LossReason),
  },
  templates: {
    defaultTemplate: TemplateType.GLOBAL,
  },
  delivery: {
    emailEnabled: false, // mirrors EMAIL_ENABLED; the toggle can't switch it on by itself
    provider: 'ses',
    smtpHost: '',
    fromAddress: '',
    replyTo: '',
    slackEnabled: false,
    zoomEnabled: false,
  },
  security: {
    signInMethod: 'email_password',
    sessionTimeoutHours: 8,
    minPasswordLength: 8,
  },
  currency: {
    // Head-cost sheet's own header value. BDT budget prices are read from the sheet, never derived
    // from this rate — it exists for display and for non-sheet figures.
    usdBdt: 120,
    vatPercent: 0,
    syncedAt: null,
    syncSource: null,
    /** USD -> X. Seeded with a sane fallback so a budget can price before the first sync. */
    rates: { USD: 1, GBP: 0.79, EUR: 0.92, CAD: 1.36, AUD: 1.52, CNY: 7.25, JPY: 157, INR: 83.4 },
  },
};

export const SECTIONS = Object.keys(SECTION_DEFAULTS);

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(OrgSetting) private readonly repo: Repository<OrgSetting>,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  private assertSection(section: string) {
    if (!SECTIONS.includes(section)) throw new BadRequestException(`Unknown settings section "${section}"`);
  }

  /** Every section, defaults merged under stored overrides. */
  async all() {
    const rows = await this.repo.find();
    const stored = new Map(rows.map((r) => [r.section, r.value]));
    const out: Record<string, Record<string, unknown>> = {};
    for (const s of SECTIONS) out[s] = { ...SECTION_DEFAULTS[s], ...(stored.get(s) ?? {}) };

    // Email can only truly run when the environment allows it — surface that instead of letting the
    // toggle imply a capability the deployment doesn't have.
    out.delivery.emailEnabledEnv = this.config.get<string>('EMAIL_ENABLED') === 'true';
    return out;
  }

  async get(section: string) {
    this.assertSection(section);
    const row = await this.repo.findOne({ where: { section } });
    return { ...SECTION_DEFAULTS[section], ...(row?.value ?? {}) };
  }

  /** Merge a partial patch into a section. Unknown keys are dropped, so the shape stays predictable. */
  async update(section: string, patch: Record<string, unknown>, adminId: string) {
    this.assertSection(section);
    const allowed = Object.keys(SECTION_DEFAULTS[section]);
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (allowed.includes(k)) clean[k] = v;

    if (section === 'approvals' && clean.readinessThreshold !== undefined) {
      const n = Number(clean.readinessThreshold);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new BadRequestException('Readiness threshold must be 0-100');
      clean.readinessThreshold = Math.round(n);
    }
    if (section === 'security' && clean.minPasswordLength !== undefined) {
      const n = Number(clean.minPasswordLength);
      if (!Number.isFinite(n) || n < 8 || n > 64) throw new BadRequestException('Minimum password length must be 8-64');
      clean.minPasswordLength = Math.round(n);
    }
    if (section === 'delivery' && clean.emailEnabled === true && this.config.get<string>('EMAIL_ENABLED') !== 'true') {
      throw new BadRequestException('Email delivery is disabled in this environment (EMAIL_ENABLED=false)');
    }
    if (section === 'currency' && clean.usdBdt !== undefined) {
      const n = Number(clean.usdBdt);
      if (!Number.isFinite(n) || n <= 0 || n > 1000) throw new BadRequestException('USD→BDT rate looks wrong');
      clean.usdBdt = Math.round(n * 100) / 100;
    }
    if (section === 'currency' && clean.rates !== undefined) {
      const r = clean.rates as Record<string, unknown>;
      if (!r || typeof r !== 'object' || Number(r.USD) !== 1) {
        throw new BadRequestException('FX rates must be relative to USD (USD must equal 1)');
      }
      for (const [k, v] of Object.entries(r)) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) throw new BadRequestException(`Invalid FX rate for ${k}`);
      }
    }
    if (section === 'currency' && clean.vatPercent !== undefined) {
      const n = Number(clean.vatPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new BadRequestException('VAT must be 0-100');
      clean.vatPercent = Math.round(n * 100) / 100;
    }

    const existing = await this.repo.findOne({ where: { section } });
    const before = existing?.value ?? {};
    const value = { ...before, ...clean };
    if (existing) {
      existing.value = value;
      existing.updatedById = adminId;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ section, value, updatedById: adminId }));
    }

    await this.audit.log({ actorId: adminId, action: 'settings.update', entity: 'OrgSetting', entityId: section, before, after: value });
    return { ...SECTION_DEFAULTS[section], ...value };
  }

  /**
   * Pull the live USD→BDT rate from a public FX API and store it.
   *
   * NOTE: the Generation-Engine spec §10 said "no live FX lookups". The user overruled that on
   * 2026-07-10. It is safe because BDT budget prices still come from the head-cost sheet's own BDT
   * columns — this rate is only for display and for converting figures that aren't on the sheet.
   */
  async syncFx(adminId: string) {
    // Configurable so a locked-down environment can point at an allow-listed mirror or proxy.
    const url = this.config.get<string>('FX_API_URL', 'https://open.er-api.com/v6/latest/USD');
    let all: Record<string, number> | undefined;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`FX provider returned ${res.status}`);
      const body = (await res.json()) as { rates?: Record<string, number> };
      all = body.rates;
    } catch (e) {
      throw new BadRequestException(`Could not reach the FX provider: ${(e as Error).message}`);
    }
    if (!all?.BDT) throw new BadRequestException('FX provider did not return usable rates');

    const wanted = ['USD', 'BDT', 'GBP', 'EUR', 'CAD', 'AUD', 'CNY', 'JPY', 'INR'];
    const rates: Record<string, number> = { USD: 1 };
    const missing: string[] = [];
    for (const c of wanted) {
      const n = Number(all[c]);
      if (c === 'USD') continue;
      if (Number.isFinite(n) && n > 0) rates[c] = n;
      else missing.push(c);
    }
    if (missing.length) this.logger.warn(`FX provider omitted: ${missing.join(', ')} — previous values kept.`);

    const current = (await this.get('currency')) as { rates?: Record<string, number> };
    const merged = { ...(current.rates ?? {}), ...rates };

    return this.update(
      'currency',
      { usdBdt: rates.BDT, rates: merged, syncedAt: new Date().toISOString(), syncSource: 'open.er-api.com' },
      adminId,
    );
  }

  /** Store a replacement company logo; it replaces the bundled mark in the app and in every PDF. */
  async setLogo(file: { originalname: string; buffer: Buffer; mimetype: string }, adminId: string) {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/i.test(file.mimetype)) {
      throw new BadRequestException('Logo must be a PNG, JPG, SVG or WebP image');
    }
    if (file.buffer.length > 2 * 1024 * 1024) throw new BadRequestException('Logo must be under 2 MB');

    const ext = (file.originalname.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `branding/logo.${ext}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const current = (await this.get('branding')) as { logoKey?: string | null };
    if (current.logoKey && current.logoKey !== key) {
      await this.storage.delete(current.logoKey).catch(() => undefined);
    }
    return this.update('branding', { logoKey: key }, adminId);
  }

  /** Raw logo bytes, or null when no custom logo is set (callers fall back to the bundled mark). */
  async getLogo(): Promise<{ buffer: Buffer; mime: string } | null> {
    const b = (await this.get('branding')) as { logoKey?: string | null };
    if (!b.logoKey) return null;
    try {
      const buffer = await this.storage.getObject(b.logoKey);
      const ext = b.logoKey.split('.').pop() ?? 'png';
      const mime =
        ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
      return { buffer, mime };
    } catch {
      return null; // key points at a missing object — degrade to the bundled logo
    }
  }

  async removeLogo(adminId: string) {
    const b = (await this.get('branding')) as { logoKey?: string | null };
    if (b.logoKey) await this.storage.delete(b.logoKey).catch(() => undefined);
    return this.update('branding', { logoKey: null }, adminId);
  }

  /** USD -> `currency` multiplier, from the last synced rates. Throws when the currency is unknown. */
  async fxRate(currency: string): Promise<number> {
    const cur = (await this.get('currency')) as { rates?: Record<string, number> };
    const rate = Number(cur.rates?.[currency.toUpperCase()]);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new BadRequestException(`No FX rate on file for ${currency} — sync rates in Settings → Currency & FX`);
    }
    return rate;
  }
}
