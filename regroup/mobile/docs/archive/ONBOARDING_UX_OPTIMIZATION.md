# Self-Service Onboarding UX Optimization

## Zero-Support Automation Strategy

**Date:** November 29, 2025  
**Goal:** Completely automated onboarding requiring zero human support  
**Philosophy:** Step-by-step handholding where users intuitively understand each step

---

## Executive Summary

Your self-service onboarding philosophy is **critical to sustainable scaling** and directly impacts unit economics. With fully automated onboarding:

- ✅ **Zero support costs** for new customer acquisition
- ✅ **Instant time-to-value** (no scheduling demos or calls)
- ✅ **24/7 onboarding** (customers activate whenever they want)
- ✅ **Higher conversion rates** (no friction of waiting for support)
- ✅ **Scales infinitely** (10 customers or 10,000 - same effort)

### Current State:

The existing `OperatorSetupWizard` already implements strong UX patterns:

- ✅ 5-step progressive wizard with visual indicators
- ✅ Contextual help text explaining each step
- ✅ Form validation with clear error messages
- ✅ Smart focus management on errors
- ✅ Cannot proceed until current step is valid

### Required Enhancements for Oxford Houses:

1. **House Model Selector** (Traditional vs. Oxford) at onboarding start
2. **Conditional flows** based on model selection
3. **Oxford-specific help text** (EES, officers, charter compliance)
4. **Smart defaults** for Oxford Houses (no phases, democratic structure)
5. **Progressive disclosure** of advanced features

---

## **Integration Philosophy: Reuse, Don't Rebuild**

**Critical Design Principle:** Oxford House onboarding will be **integrated into** the existing onboarding flow using conditional rendering, NOT built as a separate parallel system.

### **What This Means:**

```
❌ WRONG APPROACH (Separate Systems):
├─ TraditionalOnboardingWizard.tsx (1,000+ lines)
├─ OxfordOnboardingWizard.tsx (1,000+ lines)
├─ TraditionalHouseSetup.tsx
├─ OxfordHouseSetup.tsx
├─ TraditionalManagerSetup.tsx
├─ OxfordOfficerSetup.tsx
└─ Duplicate styling, validation, navigation...

Result: 2X the code, 2X the bugs, 2X the maintenance

✅ CORRECT APPROACH (Integrated):
├─ OperatorSetupWizard.tsx (add ~50 lines)
├─ HouseSetup.tsx (add ~30 lines for conditional fields)
├─ ManagerSetup.tsx (add ~20 lines for label changes)
├─ Skip PhaseConfig for Oxford (conditional array spread)
└─ Reuse ALL existing components, styling, validation

Result: <100 lines of new code, consistent UX, single source of truth
```

### **Implementation Strategy:**

**1. Same Components, Conditional Fields**

```tsx
// In HouseSetup.tsx - ONE component for both models
{
  model === 'traditional' && (
    <>
      <Field name="monthlyRent" />
      <Field name="weeklyRent" />
    </>
  );
}

{
  model === 'oxford' && (
    <>
      <Field name="equalExpenseShare" />
      <Field name="charterNumber" />
    </>
  );
}
```

**2. Same Navigation, Variable Steps**

```tsx
// In OperatorSetupWizard.tsx - Skip PhaseConfig for Oxford
this.pages = [
  <HouseSetup model={model} />,
  <ManagerSetup model={model} />,
  ...(model === 'traditional' ? [<PhaseConfig />] : []),
  <ChoreSetup model={model} />,
  <GuestSetup model={model} />,
];
```

**3. Same Styling, Different Labels**

```tsx
// In ManagerSetup.tsx - Change labels based on model
const header = model === 'oxford' ? 'Elected Officers' : 'Managers';
const roles =
  model === 'oxford'
    ? ['President', 'Treasurer', 'Secretary', 'Comptroller']
    : ['Owner', 'Manager', 'Assistant Manager', 'Staff'];
```

### **Benefits of Integration:**

| Aspect               | Integrated Approach | Separate Systems   |
| -------------------- | ------------------- | ------------------ |
| **Development Time** | 1-2 weeks           | 4-6 weeks          |
| **Lines of Code**    | +100 lines          | +2,000 lines       |
| **Bug Surface Area** | Same                | 2X                 |
| **UI Consistency**   | Guaranteed          | Drift over time    |
| **Maintenance**      | Single codebase     | Must update both   |
| **Testing**          | Same tests work     | 2X test suites     |
| **Styling**          | Automatic           | Must sync manually |

### **Why This Matters:**

- 🚀 **Ship Oxford House support in 1-2 weeks**, not months
- 🎨 **Guaranteed UX consistency** (same components = same behavior)
- 🐛 **Fix bugs once** (applies to both models automatically)
- 📱 **Proven mobile patterns** (keyboard handling, scrolling work perfectly)
- 💰 **Lower maintenance burden** (one codebase to understand)

**This document will show you exactly how to integrate Oxford House features while preserving your existing, high-quality onboarding UX.**

---

## Table of Contents

