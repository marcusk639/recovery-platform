# Batch 13 Plan - TypeScript Migration

**Created:** February 5, 2026
**Target Execution:** Next session
**Approach:** 3 Parallel Refactoring-Specialist Agents

---

## Objectives

### Primary Goal
Reduce TypeScript errors from **530 → ~430** (target 100 errors fixed, 19% reduction)

### Secondary Goals
- Complete navigation/routing type safety
- Fix all Phase setup wizard screens
- Clear remaining high-priority user-facing screens
- Maintain 100% success rate with parallel agents

---

## Error Analysis

### Current State (After Batch 12)
- **Total errors:** 530
- **Files with 10+ errors:** 21 files
- **Estimated batches remaining:** 3-4 to reach <100 errors

### Top Target Files (Batch 13)
| File | Errors | Category | Priority |
|------|--------|----------|----------|
| improved-navigators.tsx | 15 | Navigation | Critical |
| Personal.tsx | 14 | Screen | High |
| NewMeeting.tsx | 13 | Screen | High |
| DirectChat.tsx | 13 | Screen | High |
| PhaseConfigForm.tsx | 12 | Setup Wizard | High |
| rats-picker.tsx | 12 | Component | Medium |
| PhaseConfigSetup.tsx | 11 | Setup Wizard | High |
| PhaseCustomization.tsx | 11 | Setup Wizard | High |
| improved-app.tsx | 11 | App Root | Critical |
| rats-text-input.tsx | 11 | Component | Medium |

---

## Batch Structure

### Batch 13A: Navigation & App Infrastructure
**Agent Type:** `voltagent-dev-exp:refactoring-specialist`
**Focus:** Core navigation and app initialization

**Target Files:**
1. **improved-navigators.tsx** (15 errors)
   - Navigation type definitions
   - Route param types
   - Screen prop types

2. **improved-app.tsx** (11 errors)
   - Root app initialization
   - Provider types
   - Navigation container types

**Expected Errors Fixed:** ~26 errors

**Common Patterns Expected:**
- Navigation prop type definitions
- Route param interfaces
- Screen component typing
- Navigation ref types
- Deep linking types

**Critical Success Factor:**
These files are infrastructure - must maintain backward compatibility with all screens.

---

### Batch 13B: Phase Setup Wizard Screens
**Agent Type:** `voltagent-dev-exp:refactoring-specialist`
**Focus:** Setup wizard type safety

**Target Files:**
1. **PhaseConfigForm.tsx** (12 errors)
   - Form field types
   - Phase configuration types
   - Validation types

2. **PhaseConfigSetup.tsx** (11 errors)
   - Setup flow types
   - State management types
   - Wizard navigation types

3. **PhaseCustomization.tsx** (11 errors)
   - Customization option types
   - Phase requirement types
   - Save/update callback types

**Expected Errors Fixed:** ~34 errors

**Common Patterns Expected:**
- Formik form types
- Phase entity types
- Wizard state types
- Callback signature types
- Redux action types

**Dependencies:**
All three files are related - may share types. Agent should look for opportunities to create shared type definitions.

---

### Batch 13C: High-Priority User-Facing Screens
**Agent Type:** `voltagent-dev-exp:refactoring-specialist`
**Focus:** User-facing screen type safety

**Target Files:**
1. **Personal.tsx** (14 errors)
   - User settings types
   - Profile update types
   - Preference types

2. **NewMeeting.tsx** (13 errors)
   - Meeting creation types
   - Form validation types
   - Location types

3. **DirectChat.tsx** (13 errors)
   - Chat message types
   - Conversation types
   - Real-time update types

**Expected Errors Fixed:** ~40 errors

**Common Patterns Expected:**
- Screen prop interfaces
- Form submission types
- State management types
- Navigation types
- Entity type usage

**Note:** DirectChat may have overlap with ContactScreen fixes from Batch 12B - agent should review those patterns.

---

## Agent Instructions

