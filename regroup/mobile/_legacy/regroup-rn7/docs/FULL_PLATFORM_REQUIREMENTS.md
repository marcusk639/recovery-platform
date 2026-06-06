> ⚠️ **Legacy document.** Carried over from the standalone `regroup-rn7` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `mobile` documentation.

# RATS - Sober Living Management Platform

## Full Platform Features & Requirements
## (AKA - The Dream End State)

---

## Executive Summary

RATS (Regroup App for Tracking Sobriety) is a comprehensive mobile and web application designed to streamline the management of sober living homes. The platform provides house operators with powerful tools to track resident compliance, manage daily operations, and maintain accountability while offering residents a clear path to recovery through structured tracking and milestone achievements.

**Target Market:** Sober living house owners, operators, managers, residents in recovery programs, and Oxford House communities

**Platform:** iOS, Android (React Native), and Web (Angular)

**House Models Supported:**

- Traditional operator-managed sober living homes
- Oxford House self-governed democratic recovery residences

---

## 1. Core Value Proposition

### For House Owners/Operators:

- **Automated Compliance Tracking**: Eliminate manual check-ins and paperwork
- **Real-Time Oversight**: Monitor multiple houses and residents from anywhere
- **Dispute Resolution System**: Handle conflicts fairly with documented evidence
- **Financial Management**: Track rent, fees, and payment history
- **Reduced Administrative Burden**: Automate weekly reporting and phase advancement

### For Residents:

- **Clear Expectations**: Understand daily and weekly requirements
- **Progress Visualization**: See advancement through recovery phases
- **Accountability Tools**: Self-report activities with verification system
- **Goal Achievement**: Track milestones and celebrate successes
- **Community Connection**: Stay engaged with house activities and meetings

---

## 2. House Models: Traditional vs. Oxford House

RATS supports two distinct sober living models, each with different governance structures and operational requirements.

### 2.1 Traditional Operator-Managed Houses

**Structure:**

- Professional house manager/administrator oversees operations
- Owner or operator makes final decisions
- Phase-based progression system
- Manager assigns chores and monitors compliance
- Fixed or tiered length of stay programs

**Management Features:**

- Full administrator dashboard with oversight controls
- Phase advancement tracking
- Dispute resolution by management
- Flexible rule configuration
- Staff management capabilities

### 2.2 Oxford House Model (Self-Governed)

**Structure:**

- Democratically self-run by residents with no professional staff
- Every resident has equal voting rights (one person, one vote)
- Elected officers with term limits (~6 months): President, Treasurer, Secretary, Comptroller
- Decisions made by majority vote (new member acceptance requires ~80% approval)
- Indefinite length of stay as long as abstinence and house rules are maintained
- Zero tolerance policy: immediate expulsion for substance use
- Mandatory weekly business meetings

**Financial Model:**

- Equal Expense Share (EES): all residents pay the same amount regardless of room
- EES covers rent, utilities, phone, internet, cable, basic food staples
- Typically $80-160/week or $400-600/month depending on location
- House is financially self-supporting

**Oxford House Charter Requirements:**

1. Must be democratically self-run
2. Must be financially self-supporting
3. Must immediately expel any resident who returns to alcohol or drug use

**Key Differences from Traditional Model:**

| Feature          | Traditional              | Oxford House                      |
| ---------------- | ------------------------ | --------------------------------- |
| Management       | Professional staff/owner | Peer-run, no staff                |
| Decision-making  | Manager decides          | Democratic vote                   |
| Leadership       | Hired manager            | Elected officers                  |
| Length of stay   | Phase-based/fixed        | Indefinite                        |
| Pricing          | Tiered by room/bed       | Equal Expense Share               |
| Chores           | Assigned by manager      | Democratically assigned           |
| Substance policy | Warnings/disputes        | Immediate expulsion               |
| Meetings         | Optional or required     | Mandatory weekly business meeting |
| New residents    | Manager approves         | ~80% house vote required          |

**RATS Features for Oxford Houses:**

- Democratic voting system for decisions
- Officer election management and term tracking
- Business meeting scheduling and agenda tracking
- Equal Expense Share (EES) calculation and collection
- Financial transparency reporting for all members
- New member voting and approval workflow
- Charter compliance monitoring
- Peer accountability tracking (no phase system)
- House meeting minutes and records
- Officer rotation reminders

---

## 3. User Roles & Permissions

### 3.1 Super Administrator (All House Types)

- **Access Level**: Full system access across all houses
- **Capabilities**:
  - Create and manage multiple sober living houses
  - Assign house administrators/managers
  - Configure global settings and policies
  - Access analytics across entire organization
  - Manage subscription and billing

### 3.2 House Administrator/Manager (Traditional Houses Only)

- **Access Level**: Full access to assigned house(s)
- **Capabilities**:
  - Manage resident profiles and assignments
  - Review and approve/dispute activities
  - Configure house-specific rules and phases
  - Assign chores and responsibilities
  - Handle disputes and violations
  - Generate reports and compliance summaries
  - Manage guest invitations and onboarding

### 3.3 Oxford House Elected Officers (Oxford Houses Only)

**President:**

- **Term**: ~6 months with term limits to prevent "bossism"
- **Capabilities**:
  - Chair weekly business meetings
  - Represent house in external matters
  - Ensure charter compliance
  - Initiate house votes on major decisions
  - Limited system administration (cannot override democratic decisions)

**Treasurer:**

- **Term**: ~6 months with term limits
- **Capabilities**:
  - Collect Equal Expense Share (EES) from residents
  - Pay house bills (rent, utilities)
  - Maintain financial records accessible to all members
  - Present financial reports at weekly meetings
  - Track outstanding balances

**Secretary:**

- **Term**: ~6 months with term limits
- **Capabilities**:
  - Record meeting minutes
  - Maintain house records and documentation
  - Handle correspondence
  - Track attendance at business meetings
  - Document house votes and decisions

**Comptroller:**

- **Term**: ~6 months with term limits
- **Capabilities**:
  - Audit financial records
  - Verify bill payments
  - Review treasurer's work
  - Ensure financial transparency

**Note**: Officers are "trusted servants" with no special authority beyond their specific duties. All major decisions require democratic house vote.

### 3.4 Senior Peer/House Leader (Traditional Houses Only)

- **Access Level**: Limited administrative access
- **Capabilities**:
  - Verify resident activities
  - Report house issues
  - Assist with new resident onboarding
  - View house statistics
  - Cannot modify rules or handle disputes

### 3.5 Resident/Guest (All House Types)

- **Access Level**: Personal profile and house view

**Common Capabilities (All Houses):**

- Log daily activities (chores, work, meetings, etc.)
- View personal statistics and progress
- View house information and contacts
- Update personal information

**Traditional House-Specific:**

- Track phase requirements and advancement
- Submit disputes on flagged activities
- Request phase advancement

**Oxford House-Specific:**

- Participate in all house votes (equal voting rights)
- View complete financial transparency (all house expenses)
- Nominate and run for officer positions
- Propose new house rules or changes
- Vote on new member applications (~80% approval required)
- Access business meeting minutes and records

