import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateIssue, type IssueCategory, type IssueSeverity, useUploadIssueAttachment } from '@/hooks/useIssueTracking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  Upload,
  X,
  Camera,
  Video,
  File,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
} from 'lucide-react';

export default function ReportIssue() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createIssueMutation = useCreateIssue();
  const uploadAttachmentMutation = useUploadIssueAttachment();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '' as IssueCategory,
    severity: 'medium' as IssueSeverity,
    steps_to_reproduce: '',
    expected_behavior: '',
    actual_behavior: '',
    error_message: '',
    is_blocker: false,
    is_regression: false,
  });

  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setAttachments((prev) => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Create the issue
      const issue = await createIssueMutation.mutateAsync(formData);

      // Upload attachments
      for (const file of attachments) {
        const attachmentType = file.type.startsWith('image/')
          ? 'screenshot'
          : file.type.startsWith('video/')
          ? 'screen_recording'
          : 'document';

        await uploadAttachmentMutation.mutateAsync({
          issue_id: issue.id,
          file,
          attachment_type: attachmentType,
        });
      }

      // Navigate to the issue detail page
      navigate(`/issues/${issue.id}`);
    } catch (error) {
      console.error('Failed to create issue:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = formData.title && formData.description && formData.category;

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/issues')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Issues
        </Button>

        <h1 className="text-3xl font-bold">Report an Issue</h1>
        <p className="text-muted-foreground">
          Help us improve by reporting bugs, requesting features, or suggesting improvements
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Basic Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Provide a clear title and description of the issue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Issue Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="Brief, descriptive title (e.g., 'Login button not working on mobile')"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Provide a detailed description of the issue..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={6}
                required
              />
              <p className="text-xs text-muted-foreground">
                Include what you were trying to do, what happened, and what you expected to happen
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Categorization */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Categorization</CardTitle>
            <CardDescription>Help us route your issue to the right team</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">
                  Category <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData({ ...formData, category: value as IssueCategory })
                  }
                  required
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">🐛 Bug - Something isn't working</SelectItem>
                    <SelectItem value="feature_request">
                      💡 Feature Request - New functionality
                    </SelectItem>
                    <SelectItem value="ui_ux">🎨 UI/UX - Design or usability issue</SelectItem>
                    <SelectItem value="performance">⚡ Performance - Slow or laggy</SelectItem>
                    <SelectItem value="security">🔒 Security - Security concern</SelectItem>
                    <SelectItem value="data_issue">📊 Data Issue - Incorrect data</SelectItem>
                    <SelectItem value="integration">
                      🔗 Integration - Third-party connection
                    </SelectItem>
                    <SelectItem value="other">📋 Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="severity">
                  Severity <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.severity}
                  onValueChange={(value) =>
                    setFormData({ ...formData, severity: value as IssueSeverity })
                  }
                  required
                >
                  <SelectTrigger id="severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">
                      🚨 Critical - System down, data loss
                    </SelectItem>
                    <SelectItem value="high">⚠️ High - Major functionality broken</SelectItem>
                    <SelectItem value="medium">📌 Medium - Moderate impact</SelectItem>
                    <SelectItem value="low">ℹ️ Low - Minor issue or cosmetic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_blocker"
                  checked={formData.is_blocker}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_blocker: checked as boolean })
                  }
                />
                <Label htmlFor="is_blocker" className="font-normal cursor-pointer">
                  🚫 This is blocking my work
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_regression"
                  checked={formData.is_regression}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_regression: checked as boolean })
                  }
                />
                <Label htmlFor="is_regression" className="font-normal cursor-pointer">
                  🔄 This was working before
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Detailed Information</CardTitle>
            <CardDescription>
              Help us understand and reproduce the issue (optional but recommended)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="steps">Steps to Reproduce</Label>
              <Textarea
                id="steps"
                placeholder="1. Go to page...&#10;2. Click on...&#10;3. Notice that..."
                value={formData.steps_to_reproduce}
                onChange={(e) =>
                  setFormData({ ...formData, steps_to_reproduce: e.target.value })
                }
                rows={4}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expected">Expected Behavior</Label>
                <Textarea
                  id="expected"
                  placeholder="What should have happened?"
                  value={formData.expected_behavior}
                  onChange={(e) =>
                    setFormData({ ...formData, expected_behavior: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="actual">Actual Behavior</Label>
                <Textarea
                  id="actual"
                  placeholder="What actually happened?"
                  value={formData.actual_behavior}
                  onChange={(e) => setFormData({ ...formData, actual_behavior: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="error">Error Message (if any)</Label>
              <Textarea
                id="error"
                placeholder="Paste any error messages you saw..."
                value={formData.error_message}
                onChange={(e) => setFormData({ ...formData, error_message: e.target.value })}
                rows={3}
                className="font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Attachments */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Attachments</CardTitle>
            <CardDescription>
              Screenshots, screen recordings, or relevant files help us understand the issue better
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.log,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />

              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Files
              </Button>

              <p className="text-xs text-muted-foreground mt-2">
                Accepted: Images, videos, PDFs, log files. Max 10MB per file.
              </p>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-2">
                <Label>Attached Files ({attachments.length})</Label>
                <div className="space-y-2">
                  {attachments.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {file.type.startsWith('image/') ? (
                          <Camera className="h-4 w-4 text-blue-600" />
                        ) : file.type.startsWith('video/') ? (
                          <Video className="h-4 w-4 text-purple-600" />
                        ) : (
                          <File className="h-4 w-4 text-gray-600" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttachment(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tips */}
        <Alert className="mb-6">
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>
            <strong>💡 Tips for effective issue reporting:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Be specific and concise in your title</li>
              <li>Include screenshots or recordings when possible</li>
              <li>List clear steps to reproduce the issue</li>
              <li>Mention what page or feature you were using</li>
              <li>Include any error messages you saw</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/issues')}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? (
              <>
                <AlertCircle className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Submit Issue
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
