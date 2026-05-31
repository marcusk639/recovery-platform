# Activity System Test Plan

**Version:** 1.0
**Date:** February 15, 2026
**Status:** Implementation Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Testing Strategy](#testing-strategy)
3. [Test Pyramid](#test-pyramid)
4. [Test Coverage Requirements](#test-coverage-requirements)
5. [Test Suites](#test-suites)
6. [Implementation Plan](#implementation-plan)
7. [Success Criteria](#success-criteria)

---

## 1. Executive Summary

This document outlines the comprehensive testing strategy for the new Activity-based stat tracking system before migration from the Week/Day model. The goal is to achieve **95%+ confidence** in the new system through automated testing before any production migration.

### Objectives

1. **Validate Functionality**: Ensure new system matches or exceeds old system capabilities
2. **Prevent Regressions**: Catch bugs before migration
3. **Document Behavior**: Tests serve as living documentation
4. **Enable Refactoring**: Safe code changes with test safety net
5. **Build Confidence**: Stakeholder confidence through measurable test coverage

### Key Metrics

- **Target Coverage**: 80%+ code coverage
- **Critical Path Coverage**: 100% of user-facing flows
- **Performance**: All queries <500ms, writes <200ms
- **Data Integrity**: 100% data accuracy vs. old system

---

## 2. Testing Strategy

### 2.1 Test-Driven Development Approach

We will build the new system using **Red-Green-Refactor** cycle:

```
1. RED: Write failing test for new functionality
2. GREEN: Write minimal code to pass test
3. REFACTOR: Improve code while maintaining tests
4. REPEAT: For each feature
```

### 2.2 Testing Layers

```
┌─────────────────────────────────────────┐
│  E2E Tests (Detox)                      │  ← 5% of tests
│  Full user flows, real app              │
├─────────────────────────────────────────┤
│  Integration Tests (Jest + Firebase)    │  ← 25% of tests
│  Service layer, database operations     │
├─────────────────────────────────────────┤
│  Unit Tests (Jest)                      │  ← 70% of tests
│  Pure functions, entities, utilities    │
└─────────────────────────────────────────┘
```

### 2.3 Test Data Strategy

- **Mock Data**: For unit tests (fast, isolated)
- **Firebase Emulator**: For integration tests (realistic, safe)
- **Test Fixtures**: Reusable test data builders
- **Snapshot Testing**: For data structures and UI components

---

## 3. Test Pyramid

### 3.1 Unit Tests (70% of test count)

**Focus**: Pure functions, data transformations, business logic

**Files to Test**:
- `src/entities/ActivityModel.ts` - Entity creation, validation, type guards
- `src/entities/WeekSummary.ts` - Summary calculations
- `src/util/activityHelpers.ts` - Activity type mapping, data conversion
- `src/services/activityService/validators.ts` - Input validation
- `src/services/activityService/aggregators.ts` - Stat aggregation

**Test Count**: ~150-200 unit tests

**Example Tests**:
```typescript
describe('ActivityDataFactory', () => {
  it('should create chore activity data', () => {
    const data = ActivityDataFactory.chore('daily', 'Kitchen');
    expect(data.type).toBe('chore');
    expect(data.choreName).toBe('Kitchen');
  });
});
```

### 3.2 Integration Tests (25% of test count)

**Focus**: Service layer with database interactions

**Files to Test**:
- `src/services/activity.ts` - CRUD operations
- `src/services/activityService/summaryBuilder.ts` - Summary generation
- `src/services/activityService/healthScore.ts` - Health calculation
- `src/services/migration/migrate-to-activity-model.ts` - Data migration

**Test Count**: ~50-70 integration tests

**Example Tests**:
```typescript
describe('Activity Service', () => {
  it('should create activity and update summary', async () => {
    await logActivity(guestId, houseId, ActivityType.CHORE, data, userId);
    const summary = await getWeekSummary(guestId, weekStart);
    expect(summary.stats.choresCompleted).toBe(1);
  });
});
```

### 3.3 E2E Tests (5% of test count)

**Focus**: Critical user flows through real app

**Files to Test**:
- `e2e/tests/activity/completeChore.e2e.ts`
- `e2e/tests/activity/logMeeting.e2e.ts`
- `e2e/tests/activity/trackWork.e2e.ts`
- `e2e/tests/activity/viewStats.e2e.ts`

**Test Count**: ~10-15 E2E tests

**Example Tests**:
```typescript
describe('Complete Chore Flow', () => {
  it('should complete chore and show in stats', async () => {
    await element(by.id('chore-complete-button')).tap();
    await expect(element(by.text('1/7 Chores'))).toBeVisible();
  });
});
```

---

## 4. Test Coverage Requirements

### 4.1 Coverage Targets by Module

| Module | Coverage Target | Priority |
|--------|----------------|----------|
| **Activity Entity** | 95% | Critical |
| **Activity Service** | 90% | Critical |
| **Summary Builder** | 95% | Critical |
| **Health Score Calculator** | 100% | Critical |
| **Migration Script** | 85% | High |
| **Validation Logic** | 95% | High |
| **Type Guards** | 100% | High |
| **Data Factories** | 90% | Medium |
| **React Hooks** | 80% | Medium |

### 4.2 Critical Paths (Must be 100% covered)

1. **Activity Creation Flow**
   - User action → logActivity() → Firestore write → Summary update

2. **Summary Generation Flow**
   - Activities → aggregation → DailyStats → WeeklySummary → Health Score

3. **Query Flows**
   - Get activities by date range
   - Get activities by type
   - Get week summary

4. **Data Migration Flow**
   - Week/Day data → Activities → Summaries → Validation

5. **Dispute Flow**
   - Dispute activity → Status change → Summary recalculation

---

## 5. Test Suites

### 5.1 Unit Test Suites

#### Suite 1: Activity Entity Tests
**File**: `src/entities/__tests__/ActivityModel.test.ts`

**Coverage**:
- Entity creation
- Type guards (isChoreActivity, isMeetingActivity, etc.)
- Data factories (all activity types)
- Legacy conversion (toLegacyActivity, convertLegacyMetadataToData)
- Activity normalization

**Test Count**: ~30 tests

#### Suite 2: WeekSummary Tests
**File**: `src/entities/__tests__/WeekSummary.test.ts`

**Coverage**:
- Summary creation
- Empty stats initialization
- Daily stats initialization
- Summary merging
- Health score calculation

**Test Count**: ~20 tests

#### Suite 3: Activity Helpers Tests
**File**: `src/util/__tests__/activityHelpers.test.ts`

**Coverage**:
- Activity type mapping (Stat → ActivityType)
- Date utilities (week boundaries, date formatting)
- Data validation
- Error handling

**Test Count**: ~25 tests

### 5.2 Integration Test Suites

#### Suite 4: Activity Service Tests
**File**: `src/services/__tests__/activity.test.ts`

**Coverage**:
- logActivity() - all activity types
- getActivities() - various filters
- updateActivity()
- deleteActivity() (soft delete)
- disputeActivity()
- resolveDispute()
- Concurrent operations
- Error scenarios

**Test Count**: ~40 tests

#### Suite 5: Summary Builder Tests
**File**: `src/services/__tests__/summaryBuilder.test.ts`

**Coverage**:
- updateWeekSummary() - from scratch
- updateWeekSummary() - incremental updates
- Summary accuracy vs manual calculation
- Edge cases (week boundaries, no activities, etc.)
- Performance under load

**Test Count**: ~25 tests

#### Suite 6: Migration Tests
**File**: `src/services/migration/__tests__/migration.test.ts` (existing, enhance)

**Coverage**:
- All activity types migration
- Multi-week migration
- Multi-job/meeting handling
- Edge cases (empty weeks, invalid data, etc.)
- Batch processing
- Validation
- Rollback capability

**Test Count**: ~30 tests (already exists with 20, add 10 more)

### 5.3 React Hook Tests

#### Suite 7: Activity Hooks Tests
**File**: `src/hooks/__tests__/useGuestStats.test.tsx`

**Coverage**:
- useGuestStats hook
- Loading states
- Error states
- Data updates
- Re-fetch triggers

**Test Count**: ~15 tests

### 5.4 E2E Test Suites

#### Suite 8: Chore Completion E2E
**File**: `e2e/tests/activity/choreCompletion.e2e.ts`

**Flow**:
1. Login as guest
2. Navigate to chores screen
3. Mark chore as complete
4. Verify activity logged
5. Verify stat summary updated
6. Verify weekly stats updated

#### Suite 9: Meeting Attendance E2E
**File**: `e2e/tests/activity/meetingAttendance.e2e.ts`

**Flow**:
1. Login as guest
2. Search for meeting
3. Check in to meeting (GPS verified)
4. Verify activity logged
5. Verify meeting count updated

#### Suite 10: Work Logging E2E
**File**: `e2e/tests/activity/workLogging.e2e.ts`

**Flow**:
1. Login as guest
2. Navigate to work screen
3. Log work hours
4. Verify activity created
5. Verify total hours updated

---

## 6. Implementation Plan

### Phase 1: Foundation (Week 1)
**Goal**: Test infrastructure and core entity tests

**Tasks**:
- [ ] Set up test utilities and fixtures
- [ ] Create test data builders
- [ ] Implement Suite 1: Activity Entity Tests
- [ ] Implement Suite 2: WeekSummary Tests
- [ ] Implement Suite 3: Activity Helpers Tests

**Deliverable**: 75+ passing unit tests

### Phase 2: Service Layer (Week 2)
**Goal**: Integration tests for core services

**Tasks**:
- [ ] Set up Firebase emulator for tests
- [ ] Implement Suite 4: Activity Service Tests
- [ ] Implement Suite 5: Summary Builder Tests
- [ ] Enhance Suite 6: Migration Tests

**Deliverable**: 95+ passing integration tests

### Phase 3: Hooks & UI (Week 3)
**Goal**: React hook tests and setup E2E

**Tasks**:
- [ ] Implement Suite 7: Activity Hooks Tests
- [ ] Set up Detox E2E environment
- [ ] Implement Suite 8: Chore Completion E2E
- [ ] Implement Suite 9: Meeting Attendance E2E
- [ ] Implement Suite 10: Work Logging E2E

**Deliverable**: Full test coverage, all tests passing

### Phase 4: Validation & Documentation (Week 4)
**Goal**: Edge cases, performance, documentation

**Tasks**:
- [ ] Add edge case tests (100+ scenarios)
- [ ] Performance testing (load tests)
- [ ] Generate coverage report
- [ ] Document test patterns
- [ ] Create CI/CD pipeline

**Deliverable**: Production-ready test suite

---

## 7. Success Criteria

### 7.1 Quantitative Metrics

- ✅ **Code Coverage**: >80% overall, >95% for critical modules
- ✅ **Test Count**: 200+ automated tests
- ✅ **Test Execution Time**: <60 seconds for unit/integration, <5 minutes for E2E
- ✅ **Failure Rate**: <1% flaky tests
- ✅ **Performance**: All operations within SLA (reads <500ms, writes <200ms)

### 7.2 Qualitative Metrics

- ✅ **Data Accuracy**: 100% match between old and new system in parallel testing
- ✅ **Edge Cases**: All known edge cases covered
- ✅ **Error Handling**: All error paths tested
- ✅ **Regression Prevention**: No bugs escape to production
- ✅ **Developer Confidence**: Team confident in making changes

### 7.3 Acceptance Criteria

Before migration approval:
1. All tests passing (green CI)
2. Coverage targets met
3. Performance benchmarks met
4. Manual QA sign-off on E2E flows
5. Stakeholder demo successful
6. Rollback procedure tested

---

## 8. Testing Tools & Technologies

### 8.1 Test Frameworks

- **Jest**: Unit and integration testing
- **React Native Testing Library**: React hook and component testing
- **Detox**: E2E mobile testing
- **Firebase Emulator**: Safe database testing

### 8.2 Test Utilities

```typescript
// Test data builders
createMockGuest(overrides?)
createMockActivity(type, overrides?)
createMockWeekSummary(overrides?)

// Firebase mocks
mockFirestore()
mockActivityCollection()
mockWeekSummaryCollection()

// Assertions
expectActivityToMatch(actual, expected)
expectSummaryToEqual(actual, expected)
expectHealthScoreToBeInRange(score, min, max)
```

### 8.3 CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- --coverage

  e2e-tests:
    runs-on: macos-latest
    steps:
      - run: npm run test:e2e:ios
```

---

## 9. Risk Management

### 9.1 Testing Risks

| Risk | Mitigation |
|------|------------|
| **Flaky E2E tests** | Retry logic, proper waits, isolated test data |
| **Slow test execution** | Parallel execution, optimize setup/teardown |
| **Firebase emulator issues** | Fallback to mocked Firestore |
| **Test data pollution** | Clean state before each test |
| **Coverage blind spots** | Manual code review, pair programming |

### 9.2 Quality Gates

Before merging to main:
- [ ] All tests pass
- [ ] Coverage not decreased
- [ ] No new lint errors
- [ ] Performance tests pass
- [ ] Code review approved

---

## 10. Next Steps

1. **Review & Approve**: Stakeholder review of test plan
2. **Begin Implementation**: Start Phase 1 (Foundation)
3. **Daily Standups**: Track progress on test implementation
4. **Weekly Reviews**: Demo passing tests, adjust plan as needed
5. **Final Validation**: Full test suite execution before migration decision

---

**Document Owner**: Development Team
**Last Updated**: February 15, 2026
**Next Review**: Weekly during implementation

---
*Last reviewed: 2026-05-24 | Audience: developer | Type: reference*
