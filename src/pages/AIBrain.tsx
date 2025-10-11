import InsuranceAIBrain from "@/components/AIBrain";
import KnowledgeManager from "@/components/KnowledgeManager";
import SmartQA from "@/components/SmartQA";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Brain, Database } from "lucide-react";

export default function AIBrainPage() {
  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue="smart-qa" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="smart-qa" className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Smart Q&A
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            AI Search
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Manage Knowledge
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="smart-qa">
          <SmartQA />
        </TabsContent>
        
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
