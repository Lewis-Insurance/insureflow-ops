import type { PortalIdCardRow } from './types.ts';

const PORTAL_DOCUMENTS_BUCKET = 'portal-documents';
const ID_CARD_SIGNED_URL_TTL_SECONDS = 900;

export interface IdCardDocumentCandidate {
  id: string;
  storage_bucket: string | null;
  storage_path: string | null;
  file_path: string | null;
  mime_type: string | null;
  name: string | null;
}

export interface ResolveIdCardAssetDb {
  findActivePortalIdCard(accountId: string, policyId: string): Promise<PortalIdCardRow | null>;
  findIdCardDocument(accountId: string, policyId: string): Promise<IdCardDocumentCandidate | null>;
  insertPortalIdCard(row: {
    account_id: string;
    policy_id: string;
    card_data: Record<string, unknown>;
    card_image_path: string | null;
    card_pdf_path: string | null;
    data_as_of: string;
    source_document_id: string | null;
    is_active: boolean;
  }): Promise<PortalIdCardRow>;
  copyToPortalDocuments(sourceBucket: string, sourcePath: string, destPath: string): Promise<void>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
}

export interface ResolveIdCardAssetInput {
  accountId: string;
  policyId: string;
  policyNumber: string;
  carrier?: string | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
}

export interface ResolvedIdCardAsset {
  cardId: string;
  cardImagePath: string;
  signedUrl: string;
  dataAsOf: string;
  label: string;
}

function portalIdCardPath(accountId: string, policyId: string, filename: string): string {
  return `${accountId}/id-cards/${policyId}/${filename}`;
}

function pickDocumentPath(doc: IdCardDocumentCandidate): string | null {
  return doc.storage_path ?? doc.file_path ?? null;
}

function pickDocumentBucket(doc: IdCardDocumentCandidate): string {
  return doc.storage_bucket?.trim() || 'documents';
}

function filenameFromDocument(doc: IdCardDocumentCandidate): string {
  const base = doc.name?.trim() || 'id-card.pdf';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function buildCardData(input: ResolveIdCardAssetInput): Record<string, unknown> {
  return {
    policy_number: input.policyNumber,
    carrier: input.carrier ?? null,
    effective_date: input.effectiveDate ?? null,
    expiration_date: input.expirationDate ?? null,
    source: 'floor_resolve_id_card_asset',
  };
}

/** Ensure portal_id_cards row exists and return a short-lived signed URL for staff preview + email link. */
export async function resolveIdCardAssetForPolicy(
  input: ResolveIdCardAssetInput,
  db: ResolveIdCardAssetDb,
  now: () => Date = () => new Date(),
): Promise<ResolvedIdCardAsset> {
  const existing = await db.findActivePortalIdCard(input.accountId, input.policyId);
  if (existing?.card_image_path || existing?.card_pdf_path) {
    const path = existing.card_image_path ?? existing.card_pdf_path!;
    const signedUrl = await db.createSignedUrl(path, ID_CARD_SIGNED_URL_TTL_SECONDS);
    return {
      cardId: existing.id,
      cardImagePath: path,
      signedUrl,
      dataAsOf: existing.data_as_of,
      label: `ID card — policy ${input.policyNumber}`,
    };
  }

  const document = await db.findIdCardDocument(input.accountId, input.policyId);
  const dataAsOf = now().toISOString();
  let cardPath: string | null = null;

  if (document) {
    const sourcePath = pickDocumentPath(document);
    if (sourcePath) {
      const destPath = portalIdCardPath(input.accountId, input.policyId, filenameFromDocument(document));
      await db.copyToPortalDocuments(pickDocumentBucket(document), sourcePath, destPath);
      cardPath = destPath;
    }
  }

  if (!cardPath) {
    throw new Error(
      `Floor: no ID card asset found for policy ${input.policyId}; populate documents or portal_id_cards first`,
    );
  }

  const inserted = await db.insertPortalIdCard({
    account_id: input.accountId,
    policy_id: input.policyId,
    card_data: buildCardData(input),
    card_image_path: cardPath,
    card_pdf_path: cardPath,
    data_as_of: dataAsOf,
    source_document_id: null,
    is_active: true,
  });

  const signedUrl = await db.createSignedUrl(cardPath, ID_CARD_SIGNED_URL_TTL_SECONDS);
  return {
    cardId: inserted.id,
    cardImagePath: cardPath,
    signedUrl,
    dataAsOf: inserted.data_as_of,
    label: `ID card — policy ${input.policyNumber}`,
  };
}

export { ID_CARD_SIGNED_URL_TTL_SECONDS, PORTAL_DOCUMENTS_BUCKET };
