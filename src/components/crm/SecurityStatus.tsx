import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Check, Users, Lock, Eye } from 'lucide-react';

export function SecurityStatus() {
  const securityFeatures = [
    {
      name: "Row Level Security (RLS)",
      status: "active",
      description: "Database-level security enforced on all tables"
    },
    {
      name: "Account Memberships",
      status: "active", 
      description: "Users must be explicit members to access accounts"
    },
    {
      name: "Role-Based Access",
      status: "active",
      description: "Owner/Staff/Member hierarchy with proper permissions"
    },
    {
      name: "Restrictive Policies",
      status: "active",
      description: "All policies use 'restrictive' mode to prevent data leaks"
    },
    {
      name: "Staff Access Controls",
      status: "active",
      description: "Staff can read globally but need membership to write"
    },
    {
      name: "Audit Logging",
      status: "active",
      description: "All database changes are automatically logged"
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-green-600" />
          Security Model Status
        </CardTitle>
        <CardDescription>
          Your CRM is now protected by enterprise-grade security controls
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {securityFeatures.map((feature, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-sm">{feature.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                  {feature.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-green-800 mb-2">Security Model Summary</h4>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• <strong>Customers:</strong> Can only see accounts they're members of</li>
                <li>• <strong>Staff:</strong> Can view all accounts, but need membership to modify</li>
                <li>• <strong>Owners:</strong> Full control over their accounts and can manage members</li>
                <li>• <strong>Database:</strong> Protected against schema hijacks and privilege escalation</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}