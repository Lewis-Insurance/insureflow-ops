import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
import { Button } from './button';
import { Badge } from './badge';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content with useful information.</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const PolicyCard: Story = {
  render: () => (
    <Card className="w-[400px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Auto Insurance</CardTitle>
          <Badge variant="default">Active</Badge>
        </div>
        <CardDescription>Policy #POL-2024-001234</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Premium</span>
            <span className="font-medium">$1,250/yr</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Effective</span>
            <span>Jan 1, 2024</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expires</span>
            <span>Jan 1, 2025</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" size="sm">View Details</Button>
        <Button size="sm">Renew</Button>
      </CardFooter>
    </Card>
  ),
};

export const QuoteCard: Story = {
  render: () => (
    <Card className="w-[400px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Quote #Q-2024-5678</CardTitle>
          <Badge variant="secondary">Pending</Badge>
        </div>
        <CardDescription>Homeowners Insurance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-3xl font-bold">$2,450<span className="text-sm font-normal text-muted-foreground">/yr</span></div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coverage</span>
              <span>$350,000</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deductible</span>
              <span>$1,000</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Score</span>
              <span className="text-green-600 font-medium">85/100</span>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" className="flex-1">Decline</Button>
        <Button className="flex-1">Accept Quote</Button>
      </CardFooter>
    </Card>
  ),
};

export const LeadCard: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">John Smith</CardTitle>
          <Badge>New</Badge>
        </div>
        <CardDescription>john.smith@email.com</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Phone</span>
            <span>(555) 123-4567</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Interest</span>
            <span>Auto, Home</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lead Score</span>
            <span className="font-medium">72</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Contact Lead</Button>
      </CardFooter>
    </Card>
  ),
};

export const StatsCard: Story = {
  render: () => (
    <div className="flex gap-4">
      <Card className="w-[200px]">
        <CardHeader className="pb-2">
          <CardDescription>Total Policies</CardDescription>
          <CardTitle className="text-4xl">1,234</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">+12% from last month</p>
        </CardContent>
      </Card>
      <Card className="w-[200px]">
        <CardHeader className="pb-2">
          <CardDescription>Premium Volume</CardDescription>
          <CardTitle className="text-4xl">$2.4M</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">+8% from last month</p>
        </CardContent>
      </Card>
      <Card className="w-[200px]">
        <CardHeader className="pb-2">
          <CardDescription>Active Leads</CardDescription>
          <CardTitle className="text-4xl">89</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">+23 new this week</p>
        </CardContent>
      </Card>
    </div>
  ),
};
