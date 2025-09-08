# Issue #8: Add Comprehensive Test Coverage

## Status: 📋 PLANNED

## Description
Implement comprehensive testing strategy including unit tests, integration tests, and end-to-end tests to ensure application reliability and prevent regressions.

## Testing Goals
- **Unit test coverage**: >80% for critical business logic
- **Integration coverage**: All API interactions and data flows
- **E2E coverage**: Happy path user workflows  
- **Regression prevention**: Automated testing in CI pipeline

## Tasks to Complete

### Phase 1: Testing Infrastructure Setup
- [ ] **Configure testing frameworks**: Jest, React Testing Library, Playwright
- [ ] **Set up test environment**: Mock Supabase client and test database
- [ ] **Add CI integration**: Run tests in GitHub Actions pipeline
- [ ] **Coverage reporting**: Set up code coverage tracking and reporting

### Phase 2: Unit Tests
- [ ] **Utility functions**: Test `asMessage()`, validation helpers, formatters
- [ ] **Custom hooks**: Test `useAuth`, `useCRMData`, form hooks
- [ ] **Business logic**: Test duplicate detection, CSV processing logic
- [ ] **Error handling**: Test error boundary and error recovery

### Phase 3: Integration Tests  
- [ ] **API integration**: Test Supabase RPC calls and data queries
- [ ] **Form submissions**: Test account/contact creation and updates
- [ ] **File operations**: Test CSV import and export functionality
- [ ] **Authentication flows**: Test login, logout, and session management

### Phase 4: End-to-End Tests
- [ ] **User workflows**: Sign in → dashboard → create account → CSV import
- [ ] **Data operations**: Full CRUD operations through UI
- [ ] **Error scenarios**: Test error handling and recovery flows
- [ ] **Cross-browser**: Test in Chrome, Firefox, and Safari

## Implementation Strategy

### 1. Testing Framework Configuration
```javascript
// jest.config.js
export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/test/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### 2. Test Utilities and Mocks
```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(), 
    auth: {
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

// Test wrapper with providers
export const renderWithProviders = (component: ReactElement) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <QueryClient client={testQueryClient}>
        {children}
      </QueryClient>
    </BrowserRouter>
  );
  
  return render(component, { wrapper: Wrapper });
};
```

### 3. Unit Test Examples
```typescript
// __tests__/lib/errors.test.ts
describe('asMessage utility', () => {
  it('should return string errors as-is', () => {
    expect(asMessage('Network error')).toBe('Network error');
  });
  
  it('should extract message from error objects', () => {
    const error = new Error('Database connection failed');
    expect(asMessage(error)).toBe('Database connection failed');
  });
  
  it('should return fallback for unknown errors', () => {
    expect(asMessage(null)).toBe('Unexpected error');
    expect(asMessage(undefined)).toBe('Unexpected error');
  });
});

// __tests__/hooks/useAuth.test.tsx
describe('useAuth hook', () => {
  it('should return loading state initially', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);
  });
  
  it('should handle successful authentication', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
    
    const { result } = renderHook(() => useAuth());
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });
  });
});
```

### 4. Integration Test Examples
```typescript
// __tests__/integration/csv-import.test.tsx
describe('CSV Import Integration', () => {
  it('should process CSV file and create accounts', async () => {
    const mockFile = new File(['name,email\nJohn Doe,john@example.com'], 'accounts.csv');
    
    mockSupabase.rpc.mockResolvedValue({
      data: { processed_rows: 1, successful_rows: 1, error_rows: 0 },
      error: null,
    });
    
    renderWithProviders(<CSVImport />);
    
    const fileInput = screen.getByLabelText(/upload csv/i);
    fireEvent.change(fileInput, { target: { files: [mockFile] } });
    
    const submitButton = await screen.findByText(/import accounts/i);
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockSupabase.rpc).toHaveBeenCalledWith('process_csv_batch', {
        batch_id: expect.any(String),
        import_type: 'accounts',
        field_mapping: expect.any(Object),
      });
    });
  });
});
```

### 5. E2E Test Examples  
```typescript
// e2e/user-workflows.spec.ts
test('complete user workflow: login → create account → import CSV', async ({ page }) => {
  // Login
  await page.goto('/auth');
  await page.fill('[data-testid=email]', 'test@example.com');
  await page.fill('[data-testid=password]', 'password123');
  await page.click('[data-testid=signin-button]');
  
  // Navigate to CRM
  await expect(page.locator('text=Dashboard')).toBeVisible();
  await page.click('[data-testid=crm-nav]');
  
  // Create account
  await page.click('[data-testid=create-account-button]');
  await page.fill('[data-testid=account-name]', 'Test Company');
  await page.click('[data-testid=save-account]');
  
  await expect(page.locator('text=Test Company')).toBeVisible();
  
  // Import CSV
  await page.click('[data-testid=import-csv-button]');
  await page.setInputFiles('[data-testid=csv-file-input]', 'test-data/accounts.csv');
  await page.click('[data-testid=process-import]');
  
  await expect(page.locator('text=Import completed successfully')).toBeVisible();
});
```

## Test Coverage Strategy

### Critical Areas (Must Have 90%+ Coverage)
1. **Authentication logic**: Login, logout, session management
2. **Data operations**: CRUD operations for accounts/contacts
3. **CSV processing**: File parsing, validation, import logic
4. **Error handling**: Error boundaries and recovery mechanisms

### Important Areas (Must Have 80%+ Coverage)  
1. **Form validation**: Account and contact form validation
2. **Search and filtering**: CRM list operations
3. **Duplicate detection**: Matching algorithm and merge logic
4. **Navigation**: Route handling and page transitions

### Supporting Areas (Must Have 60%+ Coverage)
1. **UI components**: Button, input, modal behaviors
2. **Utility functions**: Formatters, validators, helpers
3. **Configuration**: Settings and preferences
4. **Styling**: Theme and responsive behavior

## Testing Data Management

### Test Database Setup
```sql
-- Test database with sample data
INSERT INTO profiles (id, full_name, role) VALUES 
('test-user-1', 'Test User', 'admin'),
('test-user-2', 'Staff User', 'staff');

