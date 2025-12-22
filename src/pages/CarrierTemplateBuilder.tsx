import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Upload,
  Plus,
  Trash2,
  Save,
  MousePointer2,
  Square,
  Move,
  ZoomIn,
  ZoomOut,
  Loader2,
  CheckCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Common ACORD fields for quick selection
const COMMON_ACORD_FIELDS = [
  { value: 'NamedInsured', label: 'Named Insured', section: 'Insured Info' },
  { value: 'MailingAddress', label: 'Mailing Address', section: 'Insured Info' },
  { value: 'City', label: 'City', section: 'Insured Info' },
  { value: 'State', label: 'State', section: 'Insured Info' },
  { value: 'ZipCode', label: 'Zip Code', section: 'Insured Info' },
  { value: 'Phone', label: 'Phone', section: 'Insured Info' },
  { value: 'Email', label: 'Email', section: 'Insured Info' },
  { value: 'FEIN', label: 'FEIN', section: 'Insured Info' },
  { value: 'PolicyNumber', label: 'Policy Number', section: 'Policy Info' },
  { value: 'EffectiveDate', label: 'Effective Date', section: 'Policy Info' },
  { value: 'ExpirationDate', label: 'Expiration Date', section: 'Policy Info' },
  { value: 'TotalPremium', label: 'Total Premium', section: 'Policy Info' },
  { value: 'CarrierName', label: 'Carrier Name', section: 'Policy Info' },
  { value: 'GeneralAggregate', label: 'General Aggregate', section: 'GL Limits' },
  { value: 'EachOccurrence', label: 'Each Occurrence', section: 'GL Limits' },
  { value: 'ProductsCompletedOps', label: 'Products/Completed Ops', section: 'GL Limits' },
  { value: 'PersonalAdvInjury', label: 'Personal & Adv Injury', section: 'GL Limits' },
  { value: 'DamageToRentedPremises', label: 'Damage to Rented Premises', section: 'GL Limits' },
  { value: 'MedicalExpense', label: 'Medical Expense', section: 'GL Limits' },
  { value: 'CombinedSingleLimit', label: 'Combined Single Limit', section: 'Auto Limits' },
  { value: 'BodilyInjuryPerPerson', label: 'BI Per Person', section: 'Auto Limits' },
  { value: 'BodilyInjuryPerAccident', label: 'BI Per Accident', section: 'Auto Limits' },
  { value: 'PropertyDamage', label: 'Property Damage', section: 'Auto Limits' },
  { value: 'WCStatutoryLimits', label: 'WC Statutory', section: 'WC Limits' },
  { value: 'EmployersLiability', label: 'Employers Liability', section: 'WC Limits' },
];

const DOCUMENT_TYPES = [
  { value: 'dec_page', label: 'Declaration Page' },
  { value: 'application', label: 'Application' },
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'certificate', label: 'Certificate' },
];

const LINES_OF_BUSINESS = [
  { value: 'GL', label: 'General Liability' },
  { value: 'Auto', label: 'Commercial Auto' },
  { value: 'WC', label: 'Workers Compensation' },
  { value: 'Property', label: 'Property' },
  { value: 'Package', label: 'Package/BOP' },
  { value: 'Umbrella', label: 'Umbrella/Excess' },
];

interface FieldZone {
  id: string;
  acord_field_name: string;
  field_label: string;
  page_number: number;
  zone_x_percent: number;
  zone_y_percent: number;
  zone_width_percent: number;
  zone_height_percent: number;
  field_type: string;
}

