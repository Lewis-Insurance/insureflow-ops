/**
 * Coterie mock fixtures loader.
 *
 * Source of truth for mock-mode responses. The JSON files mirror the verified
 * Coterie `POST /quotes/bindable` response shapes (success / decline /
 * validation error). Import attributes (`with { type: 'json' }`) keep this
 * valid under Deno; Vite/Vitest also resolve these JSON imports natively.
 */
import quoteSuccess from './quote-success.json' with { type: 'json' };
import quoteDecline from './quote-decline.json' with { type: 'json' };
import quoteValidationError from './quote-validation-error.json' with { type: 'json' };

import type { RawCoterieQuoteResponse } from '../mappers.ts';

export interface CoterieFixtureSet {
  success: RawCoterieQuoteResponse;
  decline: RawCoterieQuoteResponse;
  validationError: RawCoterieQuoteResponse;
}

export const defaultCoterieFixtures: CoterieFixtureSet = {
  success: quoteSuccess as unknown as RawCoterieQuoteResponse,
  decline: quoteDecline as unknown as RawCoterieQuoteResponse,
  validationError: quoteValidationError as unknown as RawCoterieQuoteResponse,
};
