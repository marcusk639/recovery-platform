/**
 * Where a resident's charging starts, given their account (if any), their guest
 * record and the house's current settings. Pure, so every ordering of the guest-write
 * trigger, the hourly job and a house toggling charging can be tested directly.
 */
import { addDays, localDateString } from '../activities/weekSummaryMath';
import { chargeFromFor } from './chargeRule';
import { maxDate, toLocalDate } from './period';
import { RentAccount, RentFrequency } from './types';

type Data = Record<string, unknown>;

export interface AnchorInput {
  account: Partial<RentAccount> | null;
  guest: Data;
  houseId: string;
  /** The guest doc's server createTime. */
  createdMs: number;
  startDate: string;
  startedAtMs: number;
  timeZone: string;
  frequency: RentFrequency;
  now: Date;
}

export interface Anchor {
  houseJoinedAtMs: number;
  joinedOn: string | null;
  reactivatedOn: string | null;
  chargeFrom: string;
  /** True when the account must be (re)written even if nothing is charged. */
  changed: boolean;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function anchorFor(i: AnchorInput): Anchor {
  const { account, guest, houseId, createdMs, startDate, startedAtMs, timeZone, frequency } = i;
  const today = localDateString(i.now, timeZone);
  const localOf = (ms: number) => localDateString(new Date(ms), timeZone);

  // The guest-write trigger records moves and returns outside the charge transaction,
  // so the hourly job can get here first. A move it hasn't recorded is a join today;
  // a return it hasn't recorded (departed after the last re-activation) starts today.
  // Neither is ever back-charged for the time before.
  const unrecordedMove = !!str(account?.houseId) && account?.houseId !== houseId;
  const away = str(account?.inactiveSince);
  const back = str(account?.reactivatedOn);
  const reactivatedOn = away && !(back && back >= away) ? today : back;

  const finish = (
    a: Omit<Anchor, 'reactivatedOn' | 'changed' | 'chargeFrom'> & { chargeFrom: string },
    changed: boolean,
  ): Anchor => ({
    ...a,
    reactivatedOn,
    chargeFrom: maxDate(a.chargeFrom, reactivatedOn, a.joinedOn),
    changed: changed || reactivatedOn !== back,
  });

  if (unrecordedMove) {
    const houseJoinedAtMs = i.now.getTime();
    return finish(
      {
        houseJoinedAtMs,
        joinedOn: today,
        chargeFrom: chargeFromFor({
          startDate,
          startedAtMs,
          houseJoinedAtMs,
          joinDate: today,
          recordedOn: today,
          importedOn: null,
          frequency,
        }),
      },
      true,
    );
  }

  const chargeFrom = str(account?.chargeFrom);
  const chargedThrough = str(account?.chargedThrough);
  const knownJoin =
    account?.houseId === houseId && typeof account.houseJoinedAtMs === 'number'
      ? account.houseJoinedAtMs
      : createdMs;

  if (account && chargeFrom && account.anchoredTo === startDate) {
    return finish(
      { houseJoinedAtMs: knownJoin, joinedOn: str(account.joinedOn), chargeFrom },
      false,
    );
  }

  // Charging was re-stamped (turned off and on, or a schedule switched in two steps)
  // before this resident's charged days ran out: carry on, never skipping a day.
  if (account && chargeFrom && chargedThrough && addDays(chargedThrough, 1) >= startDate) {
    return finish(
      {
        houseJoinedAtMs: knownJoin,
        joinedOn: str(account.joinedOn),
        chargeFrom: maxDate(chargeFrom, startDate),
      },
      true,
    );
  }

  // Charging came back on after a gap for a resident already charged in this house:
  // resume on the day it came back, prorated, and charge nothing for the time it was
  // off (owner decision 2026-11-09). Starting at the next full period let a short off
  // across a period start skip that whole period. Charges that ended before the
  // resident joined this house don't count, so a first turn-on still follows spec §2.
  // Only chargedHouseId tells: a move keeps chargedThrough from the old house, which can
  // run past the move day.
  const joinedHere = str(account?.joinedOn);
  if (account && chargeFrom && chargedThrough && account.chargedHouseId === houseId) {
    return finish(
      { houseJoinedAtMs: knownJoin, joinedOn: joinedHere, chargeFrom: startDate },
      true,
    );
  }

  // First anchor, or a restart for a resident never charged here: decide afresh.
  const moveIn = guest.moveInDate;
  const parsed = toLocalDate(moveIn, timeZone);
  const unreadable = moveIn !== undefined && moveIn !== null && moveIn !== '' && parsed === null;
  const joinedOn = str(account?.joinedOn) ?? parsed ?? (unreadable ? null : localOf(createdMs));
  // Back after a discharge since charging began: like a move-in on the return day.
  if (reactivatedOn && reactivatedOn >= startDate) {
    return finish({ houseJoinedAtMs: knownJoin, joinedOn, chargeFrom: reactivatedOn }, true);
  }
  return finish(
    {
      houseJoinedAtMs: knownJoin,
      joinedOn,
      chargeFrom: chargeFromFor({
        startDate,
        startedAtMs,
        houseJoinedAtMs: knownJoin,
        joinDate: joinedOn,
        recordedOn: localOf(knownJoin),
        importedOn: toLocalDate(guest.importedAt, timeZone),
        frequency,
      }),
    },
    true,
  );
}
