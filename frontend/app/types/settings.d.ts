// Organization-wide settings (GET /settings). Every section returns a COMPLETE object (server merges
// defaults under stored overrides), so the UI never invents a fallback value.

export interface BrandingSettings {
  companyName: string;
  website: string;
  contactEmail: string;
  primaryColor: string;
  textColor: string;
  fileNaming: string;
  footerText: string;
  /** Storage key of the uploaded custom logo, or null when the bundled Riseup mark is in use. */
  logoKey: string | null;
  /** Default Riseup signatory on the proposal sign-off ("For Riseup Labs") — used when the brief names none. */
  signatoryName: string;
  signatoryTitle: string;
}

export interface ApprovalsSettings {
  requireAdminApproval: boolean;
  readinessThreshold: number;
  lossReasons: string[];
}

export interface TemplatesSettings {
  /** 'global' | 'local' | 'agency' | 'design_portfolio' */
  defaultTemplate: string;
}

export interface DeliverySettings {
  emailEnabled: boolean;
  provider: string;
  smtpHost: string;
  fromAddress: string;
  replyTo: string;
  slackEnabled: boolean;
  zoomEnabled: boolean;
  /** Whether EMAIL_ENABLED=true in the deployment. When false the toggle can't be switched on. */
  emailEnabledEnv: boolean;
}

export interface SecuritySettings {
  signInMethod: string;
  sessionTimeoutHours: number;
  minPasswordLength: number;
}

export interface CurrencySettings {
  usdBdt: number;
  vatPercent: number;
  syncedAt: string | null;
  syncSource: string | null;
}

export interface OrgSettings {
  branding: BrandingSettings;
  approvals: ApprovalsSettings;
  templates: TemplatesSettings;
  delivery: DeliverySettings;
  security: SecuritySettings;
  currency: CurrencySettings;
}

export type SettingsSection = keyof OrgSettings;