---

## 4. Accountability Systems

### 4.1 Traditional Houses: Phase-Based Progression System

**Overview:**

The phase system provides structured progression through recovery, with increasing privileges and decreasing oversight as residents demonstrate consistent compliance. **This system applies only to traditional operator-managed houses, not Oxford Houses.**

### 4.2 Phase Configuration (Traditional Houses)

Each house can customize up to 5 phases with the following parameters:

**Default Phases:**

1. **Orientation** (Week 1-2)
2. **Contract** (Week 3-8)
3. **Commitment** (Week 9-16)
4. **Responsibility** (Week 17-24)
5. **Independence** (Week 25+)

**Per-Phase Requirements:**

- Minimum weekly meeting attendance (e.g., 3-7 meetings)
- Minimum work/school hours (e.g., 20-40 hours)
- Daily chore completion (required/not required)
- Sponsor meeting frequency (e.g., 1-7 times per week)
- Medication compliance (if applicable)
- Curfew and check-in requirements
- Drug testing frequency

### 4.3 Phase Advancement Rules (Traditional Houses)

- **Automatic Advancement**: Based on time and compliance threshold
- **Manual Override**: Administrators can advance or hold residents
- **Grace Period**: Built-in buffer for occasional non-compliance
- **Demotion Rules**: Repeated violations can result in phase regression

### 4.4 Oxford Houses: Peer Accountability System

**Overview:**

Oxford Houses do not use a phase system. Instead, accountability is maintained through democratic governance, peer support, and the three charter conditions. **All residents have equal status and voting rights.**

**Key Accountability Mechanisms:**

1. **Zero Tolerance Policy**

   - Immediate expulsion for alcohol or drug use (no warnings or second chances)
   - House vote required for expulsion (usually simple majority)
   - No phase regression or advancement system needed

2. **Financial Accountability**

   - Equal Expense Share (EES) must be paid on time
   - Financial records are transparent to all residents
   - Treasurer tracks and reports all house finances weekly
   - Late payments addressed at business meetings

3. **Democratic Decision-Making**

   - All residents participate in weekly mandatory business meetings
   - One person, one vote on all house matters
   - ~80% approval required for new member acceptance
   - Majority vote for most operational decisions

4. **Peer Support & Mutual Help**

   - Strong encouragement to attend 12-step or mutual support meetings
   - Residents hold each other accountable
   - No professional oversight or case management
   - Peer-to-peer mentoring and support

5. **Officer Accountability**
   - Officers elected for ~6 month terms
   - Term limits prevent power consolidation
   - Officers must fulfill assigned duties or can be removed by house vote
   - Financial audits by Comptroller ensure integrity

**RATS Tracking for Oxford Houses:**

- Meeting attendance (encouraged but not required for phase advancement)
- Work hours (for financial stability, not program requirements)
- EES payment status and history
- Business meeting attendance
- Officer term expiration tracking
- House vote records and decisions
- Charter compliance monitoring

---

## 5. Daily Activity Tracking

### 5.1 Meeting Attendance

**Purpose**: Track 12-step or recovery group participation

**Features:**

- Integration with meeting database (300,000+ meetings nationwide)
- GPS verification for meeting locations
- Manual entry with meeting details (name, type, location)
- Time and date validation
- Meeting type categorization (AA, NA, CA, SMART Recovery, etc.)
- Weekly meeting goal tracking
- Historical attendance records

**Traditional House - Administrator Controls:**

- Review flagged meetings (unusual times/locations)
- Dispute false reports
- Set minimum meeting requirements per phase
- Generate attendance reports

**Oxford House - Peer Monitoring:**

- Meeting attendance strongly encouraged but not mandatory for "phase" (no phases)
- Residents can view each other's meeting participation (transparency)
- No formal disputes; addressed at weekly business meetings if concerns arise
- Used as indicator of recovery engagement, not compliance requirement

### 5.2 Work/School/Volunteer Hours

**Purpose**: Ensure residents maintain productive daily structure and financial stability

**Features:**

- Multiple job tracking (residents can have 2+ jobs)
- Hourly entry with job/activity name
- Daily, weekly, and monthly hour totals
- Work type categorization (employment, school, volunteer)
- Goal vs. actual hour visualization
- Overtime tracking
- Historical work records

**Traditional House - Administrator Controls:**

- Set minimum hour requirements per phase
- Flag suspicious patterns (e.g., excessive hours)
- Track progress toward phase advancement

**Oxford House - Financial Stability Focus:**

- Work tracked to ensure residents can pay Equal Expense Share (EES)
- No minimum hours required, but employment expected for EES payment
- Unemployment addressed at business meetings
- House may provide grace period for job search (voted on democratically)

### 5.3 Chore Completion

**Purpose**: Maintain house cleanliness and shared responsibility

**Features:**

- Weekly rotating chore assignments
- Photo verification option (future feature)
- Daily completion checkbox
- Chore description and instructions
- Swap/trade functionality (with approval)
- Late completion penalties

**Traditional House - Administrator Controls:**

- Create custom chore list per house
- Assign chores manually or auto-rotate weekly
- Review incomplete chores
- Send reminders for pending chores
- Track habitual non-compliance

**Oxford House - Democratic Assignment:**

- Chore list created and assigned by house vote or officer assignment
- Residents can propose chore assignments at business meetings
- Incomplete chores addressed by house (peer accountability)
- Persistent chore failures can be grounds for expulsion (voted by house)
- System tracks completion for transparency at meetings

**Default Chores:**

- Kitchen cleaning
- Bathroom cleaning
- Living room maintenance
- Trash/recycling
- Yard work
- Common area organization

### 5.4 Sponsor/Support Person Meetings

**Purpose**: Maintain accountability partnership

**Features:**

- Primary sponsor/supporter assignment
- Multiple supporter contacts
- Weekly meeting tracking
- Current step tracking (12-step programs)
- Contact information management
- Meeting frequency goals

**Traditional House - Administrator Controls:**

- Verify sponsor relationships
- Set minimum meeting frequency
- Track sponsor engagement
- Flag missing sponsor information

**Oxford House - Peer Accountability:**

- Sponsor meetings encouraged through peer support
- No mandatory frequency requirements
- Tracked for personal accountability
- May be discussed at business meetings if resident appears to struggle

### 5.5 Medication Compliance

**Purpose**: Ensure prescribed medication adherence

**Features:**

- Daily medication checkbox
- Medication schedule tracking
- MAT (Medication-Assisted Treatment) support
- Prescription information storage
- Missed dose tracking

**Traditional House - Administrator Controls:**

- Configure medication requirements
- Monitor compliance patterns
- HIPAA-compliant data handling
- Generate medication reports

**Oxford House - Personal Responsibility:**

- Medication tracking available as personal tool
- No house-level monitoring or enforcement
- HIPAA-compliant and private
- Residents responsible for own medication compliance

---

## 6. Dispute & Verification System

### 6.1 Traditional House: Activity Disputes

**Purpose**: Provide fair resolution when activities are questioned

