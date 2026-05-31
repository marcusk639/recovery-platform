---
archived: true
archived_date: 2026-05-24
reason: 'Superseded by docs/plans/ACTIVE_PLAN.md (May 2026). Redux modernization and Oxford House work completed.'
---

# Pragmatic Redux Modernization & Oxford House Implementation

## Overview

Parallel-track development plan optimized for solo developer with AI assistance. Work on Redux cleanup while building Oxford House features with modern patterns from day 1.

**Key Decision: KEEP the embedded Week model** - analysis shows it's actually optimal for your UI patterns (always loads complete weeks, no concurrent update issues, no 1MB limit hit).

---

## Track 1: Redux Toolkit Migration (Ongoing, ~8 weeks)

### Why This Matters

- 60% of codebase uses old Redux pattern (3x more code)
- Redux Toolkit installed but unused
- High boilerplate = slower development
- Inconsistent patterns confuse AI assistants

### Strategy: Module-by-Module Migration

Work through Redux modules one at a time, testing after each. Can pause between modules.

#### Week 1: TypeScript Foundation

**New Files:**

- `src/store/types.ts` - Root state interface
- `src/store/hooks.ts` - Typed hooks (useAppDispatch, useAppSelector)

```typescript
// src/store/types.ts
export interface RootState {
  guests: GuestsState;
  user: UserState;
  houses: HousesState;
  admin: AdminState;
  cache: CacheState;
  theme: ThemeState;
  app: AppState;
  directMessage: DirectMessageState;
  notificationReducer: NotificationState;
  managerSignUp: ManagerSignUpState;
  meetings: MeetingState;
  customNavigationState: NavigationState;
  reports: ReportState;
}

// src/store/hooks.ts
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './types';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

**Update Existing:**

- `src/store/reducers/index.tsx` - Export RootState type
- Start using typed hooks in new code

#### Week 2: Guest Actions Migration

**Files to Refactor:**

- `src/store/actions/guests.ts` - Convert to createAsyncThunk
- `src/store/reducers/guests.tsx` - Convert to createSlice

**Pattern:**

```typescript
// OLD (delete 50+ lines of boilerplate)
export const UPDATING_GUEST = 'UPDATING_GUEST';
export const UPDATING_GUEST_SUCCESSFUL = 'UPDATING_GUEST_SUCCESSFUL';
export const UPDATING_GUEST_FAILED = 'UPDATING_GUEST_FAILED';

export function updateGuest(guestId, updates) {
  return async dispatch => {
    dispatch({ type: UPDATING_GUEST });
    try {
      await guestService.update(guestId, updates);
      dispatch({ type: UPDATING_GUEST_SUCCESSFUL });
    } catch (error) {
      dispatch({ type: UPDATING_GUEST_FAILED, error });
    }
  };
}

// NEW (10 lines, fully typed)
export const updateGuest = createAsyncThunk(
  'guests/update',
  async ({
    guestId,
    updates,
  }: {
    guestId: string;
    updates: Partial<Guest>;
  }) => {
    return await guestService.update(guestId, updates);
  },
);

