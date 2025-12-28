// ============================================
// Settings Editor Component
// Editor for intake form settings
// ============================================

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { IntakeTemplate } from '@/types/intake';

// ============================================
// TYPES
// ============================================

interface SettingsEditorProps {
  settings: IntakeTemplate['settings'];
  onChange: (settings: IntakeTemplate['settings']) => void;
}

// ============================================
// COMPONENT
// ============================================

export function SettingsEditor({ settings, onChange }: SettingsEditorProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Form Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Save Draft</Label>
              <p className="text-sm text-muted-foreground">
                Let users save and return later
              </p>
            </div>
            <Switch
              checked={settings.allowSaveDraft}
              onCheckedChange={(checked) =>
                onChange({ ...settings, allowSaveDraft: checked })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Show Progress Bar</Label>
              <p className="text-sm text-muted-foreground">
                Display completion progress
              </p>
            </div>
            <Switch
              checked={settings.showProgressBar}
              onCheckedChange={(checked) =>
                onChange({ ...settings, showProgressBar: checked })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Require Email</Label>
              <p className="text-sm text-muted-foreground">
                Require email for submissions
              </p>
            </div>
            <Switch
              checked={settings.requireEmail}
              onCheckedChange={(checked) =>
                onChange({ ...settings, requireEmail: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Confirmation Email</Label>
              <p className="text-sm text-muted-foreground">
                Send confirmation to submitter
              </p>
            </div>
            <Switch
              checked={settings.sendConfirmationEmail}
              onCheckedChange={(checked) =>
                onChange({ ...settings, sendConfirmationEmail: checked })
              }
            />
          </div>
          <div>
            <Label>Notify on Submission</Label>
            <Input
              value={settings.notifyOnSubmission?.join(', ') || ''}
              onChange={(e) =>
                onChange({
                  ...settings,
                  notifyOnSubmission: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="email1@example.com, email2@example.com"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Comma-separated list of email addresses
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Link Expiration (days)</Label>
            <Input
              type="number"
              value={settings.expirationDays}
              onChange={(e) =>
                onChange({ ...settings, expirationDays: parseInt(e.target.value) || 30 })
              }
              min={1}
              max={365}
            />
          </div>
          <div>
            <Label>Rate Limit - Max Requests</Label>
            <Input
              type="number"
              value={settings.rateLimit?.maxRequests || 10}
              onChange={(e) =>
                onChange({
                  ...settings,
                  rateLimit: {
                    ...settings.rateLimit,
                    maxRequests: parseInt(e.target.value) || 10,
                  },
                })
              }
              min={1}
            />
          </div>
          <div>
            <Label>Rate Limit Window (hours)</Label>
            <Input
              type="number"
              value={settings.rateLimit?.windowHours || 1}
              onChange={(e) =>
                onChange({
                  ...settings,
                  rateLimit: {
                    ...settings.rateLimit,
                    windowHours: parseInt(e.target.value) || 1,
                  },
                })
              }
              min={1}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Thank You Message</Label>
            <Textarea
              value={settings.customThankYouMessage || ''}
              onChange={(e) =>
                onChange({ ...settings, customThankYouMessage: e.target.value })
              }
              placeholder="Thank you for your submission!"
            />
          </div>
          <div>
            <Label>Redirect URL (optional)</Label>
            <Input
              value={settings.redirectUrl || ''}
              onChange={(e) => onChange({ ...settings, redirectUrl: e.target.value })}
              placeholder="https://yoursite.com/thank-you"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsEditor;
