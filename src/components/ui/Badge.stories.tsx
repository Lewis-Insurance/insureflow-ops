import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Badge',
    variant: 'default',
  },
};

export const Secondary: Story = {
  args: {
    children: 'Secondary',
    variant: 'secondary',
  },
};

export const Destructive: Story = {
  args: {
    children: 'Destructive',
    variant: 'destructive',
  },
};

export const Outline: Story = {
  args: {
    children: 'Outline',
    variant: 'outline',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

export const InsuranceStatuses: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <span className="text-sm text-muted-foreground w-24">Policy:</span>
        <Badge variant="default">Active</Badge>
        <Badge variant="secondary">Pending</Badge>
        <Badge variant="destructive">Expired</Badge>
        <Badge variant="outline">Cancelled</Badge>
      </div>
      <div className="flex gap-2">
        <span className="text-sm text-muted-foreground w-24">Lead:</span>
        <Badge variant="default">New</Badge>
        <Badge variant="secondary">Contacted</Badge>
        <Badge variant="default">Qualified</Badge>
        <Badge variant="outline">Nurturing</Badge>
      </div>
      <div className="flex gap-2">
        <span className="text-sm text-muted-foreground w-24">Quote:</span>
        <Badge variant="secondary">Draft</Badge>
        <Badge variant="default">Sent</Badge>
        <Badge variant="default">Accepted</Badge>
        <Badge variant="destructive">Declined</Badge>
      </div>
    </div>
  ),
};
