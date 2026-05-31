/**
 * GuestComplianceDot
 *
 * Wraps ComplianceDot with the data-fetching logic for a single guest.
 * Calls useComplianceCheck internally so the parent (GuestList) does not
 * need to manage week-summary queries for every row.
 *
 * Usage:
 *   <GuestComplianceDot guest={guest} house={house} weekStart={weekStart} />
 */

import React from 'react';
import { useComplianceCheck } from '../../state/queries/activityQueries';
import ComplianceDot from './ComplianceDot';
import { Guest } from '../../entities/Guest';
import { House } from '../../entities/House';

interface GuestComplianceDotProps {
  guest: Guest;
  house: House;
  weekStart: string;
  testID?: string;
}

const GuestComplianceDot: React.FC<GuestComplianceDotProps> = ({
  guest,
  house,
  weekStart,
  testID,
}) => {
  const { status } = useComplianceCheck(guest, weekStart, house);
  return <ComplianceDot status={status} testID={testID} />;
};

export default GuestComplianceDot;
