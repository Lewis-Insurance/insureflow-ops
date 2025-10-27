import { ReactNode } from 'react';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { Building2, Home, Users, FileText, Calendar, Phone, MessageSquare, CheckSquare, BarChart3, Settings, LogOut, Radio, Target, TrendingUp, Heart, Shield, DollarSign, Brain, Bot, Ticket, Database, BookMarked, Scale, Briefcase, LayoutDashboard, UserPlus, Sliders, Mail, RefreshCw } from 'lucide-react';
import { NavItem } from './NavItem';
import { NavGroup } from './NavGroup';
import { GlobalSearch } from '@/components/crm/GlobalSearch';
import { SidebarMenu } from '@/components/ui/sidebar';
import { NotificationCenter } from '@/components/tasks/NotificationCenter';
import { AIAssistantModal } from '@/components/ai/AIAssistantModal';
import { AIAssistantSidebar } from '@/components/ai/AIAssistantSidebar';
import { AIAssistantProvider, useAIAssistantContext } from '@/contexts/AIAssistantContext';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface AppLayoutProps {
  children: ReactNode;
}

function AppLayoutContent({ children }: AppLayoutProps) {
  const { user, profile, signOut } = useAuth();
  const { 
    isModalOpen, 
    openModal,
    closeModal,
    isSidebarOpen, 
    openSidebar, 
    closeSidebar,
    context 
  } = useAIAssistantContext();

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center justify-start px-4 py-3">
              <img 
                src="/lovable-uploads/638e588a-8405-4da7-8119-439f406132da.png" 
                alt="Lewis Insurance"
                className="h-24 w-auto"
              />
            </div>
            
            {/* Global Search */}
            <div className="px-4 pb-4">
              <GlobalSearch className="w-full" />
            </div>
          </SidebarHeader>
          
          <SidebarContent>
            <div className="flex flex-col space-y-1 px-1">
              {/* Top Level Items */}
              <SidebarMenu>
                <NavItem 
                  icon={LayoutDashboard} 
                  label="My Dashboard" 
                  to="/dashboard" 
                />
                <NavItem 
                  icon={UserPlus} 
                  label="Leads" 
                  to="/leads" 
                />
              </SidebarMenu>

              {/* CRM Group */}
              <NavGroup label="CRM" defaultOpen={true}>
                <NavItem 
                  icon={Users} 
                  label="Customers" 
                  to="/customers" 
                />
                <NavItem 
                  icon={FileText} 
                  label="Policies" 
                  to="/policies" 
                />
                <NavItem 
                  icon={Calendar} 
                  label="Renewals" 
                  to="/renewals" 
                />
                <NavItem 
                  icon={Brain} 
                  label="Renewal Intelligence" 
                  to="/renewals/intelligence" 
                  badge="AI"
                />
                <NavItem 
                  icon={Phone} 
                  label="Calls" 
                  to="/calls" 
                />
                <NavItem 
                  icon={MessageSquare} 
                  label="SMS" 
                  to="/sms" 
                />
                <NavItem 
                  icon={Ticket} 
                  label="Service Tickets" 
                  to="/tickets" 
                />
              </NavGroup>

              {/* Command Center Group */}
              <NavGroup label="Command Center" defaultOpen={false}>
                <NavItem 
                  icon={BarChart3} 
                  label="Agency Dashboard" 
                  to="/dashboard/agency"
                />
                <NavItem
                  icon={Target}
                  label="Executive"
                  to="/executive"
                />
                <NavItem
                  icon={TrendingUp}
                  label="Analytics"
                  to="/analytics"
                />
                <NavItem
                  icon={Shield}
                  label="Retention"
                  to="/retention"
                />
                <NavItem
                  icon={DollarSign}
                  label="Financial"
                  to="/financial"
                />
                <NavItem
                  icon={Brain}
                  label="AI Brain"
                  to="/ai-brain"
                />
                <NavItem
                  icon={BookMarked}
                  label="Knowledge Manager"
                  to="/knowledge-manager"
                />
                <NavItem 
                  icon={BarChart3} 
                  label="Reports" 
                  to="/reports" 
                />
                <NavItem 
                  icon={Sliders} 
                  label="Customization" 
                  to="/customization"
                />
                <NavItem
                  icon={Heart}
                  label="Customer Success"
                  to="/customer-success"
                />
                <NavItem 
                  icon={Radio} 
                  label="Command Center" 
                  to="/command-center" 
                />
              </NavGroup>

              {/* Additional Items */}
              <SidebarMenu>
                <NavItem 
                  icon={CheckSquare} 
                  label="Tasks" 
                  to="/tasks" 
                />
                <NavItem 
                  icon={Mail} 
                  label="Campaigns" 
                  to="/campaigns" 
                />
                <NavItem
                  icon={Building2}
                  label="Carriers"
                  to="/carriers"
                />
                {profile?.role === 'admin' && (
                  <NavItem 
                    icon={Shield} 
                    label="Admin" 
                    to="/admin" 
                  />
                )}
              </SidebarMenu>
            </div>
          </SidebarContent>
          
          <SidebarFooter>
            <div className="px-3 py-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start space-x-2 h-auto p-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(profile?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-medium text-sidebar-foreground">
                        {profile?.full_name || 'User'}
                      </span>
                      <span className="text-xs text-sidebar-foreground/60 capitalize">
                        {profile?.role || 'Staff'}
                      </span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center">
                      <Settings className="mr-2 h-4 w-4" />
                      Profile Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SidebarFooter>
        </Sidebar>
        
        <div className="flex-1 flex flex-col">
          <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-14 items-center justify-between px-4">
              <SidebarTrigger />
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openSidebar()}
                  className="gap-2"
                >
                  <Bot className="h-4 w-4" />
                  <span className="hidden sm:inline">AI Assistant</span>
                </Button>
                <NotificationCenter />
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>

      {/* AI Assistant Modal */}
      <AIAssistantModal 
        open={isModalOpen} 
        onOpenChange={(open) => open ? openModal() : closeModal()}
        context={context}
      />
      
      {/* AI Assistant Sidebar */}
      <AIAssistantSidebar 
        open={isSidebarOpen} 
        onOpenChange={(open) => open ? openSidebar() : closeSidebar()}
        context={context}
      />
    </SidebarProvider>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <AIAssistantProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </AIAssistantProvider>
  );
}