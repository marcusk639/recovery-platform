export default `
<div class="legal-doc">
<h1>Privacy Policy</h1>
<p><strong>Regroup (RATS Recovery App)</strong>
Last updated: May 21, 2026</p>
<hr>
<h2>1. Introduction</h2>
<p>Regroup (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the RATS Recovery App (&quot;App&quot;), a mobile application and web platform designed to help sober living house operators and residents track accountability, manage house operations, and support long-term recovery.</p>
<p>This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our App. Please read this policy carefully. If you disagree with its terms, please discontinue use.</p>
<hr>
<h2>2. Information We Collect</h2>
<h3>2.1 Account and Identity Information</h3>
<p>When you register, we collect:</p>
<ul>
<li>Name, email address, and phone number</li>
<li>Account type (operator/admin or resident/guest)</li>
<li>Authentication credentials (managed securely via Firebase Authentication)</li>
</ul>
<h3>2.2 House and Residency Information</h3>
<p>Operators provide:</p>
<ul>
<li>House name, address, and capacity</li>
<li>Rent and program fee amounts</li>
<li>Phase/level requirements for residents</li>
</ul>
<p>Residents provide:</p>
<ul>
<li>Sobriety date and program type (AA, NA, SMART Recovery, etc.)</li>
<li>Current living situation and references (during the application process)</li>
</ul>
<h3>2.3 Accountability Tracking Data</h3>
<p>The core function of the App requires collecting:</p>
<ul>
<li>Meeting attendance logs (date, type, count)</li>
<li>Chore completion records</li>
<li>Work hours logged</li>
<li>Medication adherence (yes/no per day — no medication names or dosages)</li>
<li>Sponsor/supporter contact records</li>
</ul>
<h3>2.4 Payment Information</h3>
<p>We use <strong>Stripe</strong> to process rent payments. We do not store full payment card numbers. Stripe stores and processes card data under PCI-DSS compliance. We retain:</p>
<ul>
<li>Payment status and amount</li>
<li>Payment timestamps and descriptions</li>
<li>Stripe customer and subscription IDs (internal reference only)</li>
</ul>
<h3>2.5 Communications</h3>
<ul>
<li>House chat messages between residents and operators</li>
<li>Direct messages between users</li>
<li>In-app notifications (payment due, compliance alerts, application status)</li>
</ul>
<h3>2.6 Application Data</h3>
<p>Prospective residents submit:</p>
<ul>
<li>Name, email, phone</li>
<li>Sobriety date and program type</li>
<li>Current situation description</li>
<li>References</li>
</ul>
<h3>2.7 Usage and Technical Data</h3>
<ul>
<li>Device identifiers (for push notifications via Firebase Cloud Messaging)</li>
<li>App crash reports and error logs (via Sentry — no personally identifiable content in stack traces)</li>
<li>App usage analytics to improve the product</li>
</ul>
<hr>
<h2>3. How We Use Your Information</h2>
<p>We use the information we collect to:</p>
<ul>
<li><strong>Operate the App</strong> — display accountability dashboards, payment history, and house information</li>
<li><strong>Process payments</strong> — collect and record rent payments via Stripe</li>
<li><strong>Send notifications</strong> — push notifications for payment due dates, compliance flags, and house updates</li>
<li><strong>Support Oxford House governance</strong> — votes, officer rosters, EES records (only for Oxford-enabled houses)</li>
<li><strong>Improve the App</strong> — analyze usage patterns to fix bugs and build new features</li>
<li><strong>Fulfill legal obligations</strong> — respond to lawful requests and comply with applicable regulations</li>
</ul>
<p>We do not sell your personal information to third parties.</p>
<hr>
<h2>4. Information Sharing</h2>
<p>We share information only in the following circumstances:</p>
<h3>4.1 Within Your House</h3>
<p>Resident accountability data (meeting counts, chore completion, work hours) is visible to operators and other authorized admins of your house. Residents can view their own records.</p>
<h3>4.2 Service Providers</h3>
<p>We use the following third-party processors under data processing agreements:</p>
<table>
<thead>
<tr>
<th>Service</th>
<th>Purpose</th>
<th>Privacy Policy</th>
</tr>
</thead>
<tbody><tr>
<td>Google Firebase (Firestore, Auth, Cloud Messaging)</td>
<td>Database, authentication, push notifications</td>
<td><a href="https://firebase.google.com/support/privacy">firebase.google.com/support/privacy</a></td>
</tr>
<tr>
<td>Stripe</td>
<td>Payment processing</td>
<td><a href="https://stripe.com/privacy">stripe.com/privacy</a></td>
</tr>
<tr>
<td>Sentry</td>
<td>Error monitoring</td>
<td><a href="https://sentry.io/privacy">sentry.io/privacy</a></td>
</tr>
</tbody></table>
<h3>4.3 Legal Requirements</h3>
<p>We may disclose information if required by law, court order, or to protect the safety of our users or the public.</p>
<h3>4.4 Business Transfers</h3>
<p>In the event of a merger, acquisition, or sale of assets, your data may be transferred to the successor entity under confidentiality obligations.</p>
<hr>
<h2>5. Health-Adjacent Data</h2>
<p>The App collects accountability data related to recovery programs (sobriety date, meeting attendance, medication adherence). This data is <strong>not</strong> protected health information (PHI) as defined by HIPAA — it does not include diagnoses, treatment plans, or clinical data. However, we treat it with heightened care:</p>
<ul>
<li>Access is restricted to authorized house operators</li>
<li>Data is not shared with third parties for advertising</li>
<li>Residents retain access to their own records</li>
</ul>
<p><strong>Note:</strong> If you believe your use case may involve clinical or diagnostic data, consult with a legal advisor about HIPAA applicability before deploying this App.</p>
<hr>
<h2>6. Data Retention</h2>
<table>
<thead>
<tr>
<th>Data Type</th>
<th>Retention</th>
</tr>
</thead>
<tbody><tr>
<td>Active account data</td>
<td>Until account deletion</td>
</tr>
<tr>
<td>Accountability logs</td>
<td>Until account deletion or house departure</td>
</tr>
<tr>
<td>Payment records</td>
<td>7 years (IRS/accounting requirements)</td>
</tr>
<tr>
<td>Application submissions</td>
<td>90 days after decision</td>
</tr>
<tr>
<td>Chat messages</td>
<td>Until account deletion</td>
</tr>
<tr>
<td>Error logs (Sentry)</td>
<td>90 days</td>
</tr>
</tbody></table>
<hr>
<h2>7. Your Rights</h2>
<p>Depending on your location, you may have the right to:</p>
<ul>
<li><strong>Access</strong> — request a copy of your personal data</li>
<li><strong>Correction</strong> — request correction of inaccurate data</li>
<li><strong>Deletion</strong> — request deletion of your account and personal data</li>
<li><strong>Portability</strong> — receive your data in a machine-readable format</li>
<li><strong>Opt-out of push notifications</strong> — via device settings at any time</li>
</ul>
<p>To exercise any of these rights, contact us at <strong><a href="mailto:admin@regroup-app.com">admin@regroup-app.com</a></strong>.</p>
<p>Residents should direct requests to their house operator first, as operators control house-level data.</p>
<hr>
<h2>8. Children</h2>
<p>The App is intended for adults aged 18 and over. We do not knowingly collect personal information from anyone under 18. If you believe a minor has provided us with personal information, contact us immediately and we will delete it.</p>
<hr>
<h2>9. Security</h2>
<p>We implement technical and organizational measures to protect your information:</p>
<ul>
<li>All data in transit is encrypted via HTTPS/TLS</li>
<li>Firestore security rules enforce role-based access at the database level</li>
<li>Payment data is handled exclusively by Stripe (PCI-DSS Level 1)</li>
<li>Firebase Authentication manages all password hashing and session security</li>
<li>Access to production systems is restricted to authorized personnel</li>
</ul>
<p>No system is completely secure. If you discover a security vulnerability, please report it to <strong><a href="mailto:admin@regroup-app.com">admin@regroup-app.com</a></strong> rather than disclosing it publicly.</p>
<hr>
<h2>10. Push Notifications</h2>
<p>We use Firebase Cloud Messaging to send push notifications about payment due dates, compliance reminders, and house updates. You can opt out at any time through your device settings (iOS: Settings → Notifications → Regroup; Android: Settings → Apps → Regroup → Notifications).</p>
<hr>
<h2>11. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. We will notify users of material changes via in-app notification or email at least 30 days before the change takes effect. Your continued use of the App after the effective date constitutes acceptance.</p>
<hr>
<h2>12. Contact</h2>
<p>For privacy questions or to exercise your rights:</p>
<p><strong>Regroup / RATS Recovery App</strong>
Email: <a href="mailto:admin@regroup-app.com">admin@regroup-app.com</a></p>
<hr>
<p><em>This document is a working draft for legal review. It does not constitute legal advice. Have a qualified attorney review this policy before publishing it on the App Store or making it available to users.</em></p>

</div>
`;