### General Instructions (All Agents)

**Approach:**
1. Read all target files first to understand context
2. Run TypeScript compiler to identify specific errors
3. Group errors by pattern for systematic fixing
4. Fix errors incrementally with frequent compilation checks
5. Commit after each file or logical group of fixes
6. Report progress and any blockers

**Standards:**
- Maintain all existing functionality
- Add proper null safety (`?.` optional chaining)
- Use explicit types over `any`
- Add JSDoc comments for complex types
- Follow existing code style

**Testing:**
- Compile after each fix: `npx tsc --noEmit`
- Verify error count decreases
- No new errors introduced

**Commit Format:**
```
fix(typescript): Batch 13[A/B/C] - Fix type errors in [filename]
```

---

### Batch 13A Specific Instructions

**File:** `improved-navigators.tsx`

**Key Areas:**
1. Navigation type definitions
2. Stack navigator param lists
3. Screen prop types
4. Navigation ref typing

**Common Fixes:**
```typescript
// Navigation params
type RootStackParamList = {
  Home: undefined;
  Profile: { userId: string };
  Settings: { section?: string };
};

// Screen props
type Props = StackScreenProps<RootStackParamList, 'Profile'>;

// Navigation ref
const navigationRef = useNavigationContainerRef<RootStackParamList>();
```

**File:** `improved-app.tsx`

**Key Areas:**
1. Provider prop types
2. Root component types
3. Initialization types
4. Redux store types

---

### Batch 13B Specific Instructions

**Files:** Phase setup wizard screens

**Key Areas:**
1. Formik form types
2. Phase entity usage
3. Wizard state management
4. Callback signatures

**Common Fixes:**
```typescript
// Formik types
interface PhaseFormValues {
  name: string;
  requirements: PhaseRequirements;
  // ...
}

type Props = {
  onSubmit: (values: PhaseFormValues) => void;
  initialValues?: Partial<PhaseFormValues>;
};

// Phase entity
import { Phase, PhaseRequirements } from '@/entities/Phase';
```

**Shared Types Opportunity:**
If multiple files use similar types, create a shared types file:
`src/screens/SetupWizards/PhaseSetup/types.ts`

---

### Batch 13C Specific Instructions

**Files:** User-facing screens

**Key Areas:**
1. Screen component props
2. Redux/RTK state usage
3. Navigation props
4. Form types
5. Entity usage

**File-Specific Notes:**

**Personal.tsx:**
- User settings form types
- Profile update callbacks
- Preference toggles

**NewMeeting.tsx:**
- Meeting entity types
- Location/address types
- Form validation
- GPS coordinates types

**DirectChat.tsx:**
- Review ContactScreen and HouseChat fixes from Batch 12B
- Message entity types
- Conversation state types
- Real-time subscription types

---

## Expected Outcomes

### Error Reduction
- **Current:** 530 errors
- **Target:** ~430 errors
- **Reduction:** ~100 errors (19%)
- **Cumulative:** 613/1043 errors fixed (59% complete)

### Files Completed
- **Total files:** 9 files
- **Error-free after batch:** 9 files
- **Cumulative error-free files:** ~25+ files

### Commits Expected
- **Batch 13A:** 2-3 commits
- **Batch 13B:** 3-4 commits
- **Batch 13C:** 3-4 commits
- **Total:** 8-11 commits

---

## Risk Assessment

### Low Risk ✅
- All agents use proven refactoring-specialist
- Target files are independent (minimal overlap)
- Clear error patterns identified
- Successful Batch 12 provides template

### Medium Risk ⚠️
- **Navigation types:** Changes to improved-navigators.tsx affect all screens
  - **Mitigation:** Agent must maintain backward compatibility
  - **Verification:** Compile entire project after changes

- **Shared types:** Phase wizard screens may need shared type definitions
  - **Mitigation:** Agent should create shared types file if needed
  - **Verification:** Ensure no circular dependencies

