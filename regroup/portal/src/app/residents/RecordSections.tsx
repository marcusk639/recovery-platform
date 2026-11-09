import type { ReactNode } from 'react';
import ComplianceBreakdown from '@mobile/components/compliance-indicator/ComplianceBreakdown';
import { useCurrentWeek } from '@mobile/hooks/activity/useCurrentWeek';
import { Routes } from '@mobile/navigation/types';
import { useComplianceCheck, useWeekSummary } from '@mobile/state/queries/activityQueries';
import { getTodaysDate } from '@mobile/util/display';
import { getOverallPercentage } from '@mobile/util/guest';
import { HouseLink } from '../HouseLink';
import { healthLabel } from '../houses/healthLabel';
import { canScore, formatDay } from '../houses/summary';
import { useOpenDisputes } from '../houses/useHouseSummary';
import { card, danger, link, muted } from '../ui';
import { residentPath, SECTIONS, sectionPath } from '../urls';
import { balanceLabel } from './rows';

export function Section({ testId, title, children }: { testId: string; title: string; children: ReactNode }) {
  return (
    <section data-testid={testId} style={card}>
      <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>{title}</h2>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: '1px solid #eef1f4' }}>
      <span style={muted}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

const onFile = (value: unknown) => (value ? 'On file' : 'None');
const orNotRecorded = (value: unknown) => (value ? String(value) : <span style={muted}>Not recorded</span>);

// No Medication link while the phone's medication summary crashes (#194).
const STAT_LINKS = [
  { label: 'Meetings', route: Routes.MeetingSummary, suffix: 'meetings' },
  { label: 'Work', route: Routes.WorkSummary, suffix: 'work' },
  { label: 'Chores', route: Routes.ChoreSummary, suffix: 'chores' },
  { label: 'Primary supporter', route: Routes.SupporterSummary, suffix: 'supporter' },
];

export function WeekSection({ guest, house }: { guest: any; house: any }) {
  const { startDate } = useCurrentWeek(house.timezone);
  const scorable = canScore(guest, house);
  const summary = useWeekSummary(guest.id, startDate, scorable);
  const compliance = useComplianceCheck(guest, startDate, house, scorable);
  const params = { houseId: house.id, guestId: guest.id };
  let body: ReactNode;
  if (!scorable) body = <p style={muted}>No phase rules</p>;
  else if (summary.status === 'error') body = <p style={danger}>Couldn't load this week.</p>;
  else if (summary.status !== 'success') body = <p aria-label="Loading" style={muted}>…</p>;
  else {
    const percent = getOverallPercentage(guest, house, getTodaysDate(), undefined, summary.data?.stats);
    const rules = house.phases?.[String(guest.phase)]?.rules;
    body = (
      <>
        <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{`${percent}% ${healthLabel(percent)}`}</p>
        {!summary.data && <p style={muted}>No activity logged this week.</p>}
        {compliance.data && rules && <ComplianceBreakdown result={compliance.data} phaseRules={rules} />}
      </>
    );
  }
  return (
    <Section testId="record-week" title="This week">
      {body}
      <p style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '8px 0 0' }}>
        {STAT_LINKS.map((stat) => (
          <HouseLink key={stat.label} href={`${residentPath(house.id, guest.id)}/${stat.suffix}`} route={stat.route} params={params} style={link}>
            {stat.label}
          </HouseLink>
        ))}
      </p>
    </Section>
  );
}

export function PaymentsSection({ guest, houseId }: { guest: any; houseId: string }) {
  return (
    <Section testId="record-payments" title="Payments">
      <Field label="Rent owed">{balanceLabel(guest.rentOwed)}</Field>
      <Field label="Chore fees">{balanceLabel(guest.choreFees)}</Field>
      <Field label="Autopay">{guest.autoPayEnabled ? 'On' : 'Off'}</Field>
      <p style={{ margin: '8px 0 0' }}>
        <HouseLink href={`${residentPath(houseId, guest.id)}/payments`} route={Routes.PaymentHistory} params={{ houseId, guestId: guest.id }} style={link}>
          Payment history
        </HouseLink>
      </p>
    </Section>
  );
}

// Legal details are for the full view only (owner decision, 2026-11-09).
export function RecoverySection({ guest, fullView }: { guest: any; fullView: boolean }) {
  return (
    <Section testId="record-recovery" title="Recovery and legal">
      <Field label="Sobriety date">{formatDay(guest.sobrietyDate) ?? <span style={muted}>Not recorded</span>}</Field>
      <Field label="Drug of choice">{orNotRecorded(guest.drugOfChoice)}</Field>
      {fullView && (
        <>
          <Field label="Legal status">{orNotRecorded(guest.legalStatus)}</Field>
          <Field label="Probation officer">{onFile(guest.probationOfficer)}</Field>
          <Field label="Referring center">{onFile(guest.referringCenterName)}</Field>
        </>
      )}
    </Section>
  );
}

export function OpenItemsSection(props: { guest: any; houseId: string; onDocuments: (() => void) | null }) {
  const { guest, houseId } = props;
  const disputes = useOpenDisputes(houseId, true);
  const mine = Object.values(disputes.data ?? {}).filter(
    (d: any) => d.guestId === guest.id && (d.status === 'pending' || d.active === true),
  ).length;
  return (
    <Section testId="record-open-items" title="Open items">
      <Field label="Disputes">
        {disputes.status === 'error' ? (
          <span style={danger}>Couldn't load disputes</span>
        ) : disputes.status !== 'success' ? (
          <span aria-label="Loading" style={muted}>…</span>
        ) : (
          <HouseLink href={sectionPath(houseId, 'disputes')} route={SECTIONS.disputes.route} params={{ houseId }} style={link}>
            {`${mine} open dispute${mine === 1 ? '' : 's'}`}
          </HouseLink>
        )}
      </Field>
      <Field label="Emergency contact">{guest.emergencyContactName || guest.emergencyContactPhone ? 'On file' : 'Missing'}</Field>
      {props.onDocuments && (
        <p style={{ margin: '8px 0 0' }}>
          <button type="button" onClick={props.onDocuments} style={{ font: 'inherit', cursor: 'pointer' }}>
            Documents
          </button>
        </p>
      )}
    </Section>
  );
}
