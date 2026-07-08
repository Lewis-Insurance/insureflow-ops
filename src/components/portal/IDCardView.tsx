// ============================================================================
// ID CARD VIEW COMPONENT
// ============================================================================
// Display ID cards with wallet buttons
// ============================================================================

import { useState } from 'react';
import { formatPhoneForDisplay } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Download,
  Smartphone,
  ExternalLink,
  Car,
  Calendar,
  Phone,
  Loader2
} from 'lucide-react';
import { usePortalIDCards } from '@/hooks/usePortalIDCards';
import { DataAsOfBadge } from './DataAsOfBadge';
import type { PortalIDCard } from '@/types/portal';
import { formatLocalDateDisplay } from '@/lib/date/localDate';

interface IDCardViewProps {
  showWalletButtons?: boolean;
}

export function IDCardView({ showWalletButtons = true }: IDCardViewProps) {
  const { idCards, isLoading, getIDCardImageUrl, downloadIDCard, getAppleWalletPass, getGoogleWalletPass } = usePortalIDCards();
  const [loadingCard, setLoadingCard] = useState<string | null>(null);
  const [cardImages, setCardImages] = useState<Record<string, string>>({});

  const handleViewCard = async (cardId: string) => {
    if (cardImages[cardId]) return;

    setLoadingCard(cardId);
    try {
      const url = await getIDCardImageUrl(cardId);
      setCardImages(prev => ({ ...prev, [cardId]: url }));
    } catch (error) {
      console.error('Failed to load ID card:', error);
    } finally {
      setLoadingCard(null);
    }
  };

  const handleDownload = async (cardId: string) => {
    setLoadingCard(cardId);
    try {
      const url = await downloadIDCard(cardId);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to download ID card:', error);
    } finally {
      setLoadingCard(null);
    }
  };

  const handleAddToAppleWallet = async (cardId: string) => {
    setLoadingCard(cardId);
    try {
      const url = await getAppleWalletPass(cardId);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to add to Apple Wallet:', error);
    } finally {
      setLoadingCard(null);
    }
  };

  const handleAddToGoogleWallet = async (cardId: string) => {
    setLoadingCard(cardId);
    try {
      const url = await getGoogleWalletPass(cardId);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to add to Google Wallet:', error);
    } finally {
      setLoadingCard(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (idCards.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No ID cards available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {idCards.map((card) => (
        <IDCardItem
          key={card.id}
          card={card}
          imageUrl={cardImages[card.id]}
          isLoading={loadingCard === card.id}
          showWalletButtons={showWalletButtons}
          onView={() => handleViewCard(card.id)}
          onDownload={() => handleDownload(card.id)}
          onAddToAppleWallet={() => handleAddToAppleWallet(card.id)}
          onAddToGoogleWallet={() => handleAddToGoogleWallet(card.id)}
        />
      ))}
    </div>
  );
}

interface IDCardItemProps {
  card: PortalIDCard;
  imageUrl?: string;
  isLoading: boolean;
  showWalletButtons: boolean;
  onView: () => void;
  onDownload: () => void;
  onAddToAppleWallet: () => void;
  onAddToGoogleWallet: () => void;
}

function IDCardItem({
  card,
  imageUrl,
  isLoading,
  showWalletButtons,
  onView,
  onDownload,
  onAddToAppleWallet,
  onAddToGoogleWallet,
}: IDCardItemProps) {
  const { card_data } = card;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Car className="h-5 w-5" />
            {card_data.carrier_name}
          </CardTitle>
          <DataAsOfBadge date={card.data_as_of} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Card Image */}
        {imageUrl ? (
          <div className="bg-cc-surface-raised rounded-lg p-2">
            <img
              src={imageUrl}
              alt={`${card_data.carrier_name} ID Card`}
              className="w-full rounded"
            />
          </div>
        ) : (
          <div
            className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg p-4 text-white cursor-pointer hover:opacity-90 transition-opacity"
            onClick={onView}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm opacity-80">Insurance ID Card</p>
                    <p className="font-bold text-lg">{card_data.carrier_name}</p>
                  </div>
                  {card_data.carrier_logo_url && (
                    <img
                      src={card_data.carrier_logo_url}
                      alt={card_data.carrier_name}
                      className="h-8"
                    />
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <p className="opacity-70">Policy Number</p>
                    <p className="font-mono">{card_data.policy_number}</p>
                  </div>
                  <div>
                    <p className="opacity-70">Named Insured</p>
                    <p>{card_data.named_insured}</p>
                  </div>
                  {card_data.vehicle && (
                    <div>
                      <p className="opacity-70">Vehicle</p>
                      <p>{card_data.vehicle.year} {card_data.vehicle.make} {card_data.vehicle.model}</p>
                    </div>
                  )}
                  <div className="flex gap-4">
                    <div>
                      <p className="opacity-70">Effective</p>
                      <p>{formatLocalDateDisplay(card_data.effective_date)}</p>
                    </div>
                    <div>
                      <p className="opacity-70">Expires</p>
                      <p>{formatLocalDateDisplay(card_data.expiration_date)}</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs opacity-60 mt-4 text-center">
                  Click to view full card
                </p>
              </>
            )}
          </div>
        )}

        {/* Card Details */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>Expires {formatLocalDateDisplay(card_data.expiration_date)}</span>
          </div>
          {card_data.claims_phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${card_data.claims_phone}`} className="text-cc-link hover:text-cc-link-hover hover:underline">
                {formatPhoneForDisplay(card_data.claims_phone)}
              </a>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onDownload} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download PDF
          </Button>

          {showWalletButtons && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onAddToAppleWallet}
                disabled={isLoading}
                className="bg-black text-white hover:bg-gray-800"
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Apple Wallet
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onAddToGoogleWallet}
                disabled={isLoading}
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Google Wallet
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