INSERT INTO accounts (id, name, type, email) VALUES
('test-account-1', 'Test Company', 'business', 'test@company.com'),
('test-account-2', 'Individual Account', 'individual', 'person@example.com');
```

### Mock Data Factories
```typescript
// src/test/factories.ts
export const createMockAccount = (overrides?: Partial<Account>): Account => ({
  id: faker.datatype.uuid(),
  name: faker.company.name(),
  type: 'business',
  email: faker.internet.email(),
  created_at: faker.date.recent().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides,
});

export const createMockContact = (overrides?: Partial<Contact>): Contact => ({
  id: faker.datatype.uuid(),
  first_name: faker.name.firstName(),
  last_name: faker.name.lastName(),
  email: faker.internet.email(),
  account_id: faker.datatype.uuid(),
  created_at: faker.date.recent().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides,
});
```

## CI Integration

### GitHub Actions Test Jobs
```yaml
# Add to .github/workflows/ci.yml
test:
  name: Run Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    - name: Install dependencies
      run: npm ci
    - name: Run unit tests
      run: npm run test:unit
    - name: Run integration tests  
      run: npm run test:integration
    - name: Upload coverage
      uses: codecov/codecov-action@v3

e2e:
  name: E2E Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    - name: Install dependencies
      run: npm ci
    - name: Install Playwright
      run: npx playwright install
    - name: Run E2E tests
      run: npm run test:e2e
```

## Quality Metrics & Reporting

### Coverage Reporting
- **Codecov integration**: Automatic coverage reporting on PRs
- **Coverage gates**: Fail CI if coverage drops below threshold
- **Coverage trends**: Track coverage changes over time
- **Uncovered lines**: Identify gaps in test coverage

### Test Performance
- **Test execution time**: Keep full suite under 5 minutes
- **Parallel execution**: Run tests in parallel where possible
- **Flaky test detection**: Identify and fix unreliable tests
- **Test maintenance**: Regular cleanup of obsolete tests

## Implementation Timeline

### Week 1: Foundation
- Set up testing frameworks and configuration
- Create test utilities and mock factories
- Add basic unit tests for utilities and hooks

### Week 2: Core Testing
- Add integration tests for API operations
- Test authentication and data flows
- Set up CI integration for automated testing

### Week 3: E2E & Coverage
- Implement end-to-end user workflow tests
- Achieve 80% coverage target for critical paths
- Set up coverage reporting and gates

### Week 4: Polish & Documentation
- Fix flaky tests and improve reliability
- Add test documentation and guidelines
- Performance optimization and cleanup

## Acceptance Criteria
- [ ] Unit test coverage >80% for critical business logic
- [ ] Integration tests cover all API interactions
- [ ] E2E tests cover primary user workflows
- [ ] Tests run automatically in CI pipeline
- [ ] Coverage reporting integrated with PRs
- [ ] All tests pass consistently (no flaky tests)
- [ ] Test suite completes in <5 minutes
- [ ] Test documentation and guidelines available

## Dependencies
- Testing frameworks: Jest, React Testing Library, Playwright
- Mock data libraries: faker.js or similar
- Coverage reporting: Codecov or similar
- CI/CD pipeline (Issue #4) - ✅ Completed

## Labels
- `priority: medium`
- `type: testing`
- `area: quality-assurance`
- `area: automation`  
- `status: planned`