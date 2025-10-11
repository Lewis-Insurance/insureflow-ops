import KnowledgeManager from "@/components/KnowledgeManager";
import { AppLayout } from "@/components/layout/AppLayout";

export default function KnowledgeManagerPage() {
  return (
    <AppLayout>
      <div className="container mx-auto py-6">
        <KnowledgeManager />
      </div>
    </AppLayout>
  );
}