**Workflow:**

1. **Administrator flags activity** as disputed with reason
2. **Resident receives notification** of dispute
3. **Resident can challenge** the dispute with explanation
4. **Administrator reviews challenge** and makes final decision
5. **Activity marked** as approved/denied
6. **Stats updated** automatically based on resolution

**Dispute Categories:**

- Meeting attendance verification issues
- Work hour discrepancies
- Chore completion disputes
- Timing/location inconsistencies

**Features:**

- Documented dispute history
- Multi-party challenge system
- Evidence attachment capability (future feature)
- Appeal process
- Automated stat adjustments

### 6.2 Oxford House: Peer Resolution

**Purpose**: Democratic resolution of accountability concerns

**Workflow:**

1. **Any resident can raise concern** about another resident's activities
2. **Issue discussed at weekly business meeting** with all residents present
3. **Resident in question can respond** and provide explanation
4. **House votes** on resolution (if needed)
5. **Outcome recorded** in meeting minutes

**Concern Categories:**

- Suspected dishonesty about activities
- Failure to meet house responsibilities
- Financial issues (unpaid EES)
- Behavior that threatens house stability
- Suspected substance use (leads to immediate vote for expulsion)

**Features:**

- Business meeting agenda tracking
- Vote recording and history
- Meeting minutes documentation
- No admin override (democratic process is final)
- Focus on house stability and charter compliance, not micromanagement

### 6.3 Compliance Scoring

**Purpose**: Objective measurement of resident accountability

**Traditional House - Health Score Components:**

- Meeting attendance percentage
- Work hour completion rate
- Chore completion rate
- Sponsor meeting compliance
- Medication adherence
- Overall weekly compliance score
- Phase requirement progress

**Oxford House - Engagement Score Components:**

- Meeting attendance (optional participation tracking)
- Work hours (financial stability indicator)
- Chore completion rate
- Business meeting attendance (mandatory)
- EES payment status (critical)
- Overall house contribution score

**Visual Indicators (Both Models):**

- Color-coded health/engagement status (green/yellow/red)
- Weekly progress charts
- Trend analysis over time
- **Traditional only**: Phase requirement progress bars
- **Oxford only**: Financial standing indicator, officer term timeline

---

## 7. House Management Features

### 7.1 House Configuration

**Common Settings (Both Models):**

- House name, address, and contact information
- Maximum capacity and current occupancy
- Gender-specific or co-ed
- Rent structure (weekly/monthly/both)
- Security deposit and fees
- Amenities (WiFi, parking, etc.)
- House rules and policies
- Chore rotation schedule

**Traditional House Additional Settings:**

- Phase system configuration
- Administrator assignments
- Dispute resolution policies
- Phase advancement rules

**Oxford House Additional Settings:**

- Equal Expense Share (EES) amount
- Oxford House charter number
- Officer election schedule (term expiration dates)
- Business meeting day/time (mandatory weekly)
- New member voting threshold (typically 80%)
- House voting rules and procedures

### 7.2 Room Management

**Common Features (Both Models):**

- Room assignments with bed tracking
- Move-in/move-out dates
- Room type (shared/private)
- Occupancy status
- Maintenance tracking (future feature)

**Traditional Houses:**

- Rent per room/bed (variable pricing)

**Oxford Houses:**

- Equal Expense Share tracking (same for all residents regardless of room)
- Bed availability for new member votes

### 7.3 Traditional House: Resident Onboarding

**Process:**

1. **Invitation System**: Send email/SMS invites
2. **Application Review**: Administrator reviews applications
3. **Profile Creation**: Collect necessary information
4. **Phase Assignment**: Place in appropriate phase
5. **Orientation**: Digital house handbook and rules
6. **Welcome Package**: Access codes, contacts, schedules

**Required Information:**

- Personal details (name, DOB, phone, email)
- Emergency contacts
- Sobriety date
- Program preference (AA, NA, etc.)
- Current step
- Sponsor information
- Employment/school status
- Medical requirements (if applicable)

### 7.4 Oxford House: New Member Acceptance Process

**Process:**

1. **Interview Stage**: Prospective member meets with current residents (in-person typically)
2. **Application Creation**: President or designated officer creates profile in system
3. **Profile Review**: All residents review applicant information
4. **House Vote**: Residents vote on acceptance (~80% approval required)
5. **Vote Tracking**: System records vote outcome and individual votes
6. **If Accepted**: Welcome package, EES payment setup, orientation to charter
7. **Equal Status**: New member immediately has full voting rights

**Required Information:**

- Personal details (name, DOB, phone, email)
- Emergency contacts
- Sobriety date and length
- Sobriety commitment confirmation
- Employment/income verification (ability to pay EES)
- References from recovery program
- Understanding of three charter conditions

**RATS Features:**

- Vote scheduling and notification to all residents
- Anonymous or open voting (house preference)
- Vote history and decision records
- Automatic status update upon acceptance
- EES billing setup upon move-in

### 7.5 Oxford House: Officer Elections

**Election Process:**

1. **Nomination Period**: Residents nominate themselves or others
2. **Candidate Acceptance**: Nominees confirm willingness to serve
3. **Election Vote**: Democratic vote by all residents
4. **Term Tracking**: System tracks ~6 month terms and sends expiration reminders
5. **Term Limits**: System prevents indefinite power consolidation
6. **Transition**: Outgoing officer trains incoming officer

**RATS Features:**

- Election scheduling and notifications
- Term expiration alerts (30/15/7 days before)
- Officer role assignments and permissions
- Election history tracking
- Automatic permission adjustments based on current role

### 7.6 Oxford House: Business Meetings

**Meeting Management:**

- **Mandatory Weekly Meetings**: Scheduled same day/time each week
- **Attendance Tracking**: System tracks who attends (affects engagement score)
- **Agenda Builder**: Officers and residents can add agenda items
- **Financial Review**: Treasurer presents financial report (rent, utilities, EES collection)
- **Vote Recording**: System records all votes and outcomes
- **Meeting Minutes**: Secretary records minutes accessible to all residents
- **Action Items**: Track follow-up tasks from meetings

**RATS Features:**

- Recurring meeting scheduler
- Attendance check-in system
- Digital agenda management
- Vote recording and history
- Meeting minutes repository
- Financial report templates for Treasurer
- Reminder notifications for mandatory attendance

---

## 8. Reporting & Analytics

### 8.1 Traditional House: House-Level Reports

**Available Reports:**

- Weekly compliance summary (all residents)
- Occupancy and vacancy trends
- Financial overview (rent collection)
- Meeting attendance aggregate
- Work hour totals
- Chore completion rates
- Phase distribution
- Dispute frequency and resolution

**Export Formats:**

- PDF for sharing with stakeholders
- CSV for analysis
- Email delivery scheduling

### 8.2 Oxford House: House-Level Reports

**Available Reports:**

- Weekly engagement summary (all residents)
- Equal Expense Share (EES) collection status
- Meeting attendance aggregate
- Work hour totals (financial stability indicator)
- Chore completion rates
- Business meeting attendance
- Officer term timelines
- Vote history and outcomes
- Charter compliance status

