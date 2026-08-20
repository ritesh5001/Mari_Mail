/**
 * Blocklist DTOs.
 *
 * These lived in the blocked *page* file, which `BlocklistAdmin` imported from
 * — a component reaching up into a route to borrow its types. That made the
 * page unmovable without breaking the component, so they live here instead.
 */
export type BlockDTO = {
  id: string;
  kind: "CONTACT" | "COMPANY";
  value: string;
  label: string | null;
  contactId: string | null;
  reason: string | null;
  createdAt: string;
};

export type BlocklistDTO = {
  blocks: BlockDTO[];
  counts: { contacts: number; companies: number };
};
