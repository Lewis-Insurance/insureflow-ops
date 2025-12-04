# Mobile Responsiveness Guide

## Tailwind Breakpoints

```
sm: 640px   // Small devices (landscape phones)
md: 768px   // Medium devices (tablets)
lg: 1024px  // Large devices (desktops)
xl: 1280px  // Extra large devices (large desktops)
2xl: 1536px // 2X extra large devices
```

## Mobile-First Approach

✅ **DO** - Start mobile, scale up:
```tsx
<div className="w-full md:w-1/2 lg:w-1/3">
  {/* Full width on mobile, half on tablet, third on desktop */}
</div>
```

❌ **DON'T** - Start desktop, scale down:
```tsx
<div className="w-1/3 md:w-1/2 sm:w-full">
  {/* Awkward scaling */}
</div>
```

## Responsive Grids

### Card Grids
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map((item) => <Card key={item.id} />)}
</div>
```

### Form Grids
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <FormField />
  <FormField />
</div>
```

## Responsive Tables

### Option 1: Horizontal Scroll
```tsx
<div className="overflow-x-auto">
  <table className="min-w-full">
    {/* Table content */}
  </table>
</div>
```

### Option 2: Card View on Mobile
```tsx
{/* Desktop: Table */}
<div className="hidden md:block">
  <table>...</table>
</div>

{/* Mobile: Cards */}
<div className="md:hidden space-y-4">
  {items.map((item) => (
    <Card key={item.id}>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="font-medium">Name:</span>
            <span>{item.name}</span>
          </div>
          {/* More fields */}
        </div>
      </CardContent>
    </Card>
  ))}
</div>
```

### Option 3: Hide Non-Essential Columns
```tsx
<table>
  <thead>
    <tr>
      <th>Name</th>
      <th className="hidden md:table-cell">Email</th>
      <th className="hidden lg:table-cell">Phone</th>
      <th>Actions</th>
    </tr>
  </thead>
</table>
```

## Responsive Navigation

### Mobile Menu Pattern
```tsx
<div className="flex items-center justify-between">
  {/* Logo */}
  <div className="flex items-center">
    <Logo />
  </div>

  {/* Desktop Navigation */}
  <nav className="hidden md:flex space-x-4">
    <NavLink />
    <NavLink />
  </nav>

  {/* Mobile Menu Button */}
  <Sheet>
    <SheetTrigger className="md:hidden">
      <Menu />
    </SheetTrigger>
    <SheetContent>
      {/* Mobile nav items */}
    </SheetContent>
  </Sheet>
</div>
```

## Responsive Typography

```tsx
<h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">
  Scales with screen size
</h1>

<p className="text-sm md:text-base">
  Body text
</p>
```

## Responsive Spacing

```tsx
<div className="p-4 md:p-6 lg:p-8">
  {/* More padding on larger screens */}
</div>

<div className="space-y-4 md:space-y-6">
  {/* More vertical spacing on larger screens */}
</div>
```

## Responsive Flex Layouts

### Stack on Mobile, Row on Desktop
```tsx
<div className="flex flex-col md:flex-row gap-4">
  <div className="flex-1">Column 1</div>
  <div className="flex-1">Column 2</div>
</div>
```

### Reverse Order on Mobile
```tsx
<div className="flex flex-col-reverse md:flex-row">
  <div>Shows second on mobile, first on desktop</div>
  <div>Shows first on mobile, second on desktop</div>
</div>
```

## Responsive Modals/Dialogs

```tsx
<DialogContent className="sm:max-w-[425px] md:max-w-[600px] lg:max-w-[800px]">
  {/* Modal scales with screen size */}
</DialogContent>
```

## Hide/Show by Breakpoint

```tsx
{/* Show only on mobile */}
<div className="block md:hidden">Mobile only</div>

{/* Show only on desktop */}
<div className="hidden md:block">Desktop only</div>

{/* Show on tablet and above */}
<div className="hidden md:block">Tablet and up</div>
```

## Responsive Images

```tsx
<img
  src="image.jpg"
  className="w-full h-auto"
  alt="Responsive image"
/>

{/* Different aspect ratios */}
<div className="aspect-square md:aspect-video">
  <img className="w-full h-full object-cover" />
</div>
```

## Touch-Friendly Targets

```tsx
{/* Ensure buttons are at least 44x44px on mobile */}
<Button className="min-h-[44px] min-w-[44px]">
  Tap Me
</Button>

{/* Add more spacing between clickable items */}
<div className="flex gap-3 md:gap-2">
  <Button />
  <Button />
</div>
```

## Responsive Forms

```tsx
<form className="space-y-4">
  {/* Stack form fields on mobile */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <FormField />
    <FormField />
  </div>

  {/* Full-width buttons on mobile */}
  <div className="flex flex-col md:flex-row gap-2">
    <Button className="w-full md:w-auto">Submit</Button>
    <Button className="w-full md:w-auto" variant="outline">
      Cancel
    </Button>
  </div>
</form>
```

## Container Patterns

```tsx
{/* Responsive container with max width */}
<div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
  {/* Content constrained with responsive padding */}
</div>
```

## Testing Checklist

- [ ] Test on mobile viewport (375px, 390px, 414px)
- [ ] Test on tablet viewport (768px, 1024px)
- [ ] Test on desktop viewport (1280px, 1920px)
- [ ] Verify text is readable without zooming
- [ ] Check that buttons are easy to tap (44x44px minimum)
- [ ] Ensure forms are usable on mobile
- [ ] Test navigation on small screens
- [ ] Verify tables don't overflow
- [ ] Check images scale properly
- [ ] Test landscape orientation on mobile

## Common Issues and Fixes

### Issue: Text Overflow
```tsx
{/* Add truncation or wrapping */}
<p className="truncate md:text-clip">Long text...</p>
<p className="break-words">Long URL or text</p>
```

### Issue: Fixed Width Breaking Layout
```tsx
{/* Use max-width instead of width */}
<div className="w-full max-w-md">
  Responsive container
</div>
```

### Issue: Horizontal Scroll
```tsx
{/* Add overflow handling */}
<div className="overflow-x-auto">
  <div className="min-w-max">
    Wide content
  </div>
</div>
```

### Issue: Small Touch Targets
```tsx
{/* Increase button size on mobile */}
<Button size="lg" className="md:size-default">
  Tap Me
</Button>
```

## Useful Utilities

```tsx
{/* Responsive margin */}
className="m-2 md:m-4 lg:m-6"

{/* Responsive padding */}
className="p-4 md:p-6 lg:p-8"

{/* Responsive gap */}
className="gap-2 md:gap-4 lg:gap-6"

{/* Responsive width */}
className="w-full md:w-auto"

{/* Responsive height */}
className="h-auto md:h-screen"
```

## Resources

- Tailwind CSS Responsive Design: https://tailwindcss.com/docs/responsive-design
- Mobile-First Design: https://tailwindcss.com/docs/responsive-design#mobile-first
- Testing Tools: Chrome DevTools Device Mode