// In reducer (createSlice)
const guestsSlice = createSlice({
  name: 'guests',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(updateGuest.pending, state => {
        state.updatingGuest = true;
      })
      .addCase(updateGuest.fulfilled, state => {
        state.updatingGuest = false;
        state.updatingGuestSuccessful = true;
      })
      .addCase(updateGuest.rejected, (state, action) => {
        state.updatingGuest = false;
        state.updatingGuestFailed = true;
      });
  },
});
```

**AI Prompt Template:**
"Convert this Redux action to Redux Toolkit using createAsyncThunk. Keep the same functionality, just modernize the pattern."

#### Week 3: House Actions Migration

**Files:**

- `src/store/actions/house.ts`
- `src/store/reducers/houses.tsx`

Same pattern as guests. Use AI to generate boilerplate.

#### Week 4: User/Admin Actions

**Files:**

- `src/store/actions/users.ts`
- `src/store/reducers/users.tsx`
- `src/store/actions/admin.ts`
- `src/store/reducers/admin.tsx`

#### Weeks 5-8: Remaining Modules

**Priority Order:**

1. Meeting actions (Week 5)
2. App/Theme actions (Week 6)
3. Notification actions (Week 7)
4. Cache/Reports actions (Week 8)

**Pragmatic TypeScript:**

- Replace `state: any` with `state: RootState` in mapStateToProps
- Replace `props: any` with interfaces where it helps
- Don't obsess over 100% strict typing - focus on commonly used paths

---

## Track 2: Oxford House Features (Parallel, ~12 weeks)

Build Oxford House support using MODERN patterns from day 1 while Redux migration happens.

### Week 1: House Model Infrastructure

**New Files:**

- `src/entities/HouseModel.ts`
- `src/screens/HouseSetup/ModelSelector.tsx` (functional component + hooks)

**Database Change:**
Add `model: 'traditional' | 'oxford'` field to House entity.

**Implementation:**

```typescript
// src/entities/HouseModel.ts
export type HouseModel = 'traditional' | 'oxford';

export interface HouseModelConfig {
  model: HouseModel;
  terminology: {
    payment: string; // 'Rent' or 'EES'
    admin: string; // 'Administrator' or 'Officer'
    resident: string; // 'Resident' or 'Member'
  };
  features: {
    phases: boolean; // Traditional only
    officers: boolean; // Oxford only
    voting: boolean; // Oxford only
    businessMeetings: boolean; // Oxford only
    charterCompliance: boolean; // Oxford only
  };
}
```

**UI Updates:**

- Add model selector to house onboarding
- Conditional feature rendering based on `house.model`
- Model-specific terminology throughout app

### Weeks 2-3: Officer Role System

**New Files (all functional components + Redux Toolkit):**

- `src/entities/Officer.ts`
- `src/services/officer.ts`
- `src/store/slices/officersSlice.ts` (Redux Toolkit from day 1)
- `src/screens/Officers/OfficerManagement.tsx`
- `src/screens/Officers/OfficerDashboard.tsx`

**Officer Entity:**

```typescript
export interface Officer {
  id: string;
  houseId: string;
  residentId: string;
  role: 'president' | 'treasurer' | 'secretary' | 'comptroller';
  termStart: string;
  termEnd: string;
  status: 'active' | 'completed' | 'removed';
  electedDate: string;
}
```

**Redux Slice (modern pattern):**

```typescript
// src/store/slices/officersSlice.ts
export const fetchOfficers = createAsyncThunk(
  'officers/fetch',
  async (houseId: string) => {
    return await OfficerService.getOfficersByHouse(houseId);
  },
);