**Financial Transparency Reports (All Residents Have Access):**

- Current house balance
- Rent and utility payment history
- Outstanding EES balances by resident
- Monthly expense breakdown
- Budget vs. actual spending

**Export Formats:**

- PDF for sharing at business meetings or with Oxford House network
- CSV for analysis
- Treasurer can generate for weekly business meetings

### 8.3 Traditional House: Resident-Level Reports

**Available Reports:**

- Individual compliance history
- Phase progression timeline
- Activity logs (detailed)
- Meeting attendance history
- Work hour breakdown
- Goal achievement tracking
- Violation and dispute history

### 8.4 Oxford House: Resident-Level Reports

**Available Reports:**

- Individual engagement history
- Activity logs (personal tracking)
- Meeting attendance history
- Work hour breakdown
- EES payment history
- Business meeting attendance record
- Voting participation history
- Officer service history

**Peer Transparency:**

- Residents can view each other's basic engagement metrics (with house permission)
- EES payment status visible to Treasurer and potentially all residents
- Business meeting attendance visible to all

### 8.5 Multi-House Dashboard (Super Admin)

**Features:**

- Cross-house performance comparison (Traditional vs. Oxford models)
- Organization-wide occupancy rates
- Financial summaries across properties
- Compliance/engagement trends and patterns
- Administrator/officer performance metrics
- System usage statistics
- Model comparison analytics (Traditional vs. Oxford outcomes)

---

## 9. Communication Features

### 9.1 Push Notifications

**Traditional House Triggers:**

- Chore assignments and reminders
- Incomplete daily tasks
- Phase advancement
- Dispute notifications
- House announcements from administrator
- Payment reminders
- Meeting reminders

**Oxford House Triggers:**

- Business meeting reminders (mandatory weekly)
- EES payment due reminders
- Officer term expiration alerts
- New house vote scheduled
- Business meeting agenda published
- Chore assignments
- Officer election announcements
- Charter violation concerns raised

### 9.2 Direct Messaging (Future Feature)

**Traditional Houses:**

- Private messages between admins and residents
- House-wide announcements from administrator
- Group messaging for residents
- Read receipts
- Message history

**Oxford Houses:**

- Peer-to-peer messaging between residents
- House-wide announcements (any resident can post, subject to house rules)
- Officer-specific channels (President, Treasurer, Secretary, Comptroller)
- Read receipts
- Democratic moderation (house can vote to restrict messaging privileges)

### 9.3 House Bulletin Board (Future Feature)

**Traditional Houses:**

- Administrator posts house updates and events
- Share recovery resources
- Meeting schedules
- Local job opportunities
- Community events

**Oxford Houses:**

- Any resident can post (democratic participation)
- Business meeting agendas and minutes
- Financial reports from Treasurer
- Officer announcements
- House votes and results
- Recovery resources and mutual support
- Meeting schedules
- Local job opportunities
- Oxford House network events

---

## 10. Payment & Billing Integration

### 10.1 Traditional House: Current Features

- Rent amount tracking (weekly/monthly, tiered by room/bed)
- Payment history log
- Outstanding balance tracking
- Deposit and fee recording
- Individual rent amounts per resident

### 10.2 Oxford House: Equal Expense Share (EES) Features

**Current Features:**

- Equal Expense Share (EES) amount (same for all residents)
- Weekly or monthly EES collection tracking
- Payment history per resident
- Outstanding EES balance tracking
- House expense tracking (rent, utilities, phone, internet, cable, food staples)
- Financial transparency reports for all residents
- Treasurer collection workflow
- Comptroller audit capabilities

**EES Calculation Tools:**

- Total house expenses ÷ number of residents = EES per person
- Automatic recalculation when residents move in/out
- Prorated EES for partial weeks/months
- Budget planning for expected expenses

### 10.3 Future Payment Features

**High-Value Additions (Both Models):**

- **Stripe Integration**: Direct online payments
- **Automatic Billing**: Recurring payment setup
- **Payment Reminders**: Automated overdue notices
- **Receipt Generation**: Digital rent/EES receipts
- **Late Fee Calculation**: Automatic late charge application (Traditional houses)
- **Payment Plans**: Flexible payment arrangements

**Traditional Houses:**

- **Multi-Property Billing**: Consolidated invoicing for operators with multiple houses
- **Tiered rent management**: Different rates per room/bed

**Oxford Houses:**

- **EES Auto-Calculation**: Automatic expense splitting
- **Bill Payment Integration**: Direct payment of utilities from house funds
- **Financial Transparency Dashboard**: Real-time expense tracking for all residents
- **Treasurer Tools**: Simplified collection and reporting workflows
- **Democratic Expense Approval**: Vote on budget changes or major expenses

---

## 11. Future Features - High Value for Operators & Oxford Houses

### 11.1 Oxford House-Specific Features

**Value Proposition**: Enhance democratic governance and self-sufficiency

**Democratic Governance Tools:**

- **Electronic Voting**: Secure, anonymous voting for house decisions
- **Voting History & Analytics**: Track participation and decision patterns
- **Charter Compliance Checker**: Automated alerts for charter violations
- **Officer Performance Tracking**: Evaluate officer effectiveness
- **Meeting Effectiveness Metrics**: Measure meeting attendance and engagement
- **Conflict Resolution Workflow**: Structured process for house disputes

**Financial Management Tools:**

- **Expense Forecasting**: Predict upcoming expenses based on historical data
- **EES Optimization**: Recommend optimal EES based on expenses
- **Bill Splitting Tools**: Automated allocation of variable expenses
- **Financial Health Dashboard**: House-wide financial status visibility
- **Budget vs. Actual Reporting**: Track spending against budget
- **Tax Documentation**: Generate necessary tax records for residents

**Oxford House Network Integration:**

- **Inter-House Directory**: Connect with other Oxford Houses
- **Resource Sharing**: Share best practices and tools between houses
- **Officer Training Library**: Training materials for new officers
- **Charter Templates**: Model bylaws and house rules from successful houses
- **Regional Chapter Coordination**: Connect with state/regional Oxford House chapters

### 11.2 Advanced Verification Systems

**Value Proposition**: Reduce fraud and increase accountability

**Traditional House Features:**

- **Photo Verification**: Selfies at chore completion/meeting attendance
- **GPS Check-ins**: Location-based meeting verification
- **QR Code Scanning**: Scan codes at meetings for proof of attendance
- **Video Check-ins**: Face-to-face verification for remote monitoring
- **Biometric Sign-ins**: Fingerprint/Face ID for house entry tracking

**Oxford House Features:**

- **Business Meeting Check-in**: QR code or location-based attendance verification
- **Peer Verification**: Residents can verify each other's activities
- **Financial Transaction Verification**: Two-factor authentication for large expenses
- **Election Integrity**: Secure, verifiable voting system

### 11.3 Integration Marketplace

**Value Proposition**: Connect with existing tools operators and residents use

**Traditional House Integrations:**

