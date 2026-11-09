import type { ReactNode } from 'react';
import { card, cardLabel, cards, cardValue, muted } from '../ui';
import { healthLabel } from './healthLabel';
import { bedsText, CellText, healthText } from './HouseCell';
import { formatCents } from './summary';
import { useHouseSummary } from './useHouseSummary';

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={card}>
      <div style={cardLabel}>{label}</div>
      <div style={cardValue}>{children}</div>
    </div>
  );
}

// One house's numbers, with the same copy as its row in the all-houses table.
export function HouseNumbers({ houseId }: { houseId: string }) {
  const summary = useHouseSummary(houseId);
  const overdue = summary.rentOverdueCents;
  return (
    <div data-testid="house-numbers" style={cards}>
      <Figure label="Health">
        <CellText cell={summary.healthPercent} render={(p) => healthText(p, healthLabel)} />
      </Figure>
      <Figure label="Beds filled">
        <CellText cell={summary.beds} render={bedsText} />
      </Figure>
      {overdue.state !== 'hidden' && (
        <Figure label="Rent overdue">
          <CellText cell={overdue} render={formatCents} />
          {summary.overdueFromDischargedCents > 0 && (
            <div style={{ ...muted, fontSize: 12, fontWeight: 400 }}>
              includes {formatCents(summary.overdueFromDischargedCents)} from discharged residents
            </div>
          )}
        </Figure>
      )}
      <Figure label="Applications waiting">
        <CellText cell={summary.applicationsWaiting} render={String} />
      </Figure>
      <Figure label="Open disputes">
        <CellText cell={summary.openDisputes} render={String} />
      </Figure>
    </div>
  );
}
