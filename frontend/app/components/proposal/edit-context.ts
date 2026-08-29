import { createContext } from 'react';
import type { BlockExplain } from '~/types/generation';

/**
 * Optional block-edit hook for the rendered proposal. When present (lead-detail, non-archived),
 * editable blocks (e.g. Financial pricing) expose inline editing that persists via this callback;
 * when null (public /present view), blocks render read-only.
 */
export type SaveBlock = (blockId: string, patch: Record<string, unknown>) => Promise<void>;
export const BlockEditContext = createContext<SaveBlock | null>(null);

/**
 * Per-block internal actions (regenerate / remove) surfaced as a hover toolbar on each block in the
 * lead-detail preview. Null in the client `/present` view and the PDF, so the toolbar never appears there.
 */
export type BlockAction = (blockId: string) => Promise<void> | void;
/** Regenerate one block, optionally steered by a plain-English prompt. */
export type RegenerateBlock = (blockId: string, prompt?: string) => Promise<void> | void;
export type ExplainBlock = (blockId: string) => Promise<BlockExplain>;
export const BlockToolbarContext = createContext<{ regenerate?: RegenerateBlock; remove?: BlockAction; explain?: ExplainBlock } | null>(null);