- **QuickBooks**: Automated accounting sync
- **Google Calendar**: Meeting and event sync
- **Background Check Services**: Streamlined applicant screening
- **Drug Testing Services**: Lab result integration
- **Insurance Platforms**: Resident insurance tracking
- **Telehealth Services**: Virtual therapy appointment coordination

**Oxford House Integrations:**

- **Banking APIs**: Direct rent payment to landlord, automatic EES collection
- **Utility Company Integration**: Real-time utility bill tracking and payment
- **Meeting Finder Apps**: Connect to 12-step meeting databases
- **Oxford House World Services**: Official Oxford House network integration
- **Shared Expense Apps**: Split bills and track payments democratically
- **Video Conferencing**: Virtual business meetings for hybrid participation
- **Document Management**: Store charter, bylaws, meeting minutes securely

### 11.4 Advanced Analytics & AI Insights

**Value Proposition**: Predictive analytics for better outcomes

**Traditional House Features:**

- **Risk Scoring**: Identify residents at risk of relapse/departure
- **Pattern Detection**: Flag unusual behavior patterns
- **Predictive Occupancy**: Forecast vacancies and optimize marketing
- **Compliance Prediction**: Identify residents likely to struggle
- **Optimization Recommendations**: Suggest improvements based on data
- **Phase Success Prediction**: Predict phase advancement likelihood
- **Benchmarking**: Compare performance to similar houses nationwide

**Oxford House Features:**

- **House Health Scoring**: Evaluate overall house stability and sustainability
- **Financial Stability Prediction**: Forecast potential financial issues
- **Occupancy Optimization**: Predict optimal house size for stability
- **Election Insights**: Analyze officer effectiveness and election patterns
- **Democratic Engagement**: Track voting participation and identify disengagement
- **Peer Support Network Analysis**: Identify strong and weak peer connections
- **Benchmarking**: Compare to other Oxford Houses in network

### 11.5 Marketing & Admissions Tools

**Value Proposition**: Keep houses full with qualified residents

**Traditional House Features:**

- **Public-Facing Website**: Auto-generated house listing pages
- **Online Applications**: Digital application forms
- **Virtual Tours**: 360° house photography
- **Referral Tracking**: Monitor referral sources (courts, treatment centers)
- **SEO Optimization**: Improve search visibility
- **Review Management**: Collect and display resident testimonials
- **Lead Management**: CRM for potential residents
- **Waitlist Management**: Automated waitlist with priority scoring

**Oxford House Features:**

- **Oxford House Finder**: List house in Oxford House directory
- **Interview Scheduling**: Coordinate candidate interviews with all residents
- **Candidate Tracking**: Track prospective members through interview to vote
- **Vote Coordination**: Schedule and manage acceptance votes
- **Network Referrals**: Connect to other Oxford Houses for resident referrals
- **Vacancy Alerts**: Notify local Oxford House chapter of openings
- **Virtual Interviews**: Video conferencing for remote candidate meetings

### 11.6 Staff Management Tools

**Value Proposition**: Manage house staff efficiently (Traditional Houses Only)

**Features:**

- **Staff Scheduling**: Shift planning for managers/monitors
- **Time Tracking**: Staff clock-in/clock-out
- **Task Assignment**: Delegate specific responsibilities
- **Performance Reviews**: Track staff effectiveness
- **Training Modules**: Onboarding and ongoing education
- **Credential Tracking**: Certifications and licenses

**Note**: Not applicable to Oxford Houses (no professional staff)

### 11.7 Incident & Safety Management

**Value Proposition**: Protect residents and reduce liability

**Traditional House Features:**

- **Incident Reporting**: Standardized incident documentation by staff
- **Safety Inspections**: Digital inspection checklists
- **Maintenance Requests**: Track repairs and maintenance
- **Fire Drill Tracking**: Safety compliance documentation
- **Emergency Contacts**: Quick access to emergency information
- **Visitor Logs**: Track non-resident visitors
- **Relapse Response Protocol**: Standardized intervention procedures

**Oxford House Features:**

- **Peer Incident Reporting**: Any resident can report concerns
- **Safety Inspections**: Democratic assignment of inspection duties
- **Maintenance Coordination**: Residents coordinate repairs (house expense)
- **Emergency Contacts**: Shared contact list for all residents
- **Relapse Protocol**: Immediate house vote for expulsion (charter requirement)
- **Conflict Documentation**: Record house conflicts and resolutions
- **Charter Violation Tracking**: Document violations of three core conditions

### 11.8 Alumni Network & Aftercare

**Value Proposition**: Improve long-term outcomes and referrals

**Traditional House Features:**

- **Alumni Directory**: Stay connected with former residents
- **Mentorship Program**: Alumni mentor current residents
- **Event Management**: Alumni gatherings and fundraisers
- **Success Stories**: Document and share recovery journeys
- **Continuing Education**: Recovery resources post-graduation
- **Employment Network**: Job opportunities for alumni

**Oxford House Features:**

- **Former Resident Network**: Connect with people who have moved out
- **Ongoing Oxford House Connection**: Alumni can maintain ties to house
- **Inter-House Networking**: Connect with broader Oxford House community
- **Success Stories**: Document recovery journeys and house longevity
- **Peer Mentorship**: Former residents mentor new members
- **Oxford House Events**: Regional and national Oxford House gatherings

### 11.9 Certification & Accreditation Support

**Value Proposition**: Achieve and maintain industry certifications

**Traditional House Features:**

- **NARR Compliance**: National Alliance for Recovery Residences standards
- **State Licensing**: Track state-specific requirements
- **Inspection Preparation**: Automated compliance reports
- **Policy Management**: Digital policy documentation
- **Training Documentation**: Staff training records
- **Quality Assurance**: Ongoing compliance monitoring

**Oxford House Features:**

- **Oxford House Charter Compliance**: Ensure adherence to three core conditions
- **Oxford House World Services Certification**: Track official Oxford House status
- **State Chapter Requirements**: Meet state-specific Oxford House standards
- **Charter Audit Tools**: Self-assess charter compliance
- **Democratic Process Documentation**: Record votes and decisions for audits
- **Financial Transparency Reports**: Demonstrate self-supporting status

### 11.10 Multi-Language Support

**Value Proposition**: Serve diverse populations (Both Models)

**Features:**

- Spanish, French, Portuguese translations
- Cultural-specific recovery resources
- Bilingual messaging
- Localized meeting databases
- **Oxford-specific**: Multi-language business meeting support
- **Oxford-specific**: Multi-language charter and bylaws

### 11.11 Telehealth Integration

**Value Proposition**: Improve access to care

**Traditional House Features:**

- Schedule virtual therapy sessions
- Track therapy attendance as compliance requirement
- Integrate with insurance
- Medication management with prescribers
- Group therapy support

**Oxford House Features:**

- Optional personal telehealth tracking
- No compliance requirements (personal responsibility)
- Privacy-focused (HIPAA compliant)
- Can share resources with house if desired

---

## 12. Mobile App Features (Current)

### 12.1 iOS & Android Native Apps

