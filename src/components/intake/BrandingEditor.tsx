// ============================================
// Branding Editor Component
// Editor for intake form branding and styling
// ============================================

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { IntakeTemplate } from '@/types/intake';

// ============================================
// TYPES
// ============================================

interface BrandingEditorProps {
  branding: IntakeTemplate['branding'];
  onChange: (branding: IntakeTemplate['branding']) => void;
}

// ============================================
// COMPONENT
// ============================================

export function BrandingEditor({ branding, onChange }: BrandingEditorProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Logo & Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Logo URL</Label>
            <Input
              value={branding.logoUrl || ''}
              onChange={(e) => onChange({ ...branding, logoUrl: e.target.value })}
              placeholder="https://yoursite.com/logo.png"
            />
          </div>
          <div>
            <Label>Company Name</Label>
            <Input
              value={branding.companyName || ''}
              onChange={(e) => onChange({ ...branding, companyName: e.target.value })}
              placeholder="Your Company Name"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Colors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Primary Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={branding.primaryColor || '#3B82F6'}
                onChange={(e) =>
                  onChange({ ...branding, primaryColor: e.target.value })
                }
                className="w-16 h-10 p-1"
              />
              <Input
                value={branding.primaryColor || '#3B82F6'}
                onChange={(e) =>
                  onChange({ ...branding, primaryColor: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <Label>Secondary Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={branding.secondaryColor || '#1E40AF'}
                onChange={(e) =>
                  onChange({ ...branding, secondaryColor: e.target.value })
                }
                className="w-16 h-10 p-1"
              />
              <Input
                value={branding.secondaryColor || '#1E40AF'}
                onChange={(e) =>
                  onChange({ ...branding, secondaryColor: e.target.value })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Custom HTML</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Header HTML</Label>
            <Textarea
              value={branding.headerHtml || ''}
              onChange={(e) => onChange({ ...branding, headerHtml: e.target.value })}
              placeholder="<div>Custom header content</div>"
              rows={3}
            />
          </div>
          <div>
            <Label>Footer HTML</Label>
            <Textarea
              value={branding.footerHtml || ''}
              onChange={(e) => onChange({ ...branding, footerHtml: e.target.value })}
              placeholder="<div>Custom footer content</div>"
              rows={3}
            />
          </div>
          <div>
            <Label>Custom CSS</Label>
            <Textarea
              value={branding.customCss || ''}
              onChange={(e) => onChange({ ...branding, customCss: e.target.value })}
              placeholder=".custom-class { color: red; }"
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default BrandingEditor;