const officersSlice = createSlice({
  name: 'officers',
  initialState: {
    officers: {} as Record<string, Officer>,
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: builder => {
    builder.addCase(fetchOfficers.fulfilled, (state, action) => {
      state.officers = action.payload;
      state.loading = false;
    });
  },
});
```

**Features:**

- Role assignment workflow (functional component)
- Term expiration alerts (30/15/7 days)
- Role-specific permissions
- Officer transition workflow

### Weeks 4-5: EES Financial System

**New Files:**

- `src/entities/EES.ts`
- `src/services/ees.ts`
- `src/store/slices/eesSlice.ts`
- `src/screens/Financials/EESTracker.tsx` (functional + hooks)
- `src/screens/Financials/HouseExpenses.tsx` (functional + hooks)

**Key Difference from Traditional Rent:**

- EES = same amount for all residents (total expenses / resident count)
- Automatically recalculates when residents move in/out
- Prorated for partial months
- Full financial transparency (all residents see all expenses)

**EES Entities:**

```typescript
export interface EESPayment {
  id: string;
  houseId: string;
  residentId: string;
  amount: number; // Calculated amount
  dueDate: string;
  paidDate?: string;
  status: 'pending' | 'paid' | 'overdue';
  month: string; // YYYY-MM
}

export interface HouseExpense {
  id: string;
  houseId: string;
  category: 'rent' | 'utilities' | 'maintenance' | 'supplies' | 'other';
  amount: number;
  description: string;
  date: string;
  paidTo: string;
  paidBy?: string; // Treasurer ID
}
```

**Features:**

- Automatic EES calculation
- Expense tracking (Treasurer)
- Payment collection workflow
- Financial transparency dashboard (all residents)
- Prorated calculations

### Weeks 6-7: Business Meeting System

**New Files:**

- `src/entities/BusinessMeeting.ts`
- `src/services/businessMeeting.ts`
- `src/store/slices/meetingsSlice.ts`
- `src/screens/Meetings/BusinessMeetingScheduler.tsx` (functional)
- `src/screens/Meetings/MeetingAgenda.tsx` (functional)
- `src/screens/Meetings/MeetingMinutes.tsx` (functional)

**Business Meeting Entity:**

```typescript
export interface BusinessMeeting {
  id: string;
  houseId: string;
  scheduledDate: string;
  actualDate?: string;
  attendees: string[]; // resident IDs
  absentees: string[];
  agendaItems: AgendaItem[];
  minutes: string;
  treasurerReport?: {
    totalExpenses: number;
    totalIncome: number;
    balance: number;
    daysReserve: number;
  };
  votesHeld: string[]; // vote IDs
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}
```

**Features:**

- Recurring weekly meeting scheduler
- Attendance tracking (QR code check-in optional)
- Agenda builder (any resident can add items)
- Minutes editor (Secretary role)
- Treasurer report template
- Minutes repository (searchable, accessible to all)
- Reminder notifications

### Weeks 8-9: Democratic Voting System

**New Files:**

- `src/entities/Vote.ts`
- `src/services/vote.ts`
- `src/store/slices/votesSlice.ts`
- `src/screens/Voting/CreateVote.tsx` (functional)
- `src/screens/Voting/CastVote.tsx` (functional)
- `src/screens/Voting/VoteResults.tsx` (functional)

**Vote Entity:**

```typescript
export interface Vote {
  id: string;
  houseId: string;
  businessMeetingId?: string;
  type: 'new_member' | 'expulsion' | 'rule_change' | 'general';
  title: string;
  description: string;
  createdBy: string;
  createdDate: string;
  requiredApproval: number; // percentage (e.g., 80)
  ballots: Ballot[];
  isAnonymous: boolean;
  status: 'open' | 'closed';
  outcome?: 'approved' | 'rejected';
  closedDate?: string;
}

export interface Ballot {
  residentId: string;
  vote: 'yes' | 'no' | 'abstain';
  timestamp: string;
}
```

**Features:**

- Vote creation workflow
- Configurable approval thresholds
- Anonymous voting option
- Real-time vote tallying
- Vote notifications
- Vote history

### Weeks 10-11: Charter Compliance Monitoring

**New Files:**

- `src/services/charterCompliance.ts`
- `src/store/slices/complianceSlice.ts`
- `src/screens/Compliance/CharterDashboard.tsx` (functional)
- `src/screens/Compliance/ComplianceAlerts.tsx` (functional)

**Three Charter Conditions:**

1. Democratic self-governance (voting participation, meetings, officers)
2. Financial self-sufficiency (EES collection rate, expense coverage)
3. Zero tolerance (substance use incidents → expulsion votes)

**Compliance Entity:**

```typescript
export interface CharterCompliance {
  houseId: string;
  lastChecked: string;
  democraticGovernance: {
    score: number; // 0-100
    votingParticipationRate: number;
    businessMeetingAttendance: number;
    officerTermCompliance: boolean;
  };
  financialSelfSufficiency: {
    score: number; // 0-100
    eesCollectionRate: number;
    expenseCoverageRate: number;
    daysReserve: number;
  };
  zeroTolerance: {
    score: number; // 0-100
    incidentsThisMonth: number;
    expulsionVotesHeld: number;
  };
  overallCompliance: 'compliant' | 'at_risk' | 'non_compliant';
}
```

**Features:**

- Automated compliance calculations
- Alert system for violations
- Compliance dashboard
- Exportable compliance reports for Oxford House chapters

### Week 12: Testing & Polish

- End-to-end testing of Oxford House workflows
- Bug fixes
- Performance optimization
- Documentation
- Training materials for officers

---

## Development Workflow

### For Redux Migration (Track 1)

1. Pick a module (e.g., guests)
2. Use AI to convert actions to createAsyncThunk
3. Use AI to convert reducer to createSlice
4. Test thoroughly
5. Replace `state: any` with `state: RootState` in affected components
6. Move to next module

### For Oxford House Features (Track 2)

1. Use AI to generate boilerplate (entities, services, slices)
2. Build UI with functional components + hooks
3. Use Redux Toolkit from day 1 (no old patterns)
4. Add pragmatic TypeScript (interfaces for props, typed hooks)
5. Test with beta Oxford House users

### AI Assistant Prompts

**For Redux Migration:**

```
Convert this Redux action file to Redux Toolkit. Use createAsyncThunk for async actions and createSlice for the reducer. Keep the same functionality, just modernize the pattern. Here's the current code: [paste code]
```

**For Oxford House Features:**

```
Generate a Redux Toolkit slice for [entity name] with CRUD operations. Use createAsyncThunk for async actions. Include TypeScript types. Follow this pattern: [paste example slice]
```

**For Component Conversion:**

```
Convert this class component to a functional component using hooks. Keep all functionality, just modernize. Here's the current code: [paste component]
```

---

## Key Principles

1. **Work in Parallel:** Redux migration and Oxford features happen simultaneously
2. **Modern Patterns for New Code:** All Oxford House code uses functional components, hooks, Redux Toolkit
3. **Don't Rewrite Everything:** Convert old components only when touching them
4. **Pragmatic TypeScript:** Add types where they help, don't obsess over 100% coverage
5. **AI-Assisted Development:** Generate boilerplate with AI, focus your time on business logic
6. **Test as You Go:** Manual testing after each module/feature
7. **Keep Embedded Week Model:** It's optimal for your UI patterns - don't change what works

---

## What NOT to Do

- Don't normalize the Guest/Week data model (current structure is optimal)
- Don't try to convert all class components at once
- Don't aim for 100% strict TypeScript (pragmatic is fine)
- Don't block Oxford features waiting for perfect Redux migration
- Don't rewrite working code just because it's "old"

---

## Success Metrics

**Redux Migration:**

- 70%+ of Redux actions use Redux Toolkit
- 50-70% reduction in Redux boilerplate code
- Typed hooks used in new components
- `state: any` replaced with `state: RootState` in key screens

**Oxford House Features:**

- All 6 core features functional
- Modern patterns throughout (functional components, Redux Toolkit)
- Ready for beta with 5-10 Oxford Houses
- All new code uses typed hooks

---

## Timeline Summary

**Weeks 1-8:** Redux migration + Oxford features (parallel)

- Week 1: TypeScript foundation + House model selector
- Week 2: Guest actions migration + Officer system (start)
- Week 3: House actions migration + Officer system (finish)
- Week 4-5: User/Admin migrations + EES financial system
- Week 6-7: Meeting actions + Business meetings
- Week 8: Remaining Redux + Voting system (start)

**Weeks 9-12:** Oxford features completion

- Week 9: Voting system (finish)
- Weeks 10-11: Charter compliance
- Week 12: Testing & polish

**Flexible:** Can pause at any module boundary, work on what's most valuable at any moment.

---

## Next Steps

1. Start with TypeScript foundation (Track 1, Week 1)
2. Immediately start House model selector (Track 2, Week 1)
3. Use AI heavily for boilerplate generation
4. Test frequently
5. Ship features as they're ready (don't wait for everything)
