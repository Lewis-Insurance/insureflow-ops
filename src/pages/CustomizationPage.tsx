import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomFieldsManager } from '@/components/crm/CustomFieldsManager';
import { AutomationRulesManager } from '@/components/crm/AutomationRulesManager';
import { Settings, Sliders, Zap, Database } from 'lucide-react';

export default function CustomizationPage() {
  const [leadFields, setLeadFields] = useState([]);
  const [policyFields, setPolicyFields] = useState([]);
  const [accountFields, setAccountFields] = useState([]);
  const [renewalFields, setRenewalFields] = useState([]);

  const [leadRules, setLeadRules] = useState([]);
  const [policyRules, setPolicyRules] = useState([]);
  const [accountRules, setAccountRules] = useState([]);
  const [renewalRules, setRenewalRules] = useState([]);

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Customization & Automation
          </h2>
          <p className="text-muted-foreground">
            Configure custom fields, tags, and automation rules for your insurance workflows
          </p>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="fields" className="space-y-6">
          <TabsList>
            <TabsTrigger value="fields">
              <Sliders className="h-4 w-4 mr-2" />
              Custom Fields
            </TabsTrigger>
            <TabsTrigger value="automation">
              <Zap className="h-4 w-4 mr-2" />
              Automation Rules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fields" className="space-y-6">
            <Tabs defaultValue="leads" className="space-y-4">
              <TabsList>
                <TabsTrigger value="leads">Leads</TabsTrigger>
                <TabsTrigger value="policies">Policies</TabsTrigger>
                <TabsTrigger value="accounts">Accounts</TabsTrigger>
                <TabsTrigger value="renewals">Renewals</TabsTrigger>
              </TabsList>

              <TabsContent value="leads">
                <CustomFieldsManager
                  entityType="lead"
                  fields={leadFields}
                  onFieldsChange={setLeadFields}
                />
              </TabsContent>

              <TabsContent value="policies">
                <CustomFieldsManager
                  entityType="policy"
                  fields={policyFields}
                  onFieldsChange={setPolicyFields}
                />
              </TabsContent>

              <TabsContent value="accounts">
                <CustomFieldsManager
                  entityType="account"
                  fields={accountFields}
                  onFieldsChange={setAccountFields}
                />
              </TabsContent>

              <TabsContent value="renewals">
                <CustomFieldsManager
                  entityType="renewal"
                  fields={renewalFields}
                  onFieldsChange={setRenewalFields}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <Tabs defaultValue="leads" className="space-y-4">
              <TabsList>
                <TabsTrigger value="leads">Leads</TabsTrigger>
                <TabsTrigger value="policies">Policies</TabsTrigger>
                <TabsTrigger value="accounts">Accounts</TabsTrigger>
                <TabsTrigger value="renewals">Renewals</TabsTrigger>
                <TabsTrigger value="global">Global Rules</TabsTrigger>
              </TabsList>

              <TabsContent value="leads">
                <AutomationRulesManager
                  entityType="lead"
                  rules={leadRules}
                  onRulesChange={setLeadRules}
                />
              </TabsContent>

              <TabsContent value="policies">
                <AutomationRulesManager
                  entityType="policy"
                  rules={policyRules}
                  onRulesChange={setPolicyRules}
                />
              </TabsContent>

              <TabsContent value="accounts">
                <AutomationRulesManager
                  entityType="account"
                  rules={accountRules}
                  onRulesChange={setAccountRules}
                />
              </TabsContent>

              <TabsContent value="renewals">
                <AutomationRulesManager
                  entityType="renewal"
                  rules={renewalRules}
                  onRulesChange={setRenewalRules}
                />
              </TabsContent>

              <TabsContent value="global">
                <AutomationRulesManager
                  rules={[...leadRules, ...policyRules, ...accountRules, ...renewalRules]}
                  onRulesChange={(rules) => {
                    // Distribute rules back to appropriate entity types
                    setLeadRules(rules.filter(r => r.entityTypes.includes('lead')));
                    setPolicyRules(rules.filter(r => r.entityTypes.includes('policy')));
                    setAccountRules(rules.filter(r => r.entityTypes.includes('account')));
                    setRenewalRules(rules.filter(r => r.entityTypes.includes('renewal')));
                  }}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <div className="p-4 border rounded-lg space-y-2">
            <Database className="h-6 w-6 text-primary" />
            <h3 className="font-semibold">Custom Fields</h3>
            <p className="text-sm text-muted-foreground">
              Add insurance-specific fields like deductibles, coverage types, and named insureds to capture specialized data.
            </p>
          </div>

          <div className="p-4 border rounded-lg space-y-2">
            <Sliders className="h-6 w-6 text-primary" />
            <h3 className="font-semibold">Smart Tagging</h3>
            <p className="text-sm text-muted-foreground">
              Use tags for organization and trigger automation rules based on tag additions or removals.
            </p>
          </div>

          <div className="p-4 border rounded-lg space-y-2">
            <Zap className="h-6 w-6 text-primary" />
            <h3 className="font-semibold">Automation</h3>
            <p className="text-sm text-muted-foreground">
              Create workflows that trigger on carriers, policy types, custom fields, and more to automate your processes.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