### Rollback Plan
- Each agent commits incrementally
- Can revert individual commits if issues found
- Git history preserved for all changes

---

## Success Criteria

### Must Have ✅
- [ ] All 9 target files compile without errors
- [ ] No new errors introduced in other files
- [ ] All functionality preserved (no breaking changes)
- [ ] Error count reduced to ~430 or below
- [ ] All commits follow format standard

### Nice to Have 🎯
- [ ] Shared type definitions created for Phase wizard
- [ ] Navigation types documented with JSDoc
- [ ] Pattern documentation for future batches
- [ ] Error count below 420 (stretch goal)

---

## Post-Batch Actions

### Immediate
1. **Verify error count:** `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`
2. **Review commits:** `git log --oneline -15`
3. **Update MIGRATION_STATUS.md** with Batch 13 results
4. **Create BATCH_13_SUMMARY.md**

### Follow-Up
1. Test navigation flows manually
2. Test Phase setup wizard
3. Test chat and meeting creation
4. Verify Redux state access patterns

### Documentation
1. Update error reduction chart
2. Document any new patterns discovered
3. Update success criteria checklist
4. Plan Batch 14 if needed

---

## Batch 14 Preview (Tentative)

If Batch 13 achieves target reduction (~430 errors), Batch 14 would target:

**Potential Focus Areas:**
- **Component props:** rats-picker (12), rats-text-input (11)
- **Utility functions:** guest.tsx (10), display.tsx (8)
- **Remaining screens:** HouseSettings/ManagerSettings (10), Beds (10)

**Target:** <300 errors (30% reduction from current 430)

---

## Execution Checklist

### Pre-Execution
- [ ] Review this plan
- [ ] Confirm all target files exist
- [ ] Backup current branch
- [ ] Ensure clean working directory

### Execution
- [ ] Launch 3 parallel refactoring-specialist agents
- [ ] Monitor agent progress
- [ ] Verify no conflicts between agents

### Post-Execution
- [ ] Verify error count
- [ ] Review all commits
- [ ] Update documentation
- [ ] Test affected functionality

---

## Agent Launch Commands

When ready to execute, use these commands:

```typescript
// Batch 13A: Navigation & App Infrastructure
Task(
  subagent_type: "voltagent-dev-exp:refactoring-specialist",
  description: "Fix navigation and app types",
  prompt: [See Batch 13A instructions above]
)

// Batch 13B: Phase Setup Wizard Screens
Task(
  subagent_type: "voltagent-dev-exp:refactoring-specialist",
  description: "Fix phase wizard types",
  prompt: [See Batch 13B instructions above]
)

// Batch 13C: High-Priority Screens
Task(
  subagent_type: "voltagent-dev-exp:refactoring-specialist",
  description: "Fix user-facing screen types",
  prompt: [See Batch 13C instructions above]
)
```

---

## Notes

### Lessons from Batch 12
1. ✅ Parallel execution works excellently for independent files
2. ✅ refactoring-specialist agent is ideal for TypeScript fixes
3. ⚠️ Some fixes reveal new errors - expect 80-90% of target reduction
4. ✅ Incremental commits are valuable for review and rollback

### Adjustments for Batch 13
1. **Better error scoping:** More accurate target estimates (100 vs 222 claimed in Batch 12)
2. **Shared types:** Explicitly call out opportunities for shared type definitions
3. **Verification steps:** Include specific testing recommendations
4. **Dependency awareness:** Note which files might affect others

---

## Timeline Estimate

**Parallel Execution:** ~15-20 minutes
- Agent initialization: 1-2 minutes
- Error fixing: 10-15 minutes
- Commits and cleanup: 2-3 minutes

**Sequential Execution (for comparison):** ~3-4 hours
- Would require manual fixing of each file
- Testing between each file
- Much higher cognitive load

**Speedup Factor:** ~10-12x faster with parallel agents

---

**Ready to execute when you are!** 🚀
