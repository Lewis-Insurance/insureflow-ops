import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

export const DocumentFocusSelector = ({ 
  value, 
  onChange,
  customRange,
  onCustomRangeChange,
  disabled = false
}: {
  value: string;
  onChange: (value: string) => void;
  customRange: string;
  onCustomRangeChange: (value: string) => void;
  disabled?: boolean;
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>📄</span>
          Document Focus Region
        </CardTitle>
        <CardDescription>
          For large documents, tell us where to find the important coverage information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="focus-region">Focus Region</Label>
          <Select value={value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger id="focus-region">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="smart">
                <div className="flex flex-col">
                  <span className="font-medium">🤖 Smart (Auto-detect)</span>
                  <span className="text-xs text-muted-foreground">
                    Scans for declarations, coverage, premium keywords
                  </span>
                </div>
              </SelectItem>
              
              <SelectItem value="front">
                <div className="flex flex-col">
                  <span className="font-medium">📄 Front (Pages 1-10)</span>
                  <span className="text-xs text-muted-foreground">
                    Common for most insurance declarations
                  </span>
                </div>
              </SelectItem>
              
              <SelectItem value="middle">
                <div className="flex flex-col">
                  <span className="font-medium">📑 Middle (Centered 10 pages)</span>
                  <span className="text-xs text-muted-foreground">
                    10 pages centered in the middle of document
                  </span>
                </div>
              </SelectItem>
              
              <SelectItem value="end">
                <div className="flex flex-col">
                  <span className="font-medium">📋 End (Last 10 Pages)</span>
                  <span className="text-xs text-muted-foreground">
                    Summary or schedule sections at end
                  </span>
                </div>
              </SelectItem>
              
              <SelectItem value="first_third">
                <div className="flex flex-col">
                  <span className="font-medium">📊 First Third</span>
                  <span className="text-xs text-muted-foreground">
                    First 1/3 of document (up to 20 pages)
                  </span>
                </div>
              </SelectItem>
              
              <SelectItem value="middle_third">
                <div className="flex flex-col">
                  <span className="font-medium">📊 Middle Third</span>
                  <span className="text-xs text-muted-foreground">
                    Middle 1/3 of document (up to 20 pages)
                  </span>
                </div>
              </SelectItem>
              
              <SelectItem value="last_third">
                <div className="flex flex-col">
                  <span className="font-medium">📊 Last Third</span>
                  <span className="text-xs text-muted-foreground">
                    Last 1/3 of document (up to 20 pages)
                  </span>
                </div>
              </SelectItem>
              
              <SelectItem value="custom">
                <div className="flex flex-col">
                  <span className="font-medium">🎯 Custom Range</span>
                  <span className="text-xs text-muted-foreground">
                    Specify exact pages to analyze
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {value === 'custom' && (
          <div className="space-y-2">
            <Label htmlFor="page-range">Page Range</Label>
            <Input
              id="page-range"
              placeholder="e.g., 2-5 or 15-25"
              value={customRange}
              onChange={(e) => onCustomRangeChange(e.target.value)}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Enter page range like "2-5" to analyze pages 2 through 5
            </p>
          </div>
        )}

        {value !== 'custom' && value !== 'smart' && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {value === 'front' && "Will analyze pages 1-10"}
              {value === 'middle' && "Will analyze 10 pages centered in the middle"}
              {value === 'end' && "Will analyze the last 10 pages"}
              {value === 'first_third' && "Will analyze the first third (up to 20 pages)"}
              {value === 'middle_third' && "Will analyze the middle third (up to 20 pages)"}
              {value === 'last_third' && "Will analyze the last third (up to 20 pages)"}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