**Built With**: React Native for cross-platform consistency

**Core Features (Both Models):**

- Offline capability for activity logging
- Push notifications
- Camera integration (photo verification - future)
- GPS/location services (meeting verification)
- Biometric authentication (Face ID/Touch ID)
- Dark mode support
- Accessibility compliance

**Traditional House Specific:**

- Phase tracking dashboard
- Administrator communication
- Dispute management interface
- Compliance scoring visualization

**Oxford House Specific:**

- Business meeting scheduler and attendance
- Voting interface (secure, anonymous if desired)
- EES payment tracking and reminders
- Officer dashboard (for current officers)
- Meeting minutes viewer
- Financial transparency dashboard
- Democratic decision-making tools

### 12.2 User Experience

**Design Principles (Both Models):**

- Simple, intuitive navigation
- Clear visual hierarchy
- Minimal clicks to complete tasks
- Real-time sync across devices
- Consistent branding
- Recovery-positive language and design

**Oxford House UX Considerations:**

- Emphasis on equality (no hierarchical design)
- Financial transparency front-and-center
- Democratic participation encouraged through UI
- Community-focused vs. individual-focused

---

## 13. Web Dashboard Features (Current)

### 13.1 Traditional House: Administrator Dashboard

**Built With**: Angular for robust web application

**Core Features:**

- Multi-house management
- Advanced reporting and analytics
- Bulk operations (mass messaging, assignments)
- Financial management
- User management (residents and staff)
- System configuration
- Phase system configuration
- Data export capabilities

### 13.2 Oxford House: Officer Dashboard

**Built With**: Angular for robust web application

**Core Features:**

- Single-house view (no multi-house management by officers)
- Financial transparency reporting
- Business meeting management
- Vote scheduling and results
- Meeting minutes management
- EES collection tracking (Treasurer)
- Financial auditing tools (Comptroller)
- Member directory and communication
- Charter compliance monitoring
- Officer transition tools

**Key Differences from Traditional:**

- No override capabilities (democratic decisions are final)
- All data visible to all residents (transparency)
- Focus on facilitation vs. management
- Term limits enforced by system

### 13.3 Responsive Design (Both Models)

- Desktop-optimized for administrators/officers
- Tablet-friendly for on-site management
- Mobile web access for quick checks
- **Oxford-specific**: Optimized for business meeting projection (financial reports, vote results)

---

## 14. Security & Compliance

### 14.1 Data Security

**Implemented:**

- Firebase Authentication with JWT tokens
- Role-based access control (RBAC)
- Encrypted data transmission (HTTPS)
- Secure password requirements
- Session timeout policies
- Audit logging for all administrative actions

**Future Enhancements:**

- Two-factor authentication (2FA)
- Single sign-on (SSO) for enterprises
- Data encryption at rest
- Regular security audits
- Penetration testing

### 14.2 Privacy & Compliance

**Current (Both Models):**

- HIPAA-aware data handling (PHI segregation)
- User data export capability
- Account deletion functionality
- Privacy policy and terms of service
- Consent management

**Oxford House Privacy Considerations:**

- Financial transparency is required by model (EES, house expenses)
- Democratic decisions are recorded and visible to all house members
- Personal health information remains private (medication tracking is optional)
- Voting can be anonymous or open (house preference)

**Future:**

- Full HIPAA certification
- GDPR compliance for international users
- State-specific compliance (e.g., California CCPA)
- BAA (Business Associate Agreement) for healthcare partners

### 14.3 Data Backup & Recovery

- Automated daily backups (Firebase)
- Point-in-time recovery capability
- Geographic redundancy
- Disaster recovery plan
- 99.9% uptime SLA

---

## 15. Pricing Model (Recommended)

### 15.1 Traditional House Subscription Tiers

**Starter Plan** - $49/month per house

- Up to 8 residents
- Basic activity tracking
- Phase system
- Email support
- Standard reporting

**Professional Plan** - $99/month per house

- Up to 20 residents
- Advanced analytics
- Priority support
- Custom phase configuration
- Dispute management
- Advanced reporting

**Enterprise Plan** - Custom pricing

- Unlimited residents
- Multiple properties (volume discount)
- Dedicated account manager
- Custom integrations
- White-label options (future)
- API access

**Per-Resident Add-On** - $5/month

- For houses exceeding tier limits

### 15.2 Oxford House Subscription Tiers

**Oxford House Plan** - $39/month per house

- Up to 12 residents (typical Oxford House size)
- Democratic governance tools
- Business meeting management
- EES tracking and financial transparency
- Officer election management
- Vote recording and management
- Charter compliance monitoring
- Email support

**Oxford House Plus** - $69/month per house

- Up to 20 residents
- All standard features plus:
- Advanced financial forecasting
- Inter-house networking tools
- Enhanced reporting for chapters
- Priority support
- Integration with Oxford House World Services

**Oxford House Network** - Custom pricing

- For regional/state Oxford House chapters
- Multiple houses under one account
- Network-wide analytics
- Chapter coordination tools
- Bulk training and onboarding
- Dedicated support

**Key Pricing Considerations for Oxford Houses:**

- Lower pricing than traditional houses (self-managed, less overhead)
- Can be paid from house funds (part of Equal Expense Share budget)
- Decided democratically by house vote
- No per-resident fees (aligns with equal status principle)

### 15.3 Revenue Opportunities

**Both Models:**

- Payment processing fees (2.9% + $0.30 per transaction)
- Premium integrations (marketplace revenue share)
- Training and onboarding services
- Custom development projects

**Traditional Houses:**

- Certification prep courses
- Staff training modules
- White-label options

**Oxford Houses:**

- Oxford House chapter partnerships
- Network coordination services
- Officer training programs
- Charter compliance consulting

---

## 16. Technical Architecture

### 16.1 Technology Stack

**Frontend:**

- React Native (iOS/Android mobile apps)
- Angular (web dashboard)
- TypeScript for type safety
- Redux for state management

**Backend:**

- Firebase Firestore (real-time database)
- Firebase Authentication
- Firebase Cloud Functions (serverless)
- Firebase Cloud Storage (file storage)
- Firebase Cloud Messaging (push notifications)

**Integrations:**

- Sentry (error tracking and monitoring)
- Google Maps API (meeting location services)
- Stripe API (payment processing - future)

### 16.2 Scalability

- Serverless architecture for automatic scaling
- NoSQL database optimized for read-heavy workloads
- CDN for global content delivery
- Horizontal scaling capability
- Support for both house models with shared infrastructure

### 16.3 Development Best Practices

- TypeScript for type safety
- ESLint for code quality
- Automated testing (unit, integration)
- CI/CD pipeline for deployments
- Git version control
- Code review process
- Model-agnostic architecture (supports both Traditional and Oxford House models)

---

## 17. Competitive Advantages

### 17.1 Market Differentiators

