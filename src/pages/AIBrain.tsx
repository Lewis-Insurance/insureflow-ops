import InsuranceAIBrain from "@/components/AIBrain";
import KnowledgeManager from "@/components/KnowledgeManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AIBrainPage() {
  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue="search" className="space-y-4">
        <TabsList>
          <TabsTrigger value="search">AI Search</TabsTrigger>
          <TabsTrigger value="manage">Manage Knowledge</TabsTrigger>
        </TabsList>
        
        <TabsContent value="search">
          <InsuranceAIBrain />
        </TabsContent>
        
        <TabsContent value="manage">
          <KnowledgeManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
