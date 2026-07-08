import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  useGoogleBusinessProfiles,
  usePrimaryGoogleProfile,
  useReviewRequests,
  useReviewStats,
} from '@/hooks/useReputation';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneForDisplay } from '@/lib/format';
import {
  Star,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader2,
  Building2,
  BarChart3,
  Send,
} from 'lucide-react';

export default function ReputationSettings() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const agencyWorkspaceId = profile?.default_agency_workspace_id;

  const { data: profiles, isLoading: loadingProfiles, refetch: refetchProfiles } = useGoogleBusinessProfiles(agencyWorkspaceId);
  const { data: primaryProfile } = usePrimaryGoogleProfile(agencyWorkspaceId);
  const { data: recentRequests } = useReviewRequests({ agencyWorkspaceId, limit: 5 });
  const { data: stats } = useReviewStats(agencyWorkspaceId);

  const [businessName, setBusinessName] = useState('');
  const [reviewUrl, setReviewUrl] = useState('');
  const [googlePlaceId, setGooglePlaceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingUrl, setTestingUrl] = useState(false);

  // Load existing profile data
  useEffect(() => {
    if (primaryProfile) {
      setBusinessName(primaryProfile.name || '');
      setReviewUrl(primaryProfile.review_url || '');
      setGooglePlaceId(primaryProfile.google_place_id || '');
    }
  }, [primaryProfile]);

  const handleSave = async () => {
    if (!agencyWorkspaceId) {
      toast({
        title: 'Error',
        description: 'No agency workspace found.',
        variant: 'destructive',
      });
      return;
    }

    if (!businessName.trim() || !reviewUrl.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in both the business name and review URL.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      if (primaryProfile) {
        // Update existing profile
        const { error } = await supabase
          .from('google_business_profiles')
          .update({
            name: businessName.trim(),
            review_url: reviewUrl.trim(),
            google_place_id: googlePlaceId.trim() || `manual-${Date.now()}`,
          })
          .eq('id', primaryProfile.id);

        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await supabase
          .from('google_business_profiles')
          .insert({
            agency_workspace_id: agencyWorkspaceId,
            name: businessName.trim(),
            review_url: reviewUrl.trim(),
            google_place_id: googlePlaceId.trim() || `manual-${Date.now()}`,
            is_primary: true,
            status: 'active',
            sync_status: 'pending',
          });

        if (error) throw error;
      }

      toast({
        title: 'Settings Saved',
        description: 'Your Google Business Profile settings have been updated.',
      });

      refetchProfiles();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestUrl = () => {
    if (!reviewUrl) {
      toast({
        title: 'No URL',
        description: 'Please enter a review URL first.',
        variant: 'destructive',
      });
      return;
    }

    setTestingUrl(true);
    // Open the URL in a new tab to test
    window.open(reviewUrl, '_blank');
    setTimeout(() => setTestingUrl(false), 1000);
  };

  // Helper to extract Place ID from Google Maps URL
  const handleUrlChange = (url: string) => {
    setReviewUrl(url);

    // Try to extract place ID from various Google Maps URL formats
    const placeIdMatch = url.match(/place_id[=:]([^&/]+)/);
    if (placeIdMatch) {
      setGooglePlaceId(placeIdMatch[1]);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Star className="h-6 w-6 text-yellow-500" />
            Reputation Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure your Google Business Profile for review requests
          </p>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Reviews</p>
                    <p className="text-2xl font-bold">{stats.total_reviews || 0}</p>
                  </div>
                  <Star className="h-8 w-8 text-yellow-500 opacity-20" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Rating</p>
                    <p className="text-2xl font-bold">
                      {stats.average_rating?.toFixed(1) || '-'}
                    </p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-blue-500 opacity-20" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Last 30 Days</p>
                    <p className="text-2xl font-bold">{stats.reviews_last_30_days || 0}</p>
                  </div>
                  <Send className="h-8 w-8 text-green-500 opacity-20" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending</p>
                    <p className="text-2xl font-bold">{stats.pending_responses || 0}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-orange-500 opacity-20" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Google Business Profile Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Google Business Profile
            </CardTitle>
            <CardDescription>
              Enter your Google Business Profile details to enable review requests
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingProfiles ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading profile settings...
              </div>
            ) : (
              <>
                {/* Status */}
                {primaryProfile ? (
                  <Alert>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>Google Business Profile is configured</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleTestUrl}
                        disabled={testingUrl}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Test Link
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No Google Business Profile configured. Review requests will not work until this is set up.
                    </AlertDescription>
                  </Alert>
                )}

                <Separator />

                {/* Form Fields */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business Name</Label>
                    <Input
                      id="businessName"
                      placeholder="Lewis Insurance Agency"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Your business name as it appears on Google
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reviewUrl">Google Review URL</Label>
                    <Input
                      id="reviewUrl"
                      placeholder="https://g.page/r/..."
                      value={reviewUrl}
                      onChange={(e) => handleUrlChange(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Your direct Google review link. Find this in your Google Business Profile dashboard under "Get more reviews"
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="placeId">Google Place ID (Optional)</Label>
                    <Input
                      id="placeId"
                      placeholder="ChIJ..."
                      value={googlePlaceId}
                      onChange={(e) => setGooglePlaceId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Your Google Place ID for advanced tracking. This is auto-detected from some URL formats.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Settings'
                    )}
                  </Button>
                  {reviewUrl && (
                    <Button variant="outline" onClick={handleTestUrl} disabled={testingUrl}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Test Review Link
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* How to Get Your Review Link */}
        <Card>
          <CardHeader>
            <CardTitle>How to Get Your Review Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Go to <a href="https://business.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Business Profile</a></li>
              <li>Click on your business listing</li>
              <li>Click "Get more reviews" or find the "Share review form" option</li>
              <li>Copy the short link (usually starts with g.page/r/)</li>
              <li>Paste it in the "Google Review URL" field above</li>
            </ol>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Tip:</strong> Use the short link format (g.page/r/...) for best results.
                Customers will be taken directly to the review form when they click the link.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Recent Review Requests */}
        {recentRequests && recentRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Review Requests</CardTitle>
              <CardDescription>
                Last 5 review requests sent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="font-medium">
                        {request.first_name} {request.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {request.email || formatPhoneForDisplay(request.phone)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                          ${request.status === 'reviewed' ? 'bg-green-100 text-green-800' : ''}
                          ${request.status === 'clicked' ? 'bg-blue-100 text-blue-800' : ''}
                          ${request.status === 'sent' || request.status === 'delivered' ? 'bg-gray-100 text-gray-800' : ''}
                          ${request.status === 'failed' || request.status === 'bounced' ? 'bg-red-100 text-red-800' : ''}
                          ${request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                        `}
                      >
                        {request.status}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
