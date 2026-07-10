import { httpService } from '../httpService';
import type { BrandingSettings, CurrencySettings, OrgSettings, SettingsSection } from '~/types/settings';

// All organisation settings (defaults merged under stored overrides — always complete).
export async function getSettings(): Promise<OrgSettings> {
  const res = await httpService.get('/settings');
  return res.data.data as OrgSettings;
}

// Update one section (admin). Unknown keys are dropped server-side; the refreshed section is returned.
export async function updateSettingsSection<K extends SettingsSection>(
  section: K,
  patch: Partial<OrgSettings[K]>,
): Promise<OrgSettings[K]> {
  const res = await httpService.put(`/settings/${section}`, patch);
  return res.data.data as OrgSettings[K];
}

// Fetch the live USD→BDT rate and store it (admin). 400s if the FX provider is unreachable.
export async function syncCurrency(): Promise<CurrencySettings> {
  const res = await httpService.post('/settings/currency/sync', {});
  return res.data.data as CurrencySettings;
}

// Upload a custom company logo (PNG/JPG/SVG/WebP ≤2 MB, admin). Override the JSON Content-Type so the
// browser sets multipart/form-data with the correct boundary. Returns the branding section incl. logoKey.
export async function uploadBrandingLogo(file: File): Promise<BrandingSettings> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await httpService.post('/settings/branding/logo', fd, { headers: { 'Content-Type': undefined } });
  return res.data.data as BrandingSettings;
}

// Remove the custom logo (admin) — falls back to the bundled Riseup mark.
export async function removeBrandingLogo(): Promise<BrandingSettings> {
  const res = await httpService.delete('/settings/branding/logo');
  return res.data.data as BrandingSettings;
}
