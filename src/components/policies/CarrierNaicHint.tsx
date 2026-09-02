// Where a policy's certificate NAIC comes from, on the policy record itself.
//
// The carrier directory (`public.carriers`, owned by /carriers) is the single
// source of truth for carrier name and NAIC, and Master COI resolves the insurer
// NAIC from it. So the certificate's NAIC box depends on three things a staffer
// otherwise cannot see from the policy page:
//
//   1. whether the policy is linked to a carrier record at all (carrier_id),
//   2. whether that record has a NAIC on file,
//   3. whether the linked record is even the carrier the policy names, which is
//      not the same thing when the link points at the wholesaler.
//
// Each state gets a sentence and, where there is one, the place to fix it.

import { Link } from 'react-router-dom';
import { findCarrierByName, useCarrierDirectory } from '@/hooks/useCarrierDirectory';

export interface CarrierNaicHintProps {
  /** policies.carrier, the free-text name the certificate prints. */
  carrierText?: string | null;
  /** The joined carriers row, when policies.carrier_id is set. */
  carrierInfo?: { id: string; name?: string | null; naic?: string | null } | null;
  /** policies.carrier_naic, a manual override that outranks the directory. */
  policyNaic?: string | null;
}

function clean(v: string | null | undefined): string {
  return (v ?? '').trim();
}

export function CarrierNaicHint({ carrierText, carrierInfo, policyNaic }: CarrierNaicHintProps) {
  const { data: directory = [] } = useCarrierDirectory();
  const override = clean(policyNaic);
  const linkedName = clean(carrierInfo?.name);
  const linkedNaic = clean(carrierInfo?.naic);
  const printedName = clean(carrierText) || linkedName;
  const nameMatched = findCarrierByName(directory, printedName);

  // A NAIC typed onto the policy wins over the directory everywhere downstream,
  // so it has to be labelled as the override it is.
  if (override) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        NAIC: <span className="cc-num">{override}</span> (set on this policy, overrides the carrier
        directory)
      </p>
    );
  }

  if (!carrierInfo?.id) {
    return (
      <p className="mt-1 text-xs text-cc-warning">
        Not linked to the carrier directory, so certificates cannot fill a NAIC.{' '}
        <Link
          to={`/carriers${printedName ? `?q=${encodeURIComponent(printedName)}` : ''}`}
          className="font-semibold underline-offset-2 hover:underline"
        >
          Open Carriers
        </Link>
        , then pick the carrier again on this policy.
      </p>
    );
  }

  const linkNamesADifferentCarrier =
    !!printedName && !!linkedName && printedName.toLowerCase() !== linkedName.toLowerCase();

  // Mirror get_master_coi: when the link names a different carrier than the printed
  // insurer, the certificate NAIC comes from the name-matched directory row first.
  const certificateNaic = linkNamesADifferentCarrier
    ? clean(nameMatched?.naic) || linkedNaic || null
    : linkedNaic || clean(nameMatched?.naic) || null;
  const certificateNaicSourceName = linkNamesADifferentCarrier && clean(nameMatched?.naic)
    ? nameMatched!.name
    : linkedNaic
      ? linkedName
      : clean(nameMatched?.naic)
        ? nameMatched!.name
        : linkedName;
  const naicFixCarrierId =
    linkNamesADifferentCarrier && nameMatched
      ? nameMatched.id
      : carrierInfo.id;
  const naicFixCarrierName =
    linkNamesADifferentCarrier && nameMatched
      ? nameMatched.name
      : linkedName || 'this carrier';

  return (
    <div className="mt-1 space-y-1">
      {certificateNaic ? (
        <p className="text-xs text-muted-foreground">
          NAIC: <span className="cc-num">{certificateNaic}</span> from the carrier directory record{' '}
          {certificateNaicSourceName || 'for this carrier'}
        </p>
      ) : (
        <p className="text-xs text-cc-warning">
          No NAIC on file for {naicFixCarrierName}, so certificates will show the NAIC box as
          missing.{' '}
          <Link
            to={`/carriers?carrier=${naicFixCarrierId}`}
            className="font-semibold underline-offset-2 hover:underline"
          >
            Add it on Carriers
          </Link>
        </p>
      )}
      {linkNamesADifferentCarrier && (
        <p className="text-xs text-cc-warning">
          This policy names {printedName} but is linked to the carrier record {linkedName}.
          Certificates print {printedName} and take the NAIC from that record.
        </p>
      )}
    </div>
  );
}
