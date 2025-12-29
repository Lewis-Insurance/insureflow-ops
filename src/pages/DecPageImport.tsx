import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Upload,
  FileText,
  User,
  Car,
  Home,
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  Shield,
  UserPlus,
} from 'lucide-react';
import { useDecPageImport, DecPageParseResult } from '@/hooks/useDecPageImport';
import { cn } from '@/lib/utils';

export default function DecPageImport() {
  const navigate = useNavigate();
  const {
    uploadAndParse,
    createLeadFromDecPage,
    parseResult,
    isUploading,
    isParsing,
    progress,
    reset,
  } = useDecPageImport();

  const [editedData, setEditedData] = useState<DecPageParseResult | null>(null);
  const [notes, setNotes] = useState('');

  // Use edited data or original parse result
  const displayData = editedData || parseResult;

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setEditedData(null);
      setNotes('');
      await uploadAndParse(file);
    }
  }, [uploadAndParse]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.tiff', '.tif'],
    },
    maxFiles: 1,
    disabled: isUploading || isParsing,
  });

  const handleCreateLead = async () => {
    if (!displayData) return;

    const lead = await createLeadFromDecPage.mutateAsync({
      parseResult: displayData,
      notes,
    });

    if (lead) {
      navigate(`/leads/${lead.id}`);
    }
  };

  const handleReset = () => {
    reset();
    setEditedData(null);
    setNotes('');
  };

  const updateInsuredField = (field: string, value: string) => {
    if (!displayData) return;
    setEditedData({
      ...displayData,
      insured: {
        ...displayData.insured,
        [field]: value,
      },
    });
  };

  const updateAddressField = (field: string, value: string) => {
    if (!displayData) return;
    setEditedData({
      ...displayData,
      insured: {
        ...displayData.insured,
        address: {
          ...displayData.insured.address,
          [field]: value,
        },
      },
    });
  };

  const getPolicyTypeIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('auto')) return Car;
    if (t.includes('home')) return Home;
    if (t.includes('commercial')) return Building2;
    return Shield;
  };

  const isProcessing = isUploading || isParsing;

  return (
    <AppLayout>
      <div className="container mx-auto py-6 max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-8 w-8" />
          Import Dec Page
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload a policy declaration page to auto-create a lead for requoting
        </p>
      </div>

      {/* Upload Area */}
      {!displayData && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Declaration Page</CardTitle>
            <CardDescription>
              Drag and drop a dec page PDF or image, or click to browse
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all',
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary hover:bg-muted/50',
                isProcessing && 'opacity-50 cursor-not-allowed'
              )}
            >
              <input {...getInputProps()} />
              {isProcessing ? (
                <div className="space-y-4">
                  <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
                  <div>
                    <p className="font-medium">
                      {isUploading ? 'Uploading...' : 'Analyzing document...'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Extracting policy and insured information
                    </p>
                  </div>
                  <Progress value={progress} className="w-64 mx-auto" />
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-1">
                    {isDragActive ? 'Drop the file here' : 'Drop dec page here'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Supports PDF, PNG, JPG, TIFF
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parse Results */}
      {displayData && (
        <div className="space-y-6">
          {/* Status Banner */}
          <Card className={cn(
            'border-l-4',
            displayData.confidence >= 80 ? 'border-l-green-500 bg-green-50/50' :
            displayData.confidence >= 60 ? 'border-l-yellow-500 bg-yellow-50/50' :
            'border-l-red-500 bg-red-50/50'
          )}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {displayData.confidence >= 80 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <div>
                    <p className="font-medium">
                      {displayData.confidence >= 80
                        ? 'High confidence extraction'
                        : 'Review extracted data'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Confidence: {displayData.confidence}%
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Import Another
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Policy Summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => {
                    const Icon = getPolicyTypeIcon(displayData.policy.policy_type);
                    return <Icon className="h-5 w-5" />;
                  })()}
                  <CardTitle>Policy Information</CardTitle>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {displayData.policy.policy_type.replace(/_/g, ' ')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {displayData.policy.carrier && (
                  <div>
                    <p className="text-sm text-muted-foreground">Carrier</p>
                    <p className="font-medium">{displayData.policy.carrier}</p>
                  </div>
                )}
                {displayData.policy.policy_number && (
                  <div>
                    <p className="text-sm text-muted-foreground">Policy #</p>
                    <p className="font-medium">{displayData.policy.policy_number}</p>
                  </div>
                )}
                {displayData.policy.effective_date && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Effective
                    </p>
                    <p className="font-medium">{displayData.policy.effective_date}</p>
                  </div>
                )}
                {displayData.policy.expiration_date && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Expires
                    </p>
                    <p className="font-medium">{displayData.policy.expiration_date}</p>
                  </div>
                )}
                {displayData.policy.premium && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Premium
                    </p>
                    <p className="font-medium text-green-600">
                      ${displayData.policy.premium.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Vehicles */}
              {displayData.vehicles && displayData.vehicles.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Car className="h-4 w-4" /> Vehicles ({displayData.vehicles.length})
                    </p>
                    <div className="space-y-2">
                      {displayData.vehicles.map((v, i) => (
                        <div key={i} className="flex items-center gap-4 text-sm bg-muted/50 p-2 rounded">
                          <span className="font-medium">
                            {v.year} {v.make} {v.model}
                          </span>
                          {v.vin && (
                            <span className="text-muted-foreground">VIN: {v.vin}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Drivers */}
              {displayData.drivers && displayData.drivers.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-1">
                      <User className="h-4 w-4" /> Drivers ({displayData.drivers.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {displayData.drivers.map((d, i) => (
                        <Badge key={i} variant="outline">{d.name}</Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Insured Information (Editable) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Insured Information
              </CardTitle>
              <CardDescription>
                Review and edit before creating the lead
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={displayData.insured.first_name}
                    onChange={(e) => updateInsuredField('first_name', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={displayData.insured.last_name}
                    onChange={(e) => updateInsuredField('last_name', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </Label>
                  <Input
                    value={displayData.insured.phone || ''}
                    onChange={(e) => updateInsuredField('phone', e.target.value)}
                    placeholder="Not found - enter manually"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </Label>
                  <Input
                    value={displayData.insured.email || ''}
                    onChange={(e) => updateInsuredField('email', e.target.value)}
                    placeholder="Not found - enter manually"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Address
                </Label>
                <Input
                  value={displayData.insured.address?.street || ''}
                  onChange={(e) => updateAddressField('street', e.target.value)}
                  placeholder="Street address"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={displayData.insured.address?.city || ''}
                    onChange={(e) => updateAddressField('city', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    value={displayData.insured.address?.state || ''}
                    onChange={(e) => updateAddressField('state', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ZIP</Label>
                  <Input
                    value={displayData.insured.address?.zip || ''}
                    onChange={(e) => updateAddressField('zip', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes & Create */}
          <Card>
            <CardHeader>
              <CardTitle>Create Lead</CardTitle>
              <CardDescription>
                Add notes and create the lead for requoting
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this requote opportunity..."
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Policy details will be saved in the lead notes
                </p>
                <Button
                  onClick={handleCreateLead}
                  disabled={createLeadFromDecPage.isPending}
                  size="lg"
                  className="gap-2"
                >
                  {createLeadFromDecPage.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Create Lead for Requote
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </div>
    </AppLayout>
  );
}