1. **Purpose-Built for Recovery**: Designed specifically for sober living, not adapted from general property management
2. **Dual Model Support**: Only platform supporting both Traditional operator-managed AND Oxford House self-governed models
3. **Phase-Based System**: Structured progression unique to recovery housing (Traditional)
4. **Democratic Governance Tools**: First platform built specifically for Oxford House model
5. **Comprehensive Tracking**: All-in-one solution vs. fragmented tools
6. **Mobile-First**: Native apps for iOS and Android
7. **Dispute & Resolution Systems**: Fair resolution for Traditional houses, democratic resolution for Oxford Houses
8. **Affordable**: Competitive pricing vs. enterprise solutions, special pricing for Oxford Houses
9. **Quick Setup**: Operational in hours, not weeks
10. **Recovery-Focused UX**: Language and design support recovery principles
11. **Financial Transparency**: Built-in EES tracking and transparency for Oxford Houses
12. **Community Network**: Connect Oxford Houses to broader network

### 17.2 Target Customer Profile

**Primary - Traditional Houses:**

- Sober living house owners with 1-5 properties
- 10-50 residents under management
- Seeking to professionalize operations
- Growth-oriented operators

**Primary - Oxford Houses:**

- Established Oxford Houses seeking technology solutions
- New Oxford Houses forming and needing operational tools
- Oxford House chapters coordinating multiple houses
- Individual Oxford House officers managing day-to-day operations

**Secondary:**

- Treatment center operators adding sober living
- Recovery residence networks
- Faith-based recovery programs
- Halfway house operators
- Oxford House World Services partnerships

---

## 18. Success Metrics

### 18.1 Traditional House Operator KPIs

- Resident compliance rate (target: >85%)
- Average length of stay (track improvement)
- Occupancy rate (target: >90%)
- Dispute resolution time (target: <48 hours)
- Administrator time savings (hours per week)
- Payment collection rate (target: >95%)
- Phase advancement success rate

### 18.2 Oxford House KPIs

- House stability rate (measure turnover and longevity)
- Average length of stay (Oxford Houses typically longer than traditional)
- Occupancy rate (target: >90%)
- EES collection rate (target: >95%)
- Business meeting attendance rate (target: 100% for mandatory meetings)
- Democratic participation rate (voting participation)
- Officer retention and transition success
- Financial self-sufficiency rate (100% required by charter)
- Charter compliance rate (target: 100%)

### 18.3 Traditional House Resident KPIs

- Phase advancement rate
- Meeting attendance trend
- Work hour consistency
- Clean drug test rate (if tracked)
- Successful program completion rate
- Recidivism reduction (6-month, 1-year)

### 18.4 Oxford House Resident KPIs

- Average length of stay (track improvement)
- Meeting attendance (encouraged but not required)
- Work hour consistency (financial stability)
- EES payment timeliness
- Business meeting attendance (required)
- Peer support engagement
- Successful sustained sobriety (indefinite stay model)
- Recidivism reduction (6-month, 1-year, 5-year)

### 18.5 Platform KPIs

- Monthly active users (MAU)
- Daily active users (DAU)
- User retention rate (month 1, 3, 6, 12)
- Net Promoter Score (NPS) - by house model
- Customer acquisition cost (CAC) - by house model
- Lifetime value (LTV) - by house model
- Churn rate - by house model
- **Model-specific**: Traditional vs. Oxford House adoption rates
- **Model-specific**: Cross-pollination (Traditional houses adopting Oxford practices or vice versa)

---

## 19. Implementation Roadmap

### 19.1 Current Status (v1.0 - Traditional Houses)

✅ **Completed Features:**

- User authentication and authorization
- Multi-house management
- Phase system configuration
- Daily activity tracking (meetings, work, chores, sponsor, medication)
- Compliance scoring and health indicators
- Dispute creation and resolution
- Activity filtering and search
- Push notifications
- Basic reporting
- iOS and Android apps
- Web dashboard
- Firebase backend infrastructure

### 19.2 Short-Term Roadmap (Q1-Q2 2025)

**Priority 1 - Traditional Houses:**

- ✅ Android build optimization (COMPLETED)
- ✅ Keyboard input fixes for Android (COMPLETED)
- Payment integration (Stripe)
- Photo verification for activities
- Enhanced reporting exports
- Two-factor authentication
- Mobile app performance optimization

**Priority 1 - Oxford House Model (NEW):**

- **House model selector** (Traditional vs. Oxford) during onboarding
- **Officer role system** (President, Treasurer, Secretary, Comptroller)
- **Officer election management** with term tracking
- **Business meeting scheduler** with mandatory attendance tracking
- **Vote recording system** (anonymous and open voting options)
- **Equal Expense Share (EES) tracking** and financial transparency
- **Meeting minutes repository**
- **Democratic decision workflow** (proposals, votes, outcomes)
- **Charter compliance monitoring**
- **New member acceptance workflow** (interview, vote, approval)

**Priority 2:**

- Direct messaging system (both models)
- House bulletin board (both models, different permissions)
- Advanced analytics dashboard (model-specific metrics)
- Alumni tracking module (both models)
- Meeting database expansion (both models)
- **Oxford-specific**: Financial forecasting tools
- **Oxford-specific**: Inter-house networking

### 19.3 Long-Term Roadmap (2025-2026)

**Q3-Q4 2025:**

- Marketplace integrations (QuickBooks, banking APIs)
- Marketing tools (website builder, SEO) - Traditional houses
- Oxford House Finder integration
- Staff management module (Traditional only)
- Incident reporting system (both models)
- AI-powered analytics (model-specific)

**2026:**

- White-label platform option (Traditional houses)
- Enterprise features (SSO, advanced permissions)
- Telehealth integration (both models)
- Certification support tools (both models, different standards)
- International expansion (multi-language)
- Mobile offline mode enhancements
- **Oxford-specific**: Oxford House World Services official partnership
- **Oxford-specific**: Regional chapter coordination tools
- **Oxford-specific**: Officer training and certification programs

---

## 20. Support & Training

### 20.1 Traditional House Onboarding Process

**New House Setup (1-2 hours):**

1. Account creation and house profile
2. Select "Traditional" house model
3. Phase configuration and customization
4. Chore list creation
5. Initial resident invitations
6. Administrator training (video tutorials)
7. First week support and check-ins

### 20.2 Oxford House Onboarding Process

**New House Setup (1-2 hours):**

1. Account creation and house profile
2. Select "Oxford House" model
3. Oxford House charter number entry (if applicable)
4. Equal Expense Share (EES) configuration
5. Officer assignments (President, Treasurer, Secretary, Comptroller)
6. Business meeting schedule setup
7. Officer training (video tutorials focused on democratic governance)
8. First week support and check-ins
9. Connection to local Oxford House chapter (optional)

### 20.3 Ongoing Support

**Included Support (Both Models):**

- Email support (24-48 hour response)
- Knowledge base and FAQ
- Video tutorial library
- Monthly webinars
- Community forum (future)

**Model-Specific Support:**

- **Traditional**: Administrator best practices, phase optimization, compliance tips
- **Oxford**: Officer training, democratic governance best practices, charter compliance guidance

**Premium Support Options:**

- Phone support
- Dedicated account manager
- On-site training
- Custom configuration assistance
- Priority feature requests
- **Oxford-specific**: Chapter-wide training and coordination