interface DrawingZone {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

export default function CarrierTemplateBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Template metadata
  const [carrierName, setCarrierName] = useState('');
  const [carrierCode, setCarrierCode] = useState('');
  const [documentType, setDocumentType] = useState('dec_page');
  const [lineOfBusiness, setLineOfBusiness] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // Document state
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentImages, setDocumentImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);

  // Drawing state
  const [zones, setZones] = useState<FieldZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingZone, setDrawingZone] = useState<DrawingZone | null>(null);
  const [tool, setTool] = useState<'select' | 'draw'>('draw');
  const [zoom, setZoom] = useState(1);

  // Dialog state
  const [showFieldDialog, setShowFieldDialog] = useState(false);
  const [pendingZone, setPendingZone] = useState<DrawingZone | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');

  // Loading state - only load if editing existing template (not 'new')
  const [isLoading, setIsLoading] = useState(!!id && id !== 'new');
  const [isSaving, setIsSaving] = useState(false);

  // Load existing template
  useEffect(() => {
    if (id && id !== 'new') {
      loadTemplate(id);
    }
  }, [id]);

  const loadTemplate = async (templateId: string) => {
    try {
      const { data: template, error } = await supabase
        .from('carrier_document_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) throw error;

      setCarrierName(template.carrier_name);
      setCarrierCode(template.carrier_code || '');
      setDocumentType(template.document_type);
      setLineOfBusiness(template.line_of_business || '');
      setTemplateName(template.template_name);
      setTemplateDescription(template.template_description || '');
      setDocumentUrl(template.sample_document_url);

      // Load field zones
      const { data: fieldZones } = await supabase
        .from('template_field_zones')
        .select('*')
        .eq('template_id', templateId);

      if (fieldZones) {
        setZones(fieldZones.map(z => ({
          id: z.id,
          acord_field_name: z.acord_field_name,
          field_label: z.field_label || z.acord_field_name,
          page_number: z.page_number,
          zone_x_percent: z.zone_x_percent,
          zone_y_percent: z.zone_y_percent,
          zone_width_percent: z.zone_width_percent,
          zone_height_percent: z.zone_height_percent,
          field_type: z.field_type,
        })));
      }

      // TODO: Convert PDF to images for display
      // For now, if there's a document URL, we'd need to render it

    } catch (error: any) {
      toast({
        title: 'Error loading template',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      // Upload file to storage
      const filePath = `carrier-templates/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      setDocumentUrl(urlData.publicUrl);

      // For demo purposes, create a preview using PDF.js or convert to image
      // In production, you'd use a service to convert PDF pages to images
      // For now, we'll just show a placeholder and allow drawing

      // Simulate document loaded
      const img = new Image();
      img.onload = () => {
        setDocumentImages([urlData.publicUrl]);
      };
      img.src = urlData.publicUrl;

      toast({ title: 'Document uploaded successfully' });

      // Auto-fill template name if empty
      if (!templateName) {
        setTemplateName(file.name.replace(/\.[^/.]+$/, ''));
      }

    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Canvas drawing functions
  const getMousePosition = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'draw') return;

    const pos = getMousePosition(e);
    setIsDrawing(true);
    setDrawingZone({
      startX: pos.x,
      startY: pos.y,
      width: 0,
      height: 0,
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawingZone) return;

    const pos = getMousePosition(e);
    setDrawingZone({
      ...drawingZone,
      width: pos.x - drawingZone.startX,
      height: pos.y - drawingZone.startY,
    });
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawing || !drawingZone) return;

    setIsDrawing(false);

    // Only create zone if it has meaningful size
    if (Math.abs(drawingZone.width) > 10 && Math.abs(drawingZone.height) > 10) {
      // Normalize negative dimensions
      const normalizedZone = {
        startX: drawingZone.width < 0 ? drawingZone.startX + drawingZone.width : drawingZone.startX,
        startY: drawingZone.height < 0 ? drawingZone.startY + drawingZone.height : drawingZone.startY,
        width: Math.abs(drawingZone.width),
        height: Math.abs(drawingZone.height),
      };

      setPendingZone(normalizedZone);
      setShowFieldDialog(true);
    }

    setDrawingZone(null);
  };

  const handleCreateZone = () => {
    if (!pendingZone || !newFieldName) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Convert pixel coordinates to percentages
    const zone: FieldZone = {
      id: crypto.randomUUID(),
      acord_field_name: newFieldName,
      field_label: newFieldLabel || newFieldName,
      page_number: currentPage,
      zone_x_percent: (pendingZone.startX / canvas.width) * 100,
      zone_y_percent: (pendingZone.startY / canvas.height) * 100,
      zone_width_percent: (pendingZone.width / canvas.width) * 100,
      zone_height_percent: (pendingZone.height / canvas.height) * 100,
      field_type: newFieldType,
    };

    setZones([...zones, zone]);
    setShowFieldDialog(false);
    setPendingZone(null);
    setNewFieldName('');
    setNewFieldLabel('');
    setNewFieldType('text');
  };

  const handleDeleteZone = (zoneId: string) => {
    setZones(zones.filter(z => z.id !== zoneId));
    if (selectedZone === zoneId) {
      setSelectedZone(null);
    }
  };

  const handleSave = async () => {
    if (!carrierName || !templateName) {
      toast({
        title: 'Missing required fields',
        description: 'Please enter carrier name and template name',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      const templateData = {
        carrier_name: carrierName,
        carrier_code: carrierCode || null,
        document_type: documentType,
        line_of_business: lineOfBusiness || null,
        template_name: templateName,
        template_description: templateDescription || null,
        sample_document_url: documentUrl,
        page_count: documentImages.length || 1,
        is_active: true,
      };

      let templateId = id;

      if (id && id !== 'new') {
        // Update existing template
        const { error } = await supabase
          .from('carrier_document_templates')
          .update(templateData)
          .eq('id', id);

        if (error) throw error;
      } else {
        // Create new template
        const { data, error } = await supabase
          .from('carrier_document_templates')
          .insert(templateData)
          .select()
          .single();

        if (error) throw error;
        templateId = data.id;
      }

      // Delete existing zones and re-create
      await supabase
        .from('template_field_zones')
        .delete()
        .eq('template_id', templateId);

      // Insert zones
      if (zones.length > 0) {
        const zonesData = zones.map(z => ({
          template_id: templateId,
          acord_field_name: z.acord_field_name,
          field_label: z.field_label,
          page_number: z.page_number,
          zone_x_percent: z.zone_x_percent,
          zone_y_percent: z.zone_y_percent,
          zone_width_percent: z.zone_width_percent,
          zone_height_percent: z.zone_height_percent,
          field_type: z.field_type,
        }));

        const { error: zonesError } = await supabase
          .from('template_field_zones')
          .insert(zonesData);

        if (zonesError) throw zonesError;
      }

      toast({ title: 'Template saved successfully' });
      navigate('/carrier-templates');

    } catch (error: any) {
      toast({
        title: 'Error saving template',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Draw zones on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw document background (placeholder)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid pattern for guidance
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw placeholder text
    if (!documentUrl) {
      ctx.fillStyle = '#999999';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload a sample document to begin', canvas.width / 2, canvas.height / 2);
    }

    // Draw existing zones
    zones
      .filter(z => z.page_number === currentPage)
      .forEach(zone => {
        const x = (zone.zone_x_percent / 100) * canvas.width;
        const y = (zone.zone_y_percent / 100) * canvas.height;
        const w = (zone.zone_width_percent / 100) * canvas.width;
        const h = (zone.zone_height_percent / 100) * canvas.height;

        // Zone fill
        ctx.fillStyle = selectedZone === zone.id
          ? 'rgba(59, 130, 246, 0.3)'
          : 'rgba(34, 197, 94, 0.2)';
        ctx.fillRect(x, y, w, h);

        // Zone border
        ctx.strokeStyle = selectedZone === zone.id ? '#3b82f6' : '#22c55e';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // Label
        ctx.fillStyle = '#000000';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(zone.field_label, x + 4, y + 14);
      });

    // Draw current drawing zone
    if (drawingZone) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(
        drawingZone.startX,
        drawingZone.startY,
        drawingZone.width,
        drawingZone.height
      );
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        drawingZone.startX,
        drawingZone.startY,
        drawingZone.width,
        drawingZone.height
      );
      ctx.setLineDash([]);
    }

  }, [zones, selectedZone, drawingZone, currentPage, documentUrl]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/carrier-templates')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {id && id !== 'new' ? 'Edit Template' : 'Create Template'}
              </h1>
              <p className="text-muted-foreground">
                Define field zones to improve extraction accuracy
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/carrier-templates')}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Template
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Template Metadata */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Template Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Carrier Name *</Label>
                  <Input
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    placeholder="e.g., Travelers"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Carrier Code</Label>
                  <Input
                    value={carrierCode}
                    onChange={(e) => setCarrierCode(e.target.value)}
                    placeholder="e.g., TRAV"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Document Type *</Label>
                  <Select value={documentType} onValueChange={setDocumentType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map(dt => (
                        <SelectItem key={dt.value} value={dt.value}>
                          {dt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Line of Business</Label>
                  <Select value={lineOfBusiness} onValueChange={setLineOfBusiness}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {LINES_OF_BUSINESS.map(lob => (
                        <SelectItem key={lob.value} value={lob.value}>
                          {lob.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Template Name *</Label>
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Travelers GL Dec Page 2024"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Optional notes about this template..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Field Zones List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Field Zones</span>
                  <Badge variant="secondary">{zones.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Draw rectangles on the document to define extraction zones
                </CardDescription>
              </CardHeader>
              <CardContent>
                {zones.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No zones defined yet. Draw on the document to add zones.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {zones.map(zone => (
                      <div
                        key={zone.id}
                        className={`flex items-center justify-between p-2 rounded border cursor-pointer ${
                          selectedZone === zone.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedZone(zone.id)}
                      >
                        <div>
                          <p className="font-medium text-sm">{zone.field_label}</p>
                          <p className="text-xs text-muted-foreground">
                            {zone.acord_field_name} - Page {zone.page_number}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteZone(zone.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Document Canvas */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Document Preview</CardTitle>
                  <div className="flex items-center gap-2">
                    {/* Tool Selection */}
                    <div className="flex border rounded-lg overflow-hidden">
                      <Button
                        variant={tool === 'select' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="rounded-none"
                        onClick={() => setTool('select')}
                      >
                        <MousePointer2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={tool === 'draw' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="rounded-none"
                        onClick={() => setTool('draw')}
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Zoom */}
                    <div className="flex items-center gap-1 border rounded-lg">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                      >
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                      <span className="text-sm w-12 text-center">
                        {Math.round(zoom * 100)}%
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Page Navigation */}
                    {documentImages.length > 1 && (
                      <div className="flex items-center gap-1 border rounded-lg">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={currentPage <= 1}
                          onClick={() => setCurrentPage(currentPage - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm w-16 text-center">
                          {currentPage} / {documentImages.length}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={currentPage >= documentImages.length}
                          onClick={() => setCurrentPage(currentPage + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Upload Area */}
                {!documentUrl && (
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {isUploading ? (
                      <Loader2 className="h-12 w-12 mx-auto mb-4 text-blue-500 animate-spin" />
                    ) : (
                      <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    )}
                    <p className="text-lg font-medium mb-2">
                      {isUploading ? 'Uploading...' : 'Upload Sample Document'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Upload a typical document from this carrier to define field zones
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      PDF, PNG, or JPEG
                    </p>
                  </div>
                )}

                {/* Canvas Area */}
                {documentUrl && (
                  <div
                    ref={containerRef}
                    className="border rounded-lg overflow-auto bg-gray-100"
                    style={{ maxHeight: '600px' }}
                  >
                    <canvas
                      ref={canvasRef}
                      width={816} // 8.5" at 96 DPI
                      height={1056} // 11" at 96 DPI
                      className="bg-white shadow-lg mx-auto my-4"
                      style={{
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top center',
                        cursor: tool === 'draw' ? 'crosshair' : 'default',
                      }}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseUp}
                    />
                  </div>
                )}

                {/* Instructions */}
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">How to use:</h4>
                  <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Upload a sample document (PDF or image)</li>
                    <li>Use the rectangle tool to draw boxes around fields</li>
                    <li>Select the ACORD field each box maps to</li>
                    <li>Save the template when done</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Field Selection Dialog */}
        <Dialog open={showFieldDialog} onOpenChange={setShowFieldDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Map Field Zone</DialogTitle>
              <DialogDescription>
                Select which ACORD field this zone should extract
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>ACORD Field *</Label>
                <Select value={newFieldName} onValueChange={(v) => {
                  setNewFieldName(v);
                  const field = COMMON_ACORD_FIELDS.find(f => f.value === v);
                  if (field) setNewFieldLabel(field.label);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a field..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(
                      COMMON_ACORD_FIELDS.reduce((acc, field) => {
                        if (!acc[field.section]) acc[field.section] = [];
                        acc[field.section].push(field);
                        return acc;
                      }, {} as Record<string, typeof COMMON_ACORD_FIELDS>)
                    ).map(([section, fields]) => (
                      <React.Fragment key={section}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          {section}
                        </div>
                        {fields.map(field => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Display Label</Label>
                <Input
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="Label shown on canvas"
                />
              </div>
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select value={newFieldType} onValueChange={setNewFieldType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="currency">Currency</SelectItem>
                    <SelectItem value="checkbox">Checkbox</SelectItem>
                    <SelectItem value="table">Table</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFieldDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateZone} disabled={!newFieldName}>
                <Plus className="h-4 w-4 mr-2" />
                Add Zone
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
