import React from 'react';
import { Eye, EyeOff, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSSNReveal } from '@/hooks/useSSNReveal';
import { PermissionGuard } from '@/components/common/PermissionGuard';

interface SSNRevealProps {
  contactId: string;
  encryptedSSN?: string;
  ssnLast4?: string;
  className?: string;
}

export function SSNReveal({ 
  contactId, 
  encryptedSSN, 
  ssnLast4,
  className = ""
}: SSNRevealProps) {
  const {
    revealSSN,
    hideSSN,
    isRevealed,
    getRevealedSSN,
    isLoading,
    canRevealSSN
  } = useSSNReveal();

  const revealed = isRevealed(contactId);
  const loading = isLoading(contactId);
  const fullSSN = getRevealedSSN(contactId);

  if (!ssnLast4 && !encryptedSSN) {
    return (
      <span className={`text-muted-foreground italic ${className}`}>
        No SSN on file
      </span>
    );
  }

  const handleReveal = () => {
    if (revealed) {
      hideSSN(contactId);
    } else if (encryptedSSN) {
      revealSSN(contactId, encryptedSSN);
    }
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <span className="font-mono">
        {revealed && fullSSN ? (
          <span className="bg-yellow-100 dark:bg-yellow-900/20 px-2 py-1 rounded">
            {fullSSN}
          </span>
        ) : (
          `***-**-${ssnLast4 || '****'}`
        )}
      </span>

      <PermissionGuard permission="canRevealSSN">
        {encryptedSSN && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleReveal}
            disabled={loading}
            title={revealed ? "Hide full SSN" : "Reveal full SSN"}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
            ) : revealed ? (
              <EyeOff className="h-3 w-3" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
          </Button>
        )}
      </PermissionGuard>

      {!canRevealSSN && (
        <Badge variant="secondary" className="text-xs">
          <Shield className="h-3 w-3 mr-1" />
          Protected
        </Badge>
      )}
    </div>
  );
}