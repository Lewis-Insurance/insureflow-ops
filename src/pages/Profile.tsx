import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AppLayout } from '@/components/layout/AppLayout';
import { User, Phone, Mail, Shield, Calendar, Save, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface ProfileFormData {
  full_name: string;
  phone: string;
  role: string;
}

export default function Profile() {
  const { user, profile } = useAuth();
  const [formData, setFormData] = useState<ProfileFormData>({
    full_name: '',
    phone: '',
    role: '',
  });
  const [loading, setLoading] = useState(false);
  const [showEmailSection, setShowEmailSection] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        role: profile.role || 'staff',
      });
    }
  }, [profile]);

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name.trim(),
          phone: formData.phone.trim(),
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your profile information has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error updating profile",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
      case 'owner':
        return 'default';
      case 'producer':
      case 'staff':
        return 'secondary';
      case 'csr':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  if (!user || !profile) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">Loading Profile...</h2>
            <p className="text-muted-foreground">Please wait while we load your profile information.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Profile Settings</h2>
            <p className="text-muted-foreground">
              Manage your account information and preferences
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Profile Overview */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Profile Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="text-lg font-semibold">
                    {getInitials(profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                
                <div>
                  <h3 className="text-xl font-semibold">
                    {profile.full_name || 'Unnamed User'}
                  </h3>
                  <Badge variant={getRoleBadgeVariant(profile.role)} className="mt-2 capitalize">
                    {profile.role}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>

                {profile.phone && (
                  <div className="flex items-center space-x-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Phone</p>
                      <p className="text-sm text-muted-foreground">{profile.phone}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Role</p>
                    <p className="text-sm text-muted-foreground capitalize">{profile.role}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Member Since</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(profile.created_at), 'MMMM yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edit Profile Form */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Edit Profile</CardTitle>
              <CardDescription>
                Update your personal information and contact details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => handleInputChange('full_name', e.target.value)}
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="email"
                      value={user.email || ''}
                      disabled
                      className="bg-muted"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowEmailSection(!showEmailSection)}
                    >
                      {showEmailSection ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Email changes require administrator approval
                  </p>
                </div>

                {showEmailSection && (
                  <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                    <CardContent className="pt-4">
                      <div className="flex items-start space-x-3">
                        <Shield className="h-5 w-5 text-orange-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-orange-800 dark:text-orange-200">
                            Email Change Request
                          </h4>
                          <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                            To change your email address, please contact your system administrator. 
                            This security measure helps protect your account and maintain data integrity.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select value={formData.role} disabled>
                    <SelectTrigger className="bg-muted">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="producer">Producer</SelectItem>
                      <SelectItem value="csr">CSR</SelectItem>
                      <SelectItem value="accounting">Accounting</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Role changes require administrator approval
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Account Security Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account Security</CardTitle>
            <CardDescription>
              Manage your account security settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Password</h4>
                  <p className="text-sm text-muted-foreground">
                    Last updated: Not available
                  </p>
                </div>
                <Button variant="outline" disabled>
                  Change Password
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Two-Factor Authentication</h4>
                  <p className="text-sm text-muted-foreground">
                    Add an extra layer of security to your account
                  </p>
                </div>
                <Badge variant="secondary">Coming Soon</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}