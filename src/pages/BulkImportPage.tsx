import { AppLayout } from '@/components/layout/AppLayout';
import { BulkImport } from '@/components/crm/BulkImport';
import { useNavigate } from 'react-router-dom';

export default function BulkImportPage() {
  const navigate = useNavigate();

  const handleImportComplete = () => {
    // Navigate to customers page after successful import
    navigate('/customers');
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bulk Import</h1>
          <p className="text-muted-foreground">
            Import customers and policies from CSV files
          </p>
        </div>

        <BulkImport
          onImportComplete={handleImportComplete}
          className="max-w-4xl"
        />
      </div>
    </AppLayout>
  );
}
