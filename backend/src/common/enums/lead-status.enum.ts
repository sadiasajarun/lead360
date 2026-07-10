/**
 * The lead lifecycle.
 *
 * Sales/PM:  generated -> pending_approval -> approved -> sent -> locked | lost
 *                              ^                  |
 *                              +-- rejected <-----+  (admin sends it back; the rep revises
 *                                                     and resubmits from `rejected`)
 *
 * Admin (own lead): generated -> sent -> locked | lost
 *   An admin IS the approver, so their own lead never queues. `markSent` still fires
 *   `lead.approved` so the deliverables are archived to the Database exactly as they would be
 *   for an approved rep lead — the status simply never parks on `approved`.
 *
 * `rejected` is a distinct status, not a bounce back to `generated`: a rejected lead must stay
 * visually and queryably different from an untouched draft.
 */
export enum LeadStatus {
  GENERATED = 'generated',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SENT = 'sent',
  LOCKED = 'locked',
  LOST = 'lost',
}

/** Statuses a lead can be resubmitted for approval from. */
export const RESUBMITTABLE: LeadStatus[] = [LeadStatus.GENERATED, LeadStatus.REJECTED];

/** Closed out — no further transitions, and excluded from open-pipeline value. */
export const TERMINAL_STATUSES: LeadStatus[] = [LeadStatus.LOCKED, LeadStatus.LOST];