### 20.4 Training Resources

**Traditional Houses:**

- Administrator quick start guide
- Resident user guide
- Phase system best practices
- Dispute resolution training
- Compliance tips and tricks
- Recovery industry insights

**Oxford Houses:**

- Officer quick start guides (role-specific)
- Democratic governance best practices
- Business meeting facilitation guide
- Financial management for Treasurers
- Charter compliance handbook
- Election and transition procedures
- Resident equality and peer support guide

---

## 21. Summary & Vision

### 21.1 Mission Statement

To empower sober living operators and self-governed recovery communities with technology that improves accountability, facilitates democratic governance, reduces administrative burden, and ultimately supports long-term recovery success for all residents—whether in traditional managed houses or peer-led Oxford Houses.

### 21.2 Vision for Growth

RATS aims to become the industry-standard platform for sober living management, serving thousands of houses and tens of thousands of residents nationwide across both traditional operator-managed and Oxford House self-governed models. By combining ease of use with powerful features for both governance styles, we enable house operators to focus on what matters most: supporting residents in their recovery journey, while empowering Oxford House residents to run stable, self-sufficient recovery communities.

### 21.3 Impact Goals (Traditional Houses)

- **10,000+ residents** actively using the platform by end of 2025
- **500+ traditional houses** under management by end of 2025
- **25% improvement** in resident compliance rates (industry average)
- **50% reduction** in administrative time for operators
- **90% user satisfaction** rating (NPS >50)

### 21.4 Impact Goals (Oxford Houses)

- **5,000+ Oxford House residents** using the platform by end of 2025
- **250+ Oxford Houses** operating on the platform by end of 2025
- **15% improvement** in house stability and longevity
- **95%+ EES collection rate** (critical for self-sufficiency)
- **100% charter compliance rate** (maintaining Oxford House standards)
- **50% reduction** in officer administrative time through automation
- **90% user satisfaction** rating from officers and residents (NPS >50)
- **Partnership with Oxford House World Services** or regional chapters

### 21.5 Combined Platform Goals

- **15,000+ total residents** across both models
- **750+ total houses** (Traditional + Oxford)
- **Demonstrate model flexibility**: Prove technology can support diverse recovery governance models
- **Industry leadership**: Become THE platform for comprehensive sober living management
- **Recovery outcomes**: Measurable improvements in long-term sobriety across both models

---

## Appendix A: Technical Specifications

### Database Schema Overview

**Core Collections (Both Models):**

- **users**: All platform users (admins, officers, residents)
- **houses**: House profiles with model type (Traditional or Oxford)
- **guests**: Resident/member profiles
- **activities**: Daily activity tracking
- **reports**: Generated reports and analytics
- **meetings**: Recovery meeting database
- **notifications**: Push notification queue

**Traditional House Collections:**

- **admins**: Administrator profiles and permissions
- **disputes**: Activity dispute records and resolution
- **phases**: Phase configuration and requirements

**Oxford House Collections:**

- **officers**: Officer roles and term tracking
- **business_meetings**: Business meeting records and agendas
- **votes**: Vote records and outcomes
- **meeting_minutes**: Secretary-recorded minutes
- **ees_transactions**: Equal Expense Share tracking
- **financial_records**: House financial transparency data
- **elections**: Officer election history

**Security Rules:**

- Role-based with field-level permissions
- Model-specific access controls
- Financial transparency rules for Oxford Houses (all residents can view)
- Democratic voting privacy options (anonymous or open)

**Indexes:**

- Optimized for common queries (house-resident lookups, date ranges)
- Officer term expiration queries
- Vote participation tracking
- EES payment status

**Data Retention:**

- Configurable (default: indefinite with export capability)
- Meeting minutes archived indefinitely for Oxford Houses
- Vote records maintained for transparency and auditing

### API Endpoints (Cloud Functions)

**Shared Endpoints:**

- `userAuthentication`: Custom authentication handlers
- `sendNotifications`: Push notification distribution
- `weeklyReports`: Automated report generation
- `dataExport`: Bulk data export for backups

**Traditional House Endpoints:**

- `updateDisputes`: Batch dispute resolution processing
- `phaseAdvancement`: Automatic phase progression
- `complianceCalculation`: Calculate health scores

**Oxford House Endpoints:**

- `recordVote`: Process and record house votes
- `officerTermReminder`: Alert for expiring officer terms
- `calculateEES`: Compute Equal Expense Share per resident
- `businessMeetingReminder`: Send mandatory meeting reminders
- `financialTransparency`: Generate real-time financial reports
- `charterCompliance`: Monitor three charter conditions

### Platform Requirements

**Mobile:**

- iOS 13.0 or higher
- Android 10.0 (API 29) or higher
- 50MB free storage minimum

**Web:**

- Modern browsers (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- 1024x768 minimum resolution

---

## Appendix B: Glossary of Terms

**General Terms:**

- **Activity**: Any trackable resident action (meeting, work, chore, etc.)
- **Guest/Resident**: Person living in sober living house
- **House**: Sober living property managed in the system
- **Super Admin**: Top-level system administrator
- **MAT**: Medication-Assisted Treatment
- **NARR**: National Alliance for Recovery Residences
- **12-Step**: Recovery program based on 12 steps (AA, NA, etc.)

**Traditional House Terms:**

- **Compliance Rate**: Percentage of required activities completed
- **Dispute**: Challenge to a reported activity's validity by administrator
- **Health Score**: Aggregate compliance percentage
- **Phase**: Stage of recovery program with specific requirements
- **Administrator/Manager**: Professional staff overseeing house operations

**Oxford House Terms:**

- **Oxford House**: Self-governed, democratically-run recovery residence with no professional staff
- **Charter**: Official Oxford House charter defining three core conditions
- **Equal Expense Share (EES)**: Amount each resident pays (equally) to cover house expenses
- **Business Meeting**: Mandatory weekly meeting for all residents to conduct house business
- **Officer**: Elected resident serving in leadership role (President, Treasurer, Secretary, Comptroller)
- **Term Limit**: Typical ~6 month duration for officer roles to prevent "bossism"
- **House Vote**: Democratic decision-making process (one person, one vote)
- **80% Vote**: Supermajority requirement for accepting new members (typically)
- **Engagement Score**: Measure of resident participation in house operations
- **Charter Compliance**: Adherence to three core conditions (democratic, self-supporting, immediate expulsion for substance use)
- **Comptroller**: Officer who audits financial records and ensures Treasurer accountability
- **Trusted Servant**: Philosophy that officers serve the house, not rule it
- **Self-Supporting**: House covers all expenses through resident EES payments
- **Oxford House World Services**: National organization supporting Oxford House network

---

**Document Version**: 2.0 (Oxford House Model Added)  
**Last Updated**: November 29, 2025  
**Next Review**: March 2026

---

_This document is confidential and proprietary. Distribution outside of authorized personnel requires written approval._

---
*Last reviewed: 2026-05-24 | Audience: developer | Type: reference*