1. [Current Onboarding Analysis](#current-onboarding-analysis)
2. [Self-Service UX Principles](#self-service-ux-principles)
3. [Oxford House Onboarding Flow](#oxford-house-onboarding-flow)
4. [Enhanced UX Patterns](#enhanced-ux-patterns)
5. [Technical Implementation](#technical-implementation)
6. [Success Metrics](#success-metrics)
7. [Pricing Impact](#pricing-impact)

---

## Current Onboarding Analysis

### Traditional House Onboarding (5 Steps)

#### **Step 1: House Details**

```
Location: src/screens/SetupWizards/HouseSetup.tsx

Fields:
├─ House name
├─ Address (with Google Places autocomplete)
├─ Contact phone number
├─ Photo (optional)
├─ Monthly/weekly rent
├─ Deposits and fees
├─ Maximum capacity
├─ WiFi availability
├─ Certification status
└─ Guest gender

Help Text:
"First, we need some basic information about your house. This
information will be available on your house listing for any
potential guests looking for a recovery home."
```

**UX Strengths:**

- ✅ Clear, conversational help text
- ✅ Google Places autocomplete (reduces typing errors)
- ✅ Optional fields clearly marked
- ✅ Numeric inputs with min/max validation
- ✅ Radio buttons for binary choices (prevents invalid input)

**What Works Well:**

- Users understand exactly what's being asked
- Validation prevents bad data
- Progressive disclosure (photo is optional)

---

#### **Step 2: Manager Setup**

```
Location: src/screens/SetupWizards/ManagerSetup.tsx

Purpose: Add house managers/staff who can administer the system

Fields per manager:
├─ Name
├─ Email
├─ Phone
└─ Role/permissions
```

**UX Strengths:**

- ✅ Can add multiple managers
- ✅ Clear role explanations
- ✅ Email validation

---

#### **Step 3: Phase Configuration**

```
Location: src/screens/SetupWizards/PhaseSetup/PhaseConfig.tsx

Purpose: Set up accountability phases (Phase 1, Phase 2, etc.)

For each phase:
├─ Phase name
├─ Duration
├─ Required activities (meetings, work hours, etc.)
└─ Restrictions/privileges
```

**UX Strengths:**

- ✅ Templates/presets for common phase structures
- ✅ Nested ViewPager for complex multi-step configuration
- ✅ Visual phase progression

**Challenge for Oxford Houses:**

- ❌ Oxford Houses don't use phases (peer accountability instead)
- ✅ **Solution:** Skip this step entirely for Oxford House model

---

#### **Step 4: Chore Setup**

```
Location: src/screens/SetupWizards/ChoreSetup.tsx

Purpose: Define house chores that rotate weekly

Fields per chore:
├─ Chore name (e.g., "Kitchen", "Bathroom")
├─ Description
└─ Frequency
```

**UX Strengths:**

- ✅ Simple list management
- ✅ Bulk add common chores
- ✅ Can edit later

**Works for Both Models:**

- ✅ Traditional: Manager assigns chores
- ✅ Oxford: House votes on chore assignments

---

#### **Step 5: Guest Setup**

```
Location: src/screens/SetupWizards/GuestSetup.tsx

Purpose: Add initial residents

For each guest:
├─ Name
├─ Email
├─ Phone
├─ Move-in date
└─ Initial phase (Traditional only)
```

**UX Strengths:**

- ✅ Can skip and add guests later
- ✅ Bulk invite via email
- ✅ Clear privacy policy reminder

---

### Overall Assessment: Current Onboarding

**What's Excellent:**

- ✅ **Clear visual progress** (step indicator with icons)
- ✅ **Contextual help text** at each step
- ✅ **Smart validation** (can't proceed with errors)
- ✅ **Focus management** (auto-focus first error field)
- ✅ **Mobile-optimized** (keyboard handling, scrolling)
- ✅ **Progressive disclosure** (optional fields, skip options)
- ✅ **Forgiving** (can go back, edit later)

**Gaps for Self-Service:**

1. ❌ No in-app tooltips or help icons
2. ❌ No video demos embedded
3. ❌ No "example" data for preview
4. ❌ No success confirmation with next steps
5. ❌ No Oxford House differentiation yet

**Support Risk Areas:**

- ⚠️ Phase configuration (most complex step)
- ⚠️ Address autocomplete confusion
- ⚠️ Role/permission misunderstanding

---

## Self-Service UX Principles

### Principle 1: **Conversational, Human Language**

**Bad:**

```
"Configure system parameters"
"Set organizational hierarchy"
"Initialize data entities"
```

**Good:**

```
"Let's set up your house!"
"Who will help you manage the house?"
"What chores need to be done each week?"
```

**Why It Works:**

- Feels like a conversation, not a form
- Reduces cognitive load
- Makes users feel guided, not tested

---

### Principle 2: **Show, Don't Just Tell**

**Examples in Current UI:**

```tsx
// Instead of just "House Name":
<HelpText>
  This is the name guests will see when searching for recovery homes.
  Example: "Serenity House" or "Oak Street Recovery"
</HelpText>

// Instead of just "Maximum Capacity":
<HelpText>
  How many people can live here at the same time?
  Count all beds, including shared rooms.
</HelpText>
```

**Enhancement: Add Visual Examples**

```tsx
<ExampleCard>
  <Image source={houseListingExample} />
  <Text>Here's how your listing will look to guests:</Text>
</ExampleCard>
```

---

### Principle 3: **Smart Defaults**

**Current Implementation:**

```tsx
// Default values pre-filled
const initialValues = {
  certified: false, // Most houses start uncertified
  wifi: true, // Most houses have wifi in 2025
  gender: 'male', // Most common
};
```

**Enhancement for Oxford Houses:**

```tsx
// When Oxford model selected:
const oxfordDefaults = {
  maximumCapacity: 12, // Typical Oxford House size
  monthlyRent: 0, // Use EES instead
  hasPhases: false, // Oxford uses peer accountability
  democraticVoting: true, // Core Oxford principle
  zeroTolerancePolicy: true, // Required by Oxford model
};
```

**Why It Works:**

- Reduces decisions users need to make
- Teaches best practices through defaults
- Faster onboarding (pre-filled = less typing)

---

### Principle 4: **Inline Validation (Not Endpoint Validation)**

**Bad:**

```
User fills entire form → clicks Next → sees 5 errors at top → scrolls to fix
```

**Good:**

```
User types email → blur event → immediately validates → shows checkmark or error
```

**Current Implementation:**

```tsx
validate: async values => {
  // Validates on submit, but also on blur for each field
  await houseSchema.validate(values, { abortEarly: false });
};
```

**Enhancement:**

```tsx
<Field
  name="email"
  component={RatsTextInput}
  validate={validateEmail} // Instant feedback
  successIcon={<CheckCircle />}
  errorIcon={<XCircle />}
/>
```

---

### Principle 5: **Can't Proceed with Errors**

**Current Implementation:**

```tsx
<RatsButton
  title="Next"
  onPress={handleSubmit}
  disabled={!isValid || isSubmitting} // Button disabled if form invalid
/>
```

**Why It Works:**

- Prevents users from getting stuck later
- Forces data quality from the start
- Reduces support tickets ("Why can't I...?")

---

### Principle 6: **Progressive Disclosure**

**Current Example:**

```tsx
// Step 1: Basic info only
<HouseSetup />  // Name, address, capacity

// Step 2: More detail
<ManagerSetup />  // Who manages it?

// Step 3: Advanced
<PhaseSetup />  // Complex phase rules

// Not in wizard: Advanced settings (saved for later)
```

**Why It Works:**

- Prevents overwhelming users
- Introduces complexity gradually
- Optional features come after basics

---

### Principle 7: **Forgiving and Flexible**

**Current Implementation:**

```tsx
// Can go back
<Button onPress={onPrevPress}>Back</Button>

// Can skip optional steps
<Button onPress={onSkip}>Skip for now</Button>

// Can edit later
<Text>You can always change this in Settings</Text>
```

**Why It Works:**

- Users don't feel "locked in" to decisions
- Reduces anxiety about making mistakes
- Encourages completion (not perfection)

---

## Oxford House Onboarding Flow

### New Step 0: House Model Selector

**Screen: `HouseModelSelector.tsx` (NEW)**

```tsx
<Screen>
  <Header>What type of recovery home are you setting up?</Header>

  <ModelCard
    title="Traditional Sober Living"
    icon={<BuildingIcon />}
    description="Operator-managed homes with staff oversight, phase-based 
                 accountability, and manager-assigned activities."
    bestFor="House managers, treatment centers, for-profit operations"
    onSelect={() => selectModel('traditional')}
  />

  <ModelCard
    title="Oxford House"
    icon={<UsersIcon />}
    badge="Democratically-Governed"
    description="Resident-run homes with elected officers, peer accountability,
                 and democratic decision-making."
    bestFor="Self-governed recovery communities following Oxford House model"
    onSelect={() => selectModel('oxford')}
  />

  <HelpLink>Not sure which one? Learn more about the differences</HelpLink>
</Screen>
```

**UX Principles Applied:**

- ✅ **Clear differentiation** between models
- ✅ **Conversational language** (not "Select governance paradigm")
- ✅ **Visual cards** (easier to scan than dropdown)
- ✅ **Help link** for confused users (but not blocking)

---

### Traditional House Flow (Existing)

```
┌─────────────────────────────────────────────────────┐
│ Step 0: Model Selector → "Traditional" selected     │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Step 1: House Details                               │
│ ├─ Name, address, phone                            │
│ ├─ Photo                                           │
│ ├─ Monthly/weekly rent                             │
│ ├─ Capacity, wifi, certification                   │
│ └─ Gender                                          │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Step 2: Managers                                    │
│ ├─ Add house managers/staff                       │
│ └─ Set permissions                                 │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Step 3: Phase Configuration                         │
│ ├─ Define Phase 1, 2, 3, etc.                     │
│ ├─ Set duration and requirements                  │
│ └─ Configure privileges                           │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Step 4: Chores                                      │
│ └─ Add weekly chores                               │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Step 5: Initial Guests (Optional)                  │
│ └─ Add existing residents                          │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ ✅ Complete! Dashboard with next steps              │
└─────────────────────────────────────────────────────┘
```

**Total Steps:** 6 (0-5)  
**Estimated Time:** 8-12 minutes

---

### Oxford House Flow (NEW)

```
┌─────────────────────────────────────────────────────┐
│ Step 0: Model Selector → "Oxford House" selected    │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Step 1: House Details (Oxford-specific)            │
│ ├─ House name                                      │
│ ├─ Address, phone                                  │
│ ├─ Photo                                           │
│ ├─ Charter number (if applicable)                 │
│ ├─ Equal Expense Share (EES) amount               │
│ ├─ Maximum capacity (typically 8-15)              │
│ ├─ Gender                                          │
│ └─ Chapter affiliation (state/region)             │
│                                                     │
│ Help Text:                                         │
│ "Oxford Houses are self-supporting. The Equal      │
│  Expense Share (EES) covers rent, utilities, and   │
│  shared expenses - not profit or staff salaries."  │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Step 2: Elected Officers                           │
│ ├─ President                                       │
│ ├─ Treasurer                                       │
│ ├─ Secretary                                       │
│ └─ Comptroller                                     │
│                                                     │
│ Help Text:                                         │
│ "Oxford Houses are run by elected officers. If     │
│  you're just getting started, you can add officers │
│  now or elect them in your first business meeting."│
│                                                     │
│ [Skip for now] option                              │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Step 3: House Rules & Policies (Pre-configured)    │
│ ├─ ✓ Zero tolerance for alcohol/drugs             │
│ ├─ ✓ Immediate expulsion on relapse               │
│ ├─ ✓ Democratic voting (80% for major decisions)  │
│ ├─ ✓ Equal Expense Share (no special treatment)   │
│ ├─ ✓ Officer elections every 6 months             │
│ └─ ✓ Weekly business meetings                     │
│                                                     │
│ Help Text:                                         │
│ "These are core Oxford House principles and can't  │
│  be changed. They ensure the house runs            │
│  democratically and maintains sobriety standards." │
│                                                     │
│ [Review Charter] link                              │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Step 4: Chores                                      │
│ └─ Add weekly chores (same as Traditional)         │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ Step 5: Current Residents (Optional)               │
│ └─ Add existing house members                      │
│                                                     │
│ Help Text:                                         │
│ "Add residents who are already living in the house.│
│  New applicants will go through the democratic     │
│  interview and voting process in the app."         │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ ✅ Complete! Oxford House Dashboard                 │
│ Next Steps:                                        │
│ ├─ Schedule first business meeting                │
│ ├─ Set up bank account tracking (Treasurer)       │
│ └─ Review new member application process          │
└─────────────────────────────────────────────────────┘
```

**Total Steps:** 6 (0-5)  
**Estimated Time:** 6-10 minutes (simpler than Traditional)  
**Key Difference:** No phase configuration (saves 2-3 minutes)

---

## Enhanced UX Patterns

### 1. Contextual Help Tooltips

**Current:** Help text is static paragraph above form

**Enhancement:** Interactive help icons

```tsx
<Field
  name="equalExpenseShare"
  label="Equal Expense Share (EES)"
  component={RatsNumericInput}
  helpIcon={
    <Tooltip>
      <TooltipTrigger>
        <InfoIcon />
      </TooltipTrigger>
      <TooltipContent>
        <Title>What is EES?</Title>
        <Text>
          The Equal Expense Share is the monthly amount each resident pays to
          cover rent, utilities, phone, and other shared costs.
        </Text>
        <Text>
          It should NOT include profit, staff salaries, or individual expenses.
          Everyone pays the same amount.
        </Text>
        <Example>
          House rent: $2,000/month Utilities: $300/month Phone/Internet:
          $100/month 10 residents ───────────────────────── EES = $2,400 ÷ 10 =
          $240/resident/month
        </Example>
      </TooltipContent>
    </Tooltip>
  }
/>
```

**Why It Works:**

- ✅ Help available but not intrusive
- ✅ Detailed explanation with examples
- ✅ Calculates example based on user inputs

---

### 2. Embedded Video Demos

**Screen:** Complex steps like Phase Configuration

```tsx
<SetupHeader
  header="Phase Configuration"
  text="Set up accountability phases for your residents."
  video={
    <VideoDemo
      thumbnail={phaseSetupThumb}
      videoUrl="https://vimeo.com/rats/phase-setup"
      duration="2:30"
      caption="Watch: How to configure phases (2.5 min)"
    />
  }
/>
```

**Why It Works:**

- ✅ Visual learners get demonstration
- ✅ Optional (doesn't slow down power users)
- ✅ Short duration (under 3 minutes)

---

### 3. Smart Field Dependencies

**Example: EES Calculator**

```tsx
<OxfordHouseDetailsForm>
  {/* User enters these */}
  <Field name="monthlyRent" label="Monthly Rent" onChange={calculateEES} />
  <Field name="monthlyUtilities" label="Utilities" onChange={calculateEES} />
  <Field
    name="monthlyInternet"
    label="Internet/Phone"
    onChange={calculateEES}
  />
  <Field name="capacity" label="House Capacity" onChange={calculateEES} />

  {/* Auto-calculated */}
  <CalculatedField
    label="Recommended EES per Resident"
    value={eesCalculation}
    formula="(Rent + Utilities + Internet) ÷ Capacity"
    icon={<CalculatorIcon />}
  />
</OxfordHouseDetailsForm>;

function calculateEES(values) {
  const total =
    values.monthlyRent + values.monthlyUtilities + values.monthlyInternet;
  return Math.ceil(total / values.capacity);
}
```

**Why It Works:**

- ✅ Reduces math errors
- ✅ Shows formula transparency
- ✅ Educational (teaches EES concept)

---

### 4. Example Data Preview

**Screen:** House Listing Preview

```tsx
<SetupStep name="details">
  <Form>{/* Fields */}</Form>

  {/* Live Preview */}
  <PreviewCard>
    <PreviewHeader>Guest View Preview</PreviewHeader>
    <HouseListingCard
      name={values.name || 'Your House Name'}
      address={values.address || '123 Main St, City, State'}
      rent={values.monthlyRent || '$0'}
      capacity={values.capacity || '0'}
      photo={values.imageUrl || placeholderImage}
    />
    <Text style={styles.previewCaption}>
      This is how guests will see your house in search results
    </Text>
  </PreviewCard>
</SetupStep>
```

**Why It Works:**

- ✅ Instant feedback on data entry
- ✅ Shows real-world impact of decisions
- ✅ Motivates completing optional fields (photo, etc.)

---

### 5. Success Confirmation with Next Steps

**Current:** Wizard completes → dumps user on dashboard

**Enhancement:** Success screen with guided next steps

```tsx
<OnboardingCompleteScreen>
  <SuccessAnimation>
    <CheckmarkCircle size={80} animated />
  </SuccessAnimation>

  <Heading>Welcome to RATS! 🎉</Heading>

  <Text>
    Your {houseModel === 'oxford' ? 'Oxford House' : 'house'} is set up and
    ready to go. Here's what to do next:
  </Text>

  <NextStepsList>
    <NextStep
      number={1}
      title="Invite Residents"
      description="Add residents so they can track their activities"
      action="Add Residents"
      onPress={() => navigate(Routes.GuestInvite)}
      estimated="5 min"
    />

    <NextStep
      number={2}
      title={
        houseModel === 'oxford'
          ? 'Schedule Business Meeting'
          : 'Review Dashboard'
      }
      description={
        houseModel === 'oxford'
          ? 'Set up your first weekly business meeting'
          : 'Explore the dashboard and reports'
      }
      action={houseModel === 'oxford' ? 'Schedule Meeting' : 'View Dashboard'}
      estimated="2 min"
    />

    <NextStep
      number={3}
      title="Watch Tutorial"
      description="5-minute overview of key features"
      action="Watch Video"
      optional
      estimated="5 min"
    />
  </NextStepsList>

  <SecondaryButton onPress={() => navigate(Routes.Dashboard)}>
    Skip to Dashboard
  </SecondaryButton>
</OnboardingCompleteScreen>
```

**Why It Works:**

- ✅ Celebrates completion (psychological win)
- ✅ Prevents "now what?" confusion
- ✅ Guides to high-value actions
- ✅ Sets expectations (time estimates)
- ✅ Optional for power users (can skip)

---

### 6. Onboarding Progress Persistence

**Problem:** User closes app mid-onboarding → loses all progress

**Solution:** Auto-save to Firestore

```tsx
// Auto-save on each step completion
async function onStepComplete(step: number, data: any) {
  await firestoreUpdate(`/onboarding/${userId}`, {
    currentStep: step,
    completedSteps: [...completedSteps, step],
    data: { ...existingData, ...data },
    lastUpdated: serverTimestamp(),
  });
}

// Resume on app open
async function loadOnboardingState() {
  const state = await firestoreGet(`/onboarding/${userId}`);
  if (state && state.currentStep < TOTAL_STEPS) {
    return {
      resumeOnboarding: true,
      currentStep: state.currentStep,
      data: state.data,
    };
  }
}

// Show resume modal
<OnboardingResumeModal
  visible={resumeOnboarding}
  currentStep={currentStep}
  onResume={() => navigateToStep(currentStep)}
  onRestart={() => startOnboarding()}
/>;
```

**Why It Works:**

- ✅ Users can pause/resume without losing work
- ✅ Reduces abandonment
- ✅ Works across devices (cloud-saved)

---

## Technical Implementation

### **Philosophy: Integration, Not Duplication**

**Critical Requirement:** Retain existing UI/UX patterns and integrate Oxford House features into the current onboarding flow.

**Architecture:** Use the SAME components with conditional rendering

```tsx
// In House entity (add model field to existing entity)
export class House {
  model: 'traditional' | 'oxford';  // NEW FIELD
  // ... all existing fields remain unchanged
}

// In OperatorSetupWizard - MINIMAL CHANGES to existing code
constructor(props) {
  super(props);
  this.state = new State();
  const { houseModel } = props.route.params;  // From model selector

  // Use conditional array spread to skip PhaseConfig for Oxford
  this.pages = [
    <HouseSetup
      {...props}
      model={houseModel}
      focused={this.state.currentPage === 0}
      onNextPress={() => this.onStepPress(1)}
      key="0"
    />,

    // REUSE ManagerSetup for both traditional managers AND Oxford officers
    // Just change labels/help text based on model prop
    <ManagerSetup
      {...props}
      model={houseModel}  // Pass model to conditionally render help text
      focused={this.state.currentPage === 1}
      onPrevPress={() => this.onStepPress(0)}
      onNextPress={() => this.onStepPress(2)}
      key="1"
    />,

    // PhaseConfig: Only include for traditional houses
    ...(houseModel === 'traditional' ? [
      <PhaseConfig
        {...props}
        setViewPagerOnParent={this.setPhaseConfigViewPager}
        focused={this.state.currentPage === 2}
        onPrevPress={() => this.onStepPress(1)}
        onNextPress={() => this.onStepPress(3)}
        key="2"
      />
    ] : []),

    // ChoreSetup: Same component for both models
    <ChoreSetup
      {...props}
      model={houseModel}
      focused={this.state.currentPage === (houseModel === 'traditional' ? 3 : 2)}
      onPrevPress={() => this.onStepPress(houseModel === 'traditional' ? 2 : 1)}
      onNextPress={() => this.onStepPress(houseModel === 'traditional' ? 4 : 3)}
      key="3"
    />,

    // GuestSetup: Same component, conditionally shows "initial phase" field
    <GuestSetup
      {...props}
      model={houseModel}
      focused={this.state.currentPage === (houseModel === 'traditional' ? 4 : 3)}
      onPrevPress={() => this.onStepPress(houseModel === 'traditional' ? 3 : 2)}
      onNextPress={this.finishHouseSetup}
      key="4"
    />,
  ];
}
```

**Why This Works:**

- ✅ **Reuses ALL existing components** (HouseSetup, ManagerSetup, ChoreSetup, GuestSetup)
- ✅ **Same UI patterns** (SetupButtons, SetupHeader, RatsTextInput, RatsNumericInput)
- ✅ **Consistent styling** (uses existing theme, normalize, fontSize, color)
- ✅ **Same step indicator** (just updates labels for Oxford)
- ✅ **Minimal code changes** (conditional rendering within components)
- ✅ **No duplicate components** (ManagerSetup serves both managers AND officers)
- ✅ **Single source of truth** for validation, styling, navigation
- ✅ **Easy to maintain** (one codebase, not two parallel systems)

---

### Modifying Existing Components (Not Creating New Ones)

**Example: HouseSetup.tsx - Add Oxford-specific fields**

```tsx
// In HouseSetup.tsx - MODIFY existing component, don't create new one

render() {
  const { selectedHouse, model } = this.props;

  return (
    <View style={{ flex: 1, backgroundColor: color.white, paddingHorizontal: 0 }}>
      <RatsScrollView {...scrollProps}>
        <RatsText text="Details" style={{ ...HEADER, marginLeft: 0 }} />

        {/* Help text changes based on model */}
        <RatsText
          style={helpTextStyle}
          text={
            model === 'oxford'
              ? "Let's set up your Oxford House. This information will be visible to prospective members."
              : "First, we need some basic information about your house. This information will be available on your house listing for any potential guests looking for a recovery home."
          }
        />

        {/* SHARED FIELDS (both models) */}
        <Field name="name" component={RatsTextInput} label="House Name" />
        <Field name="address" component={RatsTextInput} label="Address" address />
        <Field name="phoneNumber" component={RatsTextInput} label="Contact Number" />
        <RatsImagePicker label="Photo (optional)" {...imageProps} />

        {/* TRADITIONAL-ONLY FIELDS */}
        {model === 'traditional' && (
          <>
            <Field name="monthlyRent" component={RatsNumericInput} label="Monthly Rent" />
            <Field name="weeklyRent" component={RatsNumericInput} label="Weekly Rent" />
            <Field name="depositsAndFees" component={RatsNumericInput} label="Fees / Deposits" />
          </>
        )}

        {/* OXFORD-ONLY FIELDS */}
        {model === 'oxford' && (
          <>
            <Field
              name="equalExpenseShare"
              component={RatsNumericInput}
              label="Equal Expense Share (EES)"
              helpText="Monthly amount each resident pays for rent, utilities, and shared costs"
            />
            <Field
              name="charterNumber"
              component={RatsTextInput}
              label="Charter Number (Optional)"
              helpText="Your Oxford House charter number, if applicable"
            />
            <Field
              name="chapterAffiliation"
              component={RatsTextInput}
              label="Chapter Affiliation (Optional)"
              helpText="e.g., 'California Chapter', 'Mid-Atlantic Region'"
            />
          </>
        )}

        {/* SHARED FIELDS (both models) */}
        <Field name="maximumCapacity" component={RatsNumericInput} label="How many beds are in this house?" />
        <Field name="wifi" component={RatsSwitch} label="Wifi Offered" />
        <Field name="certified" component={RatsRadioButtonGroup} label="Certification Status" />
        <Field name="gender" component={RatsRadioButtonGroup} label="Guest Gender" />
      </RatsScrollView>

      {/* SAME SetupButtons component */}
      <SetupButtons
        rightLabel={this.props.forSettings ? 'Save' : 'Next'}
        submit={this.submit}
        leftPress={this.props.onPrevPress}
      />
    </View>
  );
}
```

**Example: ManagerSetup.tsx - Reuse for Oxford Officers**

```tsx
// In ManagerSetup.tsx - Just change labels based on model

render() {
  const { model } = this.props;

  // Change header/help text based on model
  const header = model === 'oxford' ? 'Elected Officers' : 'Managers';
  const helpText = model === 'oxford'
    ? 'Oxford Houses are run by elected officers. Add your current officers here, or you can elect them later in your first business meeting.'
    : 'Who will help you manage the house? Add managers who will have access to admin features.';

  // Change role options based on model
  const roleOptions = model === 'oxford'
    ? ['President', 'Treasurer', 'Secretary', 'Comptroller', 'Member']
    : ['Owner/Operator', 'House Manager', 'Assistant Manager', 'Staff'];

  return (
    <View style={{ flex: 1 }}>
      <RatsScrollView>
        <RatsText text={header} style={{ ...HEADER }} />
        <RatsText style={helpTextStyle} text={helpText} />

        {/* SAME form fields, just different labels */}
        <ManagerList
          managers={this.state.managers}
          roleOptions={roleOptions}
          onAdd={this.addManager}
          onRemove={this.removeManager}
        />
      </RatsScrollView>

      {/* SAME SetupButtons */}
      <SetupButtons
        rightLabel="Next"
        submit={this.submit}
        leftPress={this.props.onPrevPress}
      />
    </View>
  );
}
```

**Example: Step Indicator Labels**

```tsx
// In OperatorSetupWizard - Conditionally set step labels

render() {
  const { houseModel } = this.props.route.params;

  const stepLabels = houseModel === 'oxford'
    ? [
        { label: 'Details', icon: 'info-circle' },
        { label: 'Officers', icon: 'user-shield' },     // Changed from "Managers"
        { label: 'Chores', icon: 'people-carry' },      // No phases step
        { label: 'Members', icon: 'users' },            // Changed from "Guests"
      ]
    : [
        { label: 'Details', icon: 'info-circle' },
        { label: 'Managers', icon: 'user-shield' },
        { label: 'Phases', icon: 'list-ol' },
        { label: 'Chores', icon: 'people-carry' },
        { label: 'Guests', icon: 'users' },
      ];

  return (
    <View style={{ flex: 1 }}>
      {!keyboardIsShowing && (
        <RatsSetupStepIndicator
          stepCount={stepLabels.length}
          currentPosition={this.state.currentPage}
          labels={stepLabels}
        />
      )}
      {/* ViewPager with conditional pages */}
    </View>
  );
}
```

**Key Benefits of This Approach:**

- ✅ **Zero new components** (just conditional logic in existing ones)
- ✅ **Same validation schemas** (just add oxford-specific fields to House entity)
- ✅ **Same styling system** (all existing theme, normalize, fontSize work)
- ✅ **Same navigation** (SetupButtons, ViewPager, step indicators)
- ✅ **Shared bug fixes** (fix once, works for both models)
- ✅ **Consistent UX** (users see familiar patterns)
- ✅ **Easy testing** (same test infrastructure)

---

### Help Content Management

**Strategy:** Separate help content from UI code

```typescript
// src/constants/onboarding-help.ts
export const OnboardingHelp = {
  traditional: {
    houseDetails: {
      title: 'House Details',
      description: 'First, we need some basic information about your house...',
      fields: {
        name: {
          label: 'House Name',
          helpText: 'This is the name guests will see when searching.',
          example: 'Serenity House',
        },
        monthlyRent: {
          label: 'Monthly Rent',
          helpText: 'How much do residents pay per month?',
          example: '$600',
        },
      },
    },
  },

  oxford: {
    houseDetails: {
      title: 'House Details',
      description:
        "Let's set up your Oxford House. We need some basic information...",
      fields: {
        name: {
          label: 'House Name',
          helpText: 'Your house name (often the street name or neighborhood).',
          example: 'Oak Street House',
        },
        equalExpenseShare: {
          label: 'Equal Expense Share (EES)',
          helpText:
            'The monthly amount each resident pays to cover shared expenses...',
          example: '$450',
          tooltip: {
            title: 'What is EES?',
            content:
              'The EES covers rent, utilities, phone, and shared costs...',
            calculation: '(Rent + Utilities + Phone) ÷ Number of Residents',
          },
        },
      },
    },
  },
};

// Usage in component
<Field
  name="equalExpenseShare"
  label={OnboardingHelp.oxford.houseDetails.fields.equalExpenseShare.label}
  helpText={
    OnboardingHelp.oxford.houseDetails.fields.equalExpenseShare.helpText
  }
  tooltip={OnboardingHelp.oxford.houseDetails.fields.equalExpenseShare.tooltip}
/>;
```

**Benefits:**

- ✅ Easy to update copy without touching UI code
- ✅ Consistent messaging across app
- ✅ Can A/B test different help text
- ✅ Translation-ready (i18n)

---

### Validation Schemas

**Model-specific validation:**

```typescript
// src/entities/House.tsx
import * as Yup from 'yup';

export const traditionalHouseSchema = Yup.object({
  name: Yup.string().required('House name is required'),
  street: Yup.string().required('Address is required'),
  monthlyRent: Yup.number().min(0).required('Monthly rent is required'),
  weeklyRent: Yup.number().min(0),
  maximumCapacity: Yup.number().min(1).max(50).required('Capacity is required'),
  certified: Yup.boolean(),
  gender: Yup.string().oneOf(['male', 'female', 'non-binary']).required(),
});

export const oxfordHouseSchema = Yup.object({
  name: Yup.string().required('House name is required'),
  street: Yup.string().required('Address is required'),
  equalExpenseShare: Yup.number()
    .min(100, 'EES should be at least $100')
    .max(1000, 'EES seems high - check your calculation')
    .required('Equal Expense Share is required'),
  maximumCapacity: Yup.number()
    .min(6, 'Oxford Houses typically have at least 6 residents')
    .max(15, 'Oxford Houses typically have no more than 15 residents')
    .required('Capacity is required'),
  charterNumber: Yup.string(), // Optional
  chapterAffiliation: Yup.string(), // Optional
  // No monthlyRent (use EES instead)
  // No weeklyRent (Oxford doesn't do weekly)
});

// Usage in form
const schema =
  houseModel === 'oxford' ? oxfordHouseSchema : traditionalHouseSchema;
```

**Why This Works:**

- ✅ Model-specific validation rules
- ✅ Helpful error messages guide users
- ✅ Prevents invalid data from the start

---

## Success Metrics

### Onboarding Completion Rate

**Target:** >80% of users who start onboarding complete it

**Current Tracking:**

```typescript
// Track step completions
analytics.track('onboarding_step_completed', {
  step: 'house_details',
  model: 'oxford',
  timeSpent: 120, // seconds
});

// Track abandonment
analytics.track('onboarding_abandoned', {
  step: 'phase_config',
  model: 'traditional',
  timeSpent: 300,
  reason: 'app_backgrounded', // or 'user_quit', 'timeout'
});

// Track completion
analytics.track('onboarding_completed', {
  model: 'oxford',
  totalTime: 480, // seconds (8 minutes)
  stepsCompleted: 5,
});
```

**Analysis:**

- Track completion rate by step (which step has highest drop-off?)
- Track time per step (which step is confusing/slow?)
- Track completion rate by model (Traditional vs. Oxford)

---

### Time to Complete

**Target:**

- Traditional: <10 minutes
- Oxford: <8 minutes

**Why It Matters:**

- Shorter onboarding = higher completion rate
- Users can finish in one sitting
- Mobile-friendly (attention span)

---

### Support Ticket Rate

**Target:** <5% of new users open support tickets

**Current Reality:**

- With good self-service UX, should be <2%
- Most tickets should be edge cases or bugs

**Analysis:**

```typescript
const supportTicketRate = (supportTickets / newSignups) * 100;

// Break down by onboarding step
const ticketsByStep = {
  house_details: 12, // Address autocomplete issues
  manager_setup: 3, // Email bouncing
  phase_config: 25, // Most confusing step
  chore_setup: 2,
  guest_setup: 5,
};

// Action: Improve phase_config UX (highest tickets)
```

---

### Feature Discovery Rate

**Metric:** % of users who discover key features in first week

**Key Features:**

- Activity logging
- GPS meeting check-in
- Dispute filing
- Messaging
- Reports

**Target:** >60% use at least 3 core features in first week

**How to Improve:**

- In-app tooltips on first use
- "New" badges on features
- Onboarding checklist
- Email drip campaign

---

## Pricing Impact

### Support Cost Analysis (Updated)

With **fully automated self-service onboarding**, support costs are dramatically lower than initially estimated:

```
PREVIOUS ESTIMATE (with support calls/demos):
├─ 100 customers × 2 hours support/month = 200 hours
├─ Cost: 200 hours × $25/hr = $5,000/month
└─ Unsustainable at $20/customer ($2,000 revenue)

ACTUAL WITH SELF-SERVICE ONBOARDING:
├─ 100 customers × 0.2 hours support/month = 20 hours
│   (Only 5-10% need help, mostly edge cases)
├─ Cost: 20 hours × $25/hr = $500/month
└─ Sustainable even at $49/customer ($4,900 revenue)
```

### Revised Unit Economics

**At $49-129/month pricing (recommended):**

```
250 Customers:
├─ Monthly Revenue: $26,240
├─ Infrastructure: $200/month
├─ Support (self-service): $500/month (vs. $5,000 with demos)
├─ Marketing: $3,000/month
└─ Gross Profit: $22,540/month (86% margin!)

Annual:
├─ Revenue: $314,880
├─ Costs: $45,600
└─ Net Profit: $269,280 (85% margin)
```

**Key Insight:** Self-service onboarding is a **profit multiplier**. You can scale to 1,000 customers without proportionally increasing support costs.

---

### Competitive Advantage

**Your self-service onboarding is a moat:**

```
Competitor trying to copy you:
├─ Must offer live demos/onboarding calls
├─ Support cost: $50-100 per customer acquisition
├─ Can't profitably serve small houses
├─ Must charge $100+ to break even

You:
├─ Zero-touch onboarding
├─ Support cost: $2-5 per customer acquisition
├─ Can serve 6-bed houses profitably
├─ Charge $49 and still have 90% margins
```

**Bottom Line:** Great UX isn't just about user satisfaction - it's a **sustainable competitive advantage** that allows you to offer better pricing while maintaining higher margins.

---

## Implementation Checklist

### Phase 1: Oxford House Onboarding (Q1 2025)

**Core Principle: Modify existing components, don't create new ones**

#### 1. Data Model Updates

- [ ] Add `model: 'traditional' | 'oxford'` field to House entity
- [ ] Add Oxford-specific fields to House entity (equalExpenseShare, charterNumber, chapterAffiliation)
- [ ] Update House validation schema to include oxford-specific validations
- [ ] Add Firestore indexes for new fields

#### 2. Model Selector (NEW component)

- [ ] Create `HouseModelSelector` screen using existing card patterns (similar to existing screens)
- [ ] Add route parameter passing for `houseModel`
- [ ] Style using existing theme system (CARD_STYLE, HEADER, color, normalize)

#### 3. Modify Existing Components

- [ ] **HouseSetup.tsx**: Add conditional rendering for Oxford fields (EES, charter)
- [ ] **HouseSetup.tsx**: Update help text based on model prop
- [ ] **ManagerSetup.tsx**: Change labels to "Officers" for Oxford model
- [ ] **ManagerSetup.tsx**: Update role options (President, Treasurer, etc. for Oxford)
- [ ] **GuestSetup.tsx**: Hide "initial phase" field for Oxford model
- [ ] **GuestSetup.tsx**: Update help text for Oxford (democratic acceptance process)

#### 4. Update OperatorSetupWizard

- [ ] Add conditional array spread to skip PhaseConfig for Oxford
- [ ] Update step count calculation based on model
- [ ] Update step indicator labels based on model
- [ ] Pass model prop to all child components
- [ ] Adjust currentPage calculations for variable step count

#### 5. Help Content

- [ ] Create `onboarding-help.ts` constants file (optional, can inline for v1)
- [ ] Add tooltip components for EES explanation (using existing patterns)
- [ ] Update all help text strings to be model-aware

#### 6. Analytics & Tracking

- [ ] Add `model` field to all onboarding analytics events
- [ ] Track completion rates by model
- [ ] Track time-per-step by model

#### 7. Testing

- [ ] Test Traditional flow (should work exactly as before)
- [ ] Test Oxford flow (skips phases, shows EES fields)
- [ ] Test navigation forward/back in both flows
- [ ] Test form validation for both models
- [ ] Test save/resume onboarding for both models

**Estimated Effort:** 1-2 weeks (much faster than building new components!)

**Why It's Faster:**

- ✅ Reusing all existing UI components
- ✅ Same styling system (no new styles needed)
- ✅ Same navigation patterns
- ✅ Same validation infrastructure
- ✅ Most changes are just conditional `{model === 'oxford' && <Field />}`

---

### Phase 2: Enhanced Help System (Q2 2025)

- [ ] Extract help content to `onboarding-help.ts`
- [ ] Build `Tooltip` component with examples
- [ ] Add contextual help icons to all form fields
- [ ] Build EES calculator for Oxford Houses
- [ ] Add live preview for house listing
- [ ] Create video demos for complex steps (Phase Config, Officer Elections)
- [ ] Build in-app tutorial system

**Estimated Effort:** 2 weeks

---

### Phase 3: Onboarding Optimization (Q3 2025)

- [ ] A/B test different help text
- [ ] Optimize step order based on completion data
- [ ] Add smart defaults based on house type
- [ ] Build onboarding checklist for dashboard
- [ ] Create email drip campaign for incomplete onboardings
- [ ] Add "resume onboarding" modal
- [ ] Implement feature discovery tooltips

**Estimated Effort:** 1-2 weeks

---

## Conclusion

Your vision for **completely automated, zero-support onboarding** is not only achievable but **critical for sustainable scaling**. The existing wizard already has strong UX foundations:

- ✅ Clear step progression with visual indicators
- ✅ Contextual help text at each step
- ✅ Smart validation preventing bad data
- ✅ Forgiving flows (can go back, edit later)
- ✅ Mobile-optimized (keyboard handling, scrolling)
- ✅ **High-quality UI components** (SetupButtons, SetupHeader, RatsTextInput)

### **Integration Strategy: Minimal Changes, Maximum Reuse**

The key insight is that Oxford House onboarding should **integrate into** the existing flow, not duplicate it:

- ✅ **Reuse ALL existing components** (HouseSetup, ManagerSetup, ChoreSetup, GuestSetup)
- ✅ **Same styling system** (theme, normalize, fontSize, color constants)
- ✅ **Same navigation patterns** (ViewPager, SetupButtons, step indicators)
- ✅ **Conditional rendering** within components (`{model === 'oxford' && <Field />}`)
- ✅ **Skip PhaseConfig** for Oxford using conditional array spread
- ✅ **Change labels only** (Managers → Officers, Guests → Members)

**Benefits:**

- 🚀 **1-2 weeks to implement** (vs. 3-4 weeks building new components)
- 🎨 **Consistent UX** (users see familiar patterns)
- 🐛 **Shared bug fixes** (fix once, works for both models)
- 🧪 **Same test infrastructure** (no new test patterns needed)
- 📱 **Proven mobile UX** (keyboard handling, scrolling already work)

### **What You'll Achieve:**

- <5% support ticket rate
- > 80% onboarding completion (both models)
- <10 minute completion time (Traditional), <8 minutes (Oxford)
- **$500/month support costs** (vs. $5,000+ with demos)
- **85%+ profit margins** at scale

### **Why This Matters for Business:**

**Self-service onboarding is your competitive moat:**

```
Competitor approach:
├─ Must build separate flows for different models
├─ Must offer live demos/onboarding calls
├─ Support cost: $50-100 per customer
├─ Can't serve small houses profitably
└─ Must charge $100+ to break even

Your approach:
├─ Single integrated flow with conditional logic
├─ Zero-touch automated onboarding
├─ Support cost: $2-5 per customer
├─ Can serve 6-bed houses at $49/month profitably
└─ 90% margins while undercutting competitors
```

**This allows you to:**

- Price lower than competitors (while maintaining higher margins)
- Serve smaller houses profitably
- Scale to 1,000+ houses without proportional cost increases
- Deliver instant time-to-value (no scheduling demos)
- Launch Oxford House support in 1-2 weeks (not 3-4 months)

### **Implementation Roadmap:**

**Week 1-2: Core Implementation**

1. Add `model` field to House entity
2. Create HouseModelSelector screen (reuse existing card patterns)
3. Add conditional fields to HouseSetup (EES, charter)
4. Update ManagerSetup labels for Oxford (Officers)
5. Skip PhaseConfig for Oxford (conditional array spread)
6. Update step indicator labels

**Week 3: Testing & Polish** 7. Test both flows end-to-end 8. Add analytics tracking by model 9. Update help text for clarity 10. Deploy to beta users

**Month 2-3: Optimization** 11. Track completion rates by model 12. Identify drop-off points 13. Add tooltips for confusing fields (if needed) 14. A/B test help text improvements

**Target: Launch Oxford House support by end of Q1 2025**

### **Critical Success Factors:**

1. ✅ **Retain existing UI patterns** - Don't reinvent the wheel
2. ✅ **Conditional rendering, not duplication** - One codebase for both models
3. ✅ **Model prop throughout** - Pass model to all components for context
4. ✅ **Track everything** - Analytics on completion, time, drop-off
5. ✅ **Iterate based on data** - Fix actual pain points, not perceived ones

**Your "handholding without holding hands" approach is exactly right.** With this integrated strategy, you'll have Oxford House onboarding live in 1-2 weeks while maintaining the high-quality UX that makes self-service possible.
