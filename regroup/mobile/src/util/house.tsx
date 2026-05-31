import { Dispute, DisputeChallenge } from '../entities/Dispute';
import { cloneDeep, each, filter, find, map, some, sortBy } from 'lodash';
import { House, HouseActionItems, HouseHealth } from '../entities/House';
import { Admins, Guests } from '../types';
import { getOverallPercentage } from './guest';
import { getTodaysDate } from './display';
import { Phases, PhaseConfiguration } from '../entities/Phase';
import { Rooms } from '../entities/Room';
import { SelectedBed } from '../screens/Beds/hooks/useBedsManagement';
import { Chores } from '../entities/Chore';

/**
 * Gets the disputes associated with the guest
 * The role is that guest's role in the dispute (victim or disputer)
 * @param guestId
 * @param disputes
 * @param role
 */
export const getGuestDisputes = (
  guestId: string,
  disputes: { [key: string]: Dispute },
  role: 'victim' | 'disputer',
): Dispute[] => {
  const stat = role + 'Id';
  return map(disputes, dispute => {
    if ((dispute as Record<string, any>)[stat] === guestId) {
      return dispute;
    }
  }).filter((dispute): dispute is Dispute => dispute !== undefined);
};

export const updateGuestChores = (chores: Chores, guests: Guests) => {
  each(chores, chore => {});
};

export const countGuestsWithBeds = (rooms: Rooms) => {
  let count = 0;
  each(rooms, room => {
    each(room.beds, bed => {
      if (bed.guestId) {
        count++;
      }
    });
  });
  return count;
};
export const extractGuestEmails = (
  selectedHouse: House,
  guestEmails: string[],
) => {
  const houseWithGuestEmails = cloneDeep(selectedHouse);
  houseWithGuestEmails.pendingGuestInvites =
    houseWithGuestEmails.pendingGuestInvites
      ? houseWithGuestEmails.pendingGuestInvites
      : [];
  each(guestEmails, (email, index) => {
    if (email !== 'deleted' && houseWithGuestEmails.pendingGuestInvites) {
      houseWithGuestEmails.pendingGuestInvites.push(email.trim().toLowerCase());
    }
    guestEmails[index] = email.trim();
  });
  houseWithGuestEmails.pendingGuestInvites = Array.from(
    new Set(houseWithGuestEmails.pendingGuestInvites || []),
  );
  return houseWithGuestEmails;
};

export const getDisputesForActivity = (
  activityId: string,
  disputes: { [key: string]: Dispute },
): Dispute[] => {
  const activityDisputes = [];
  activityDisputes.push(
    ...filter(disputes, dispute => dispute.activityId === activityId),
  );
  return activityDisputes;
};

export const findGuestBed = (guestId: string, rooms: Rooms): SelectedBed | null => {
  let guestBed: SelectedBed | null = null;
  each(rooms, room => {
    each(room.beds, bed => {
      if (bed.guestId === guestId) {
        guestBed = { roomId: room.id, bed };
      }
    });
  });
  return guestBed;
};

export const getChallengesFromDisputes = (disputes: Dispute[]) => {
  const challenges: DisputeChallenge[] = [];
  if (!disputes) return challenges;
  disputes.forEach(dispute => {
    if (dispute.challenges && dispute.challenges.length) {
      challenges.push(...dispute.challenges);
    }
  });
  return challenges;
};

export const getInitialPhase = (house: House) =>
  find(house.phases, phase => phase.order === 1);

export const filterHouseAdmins = (house: House, admins: Admins): Admins => {
  const houseAdmins: Admins = {};
  each(admins, admin => {
    if (house.adminIds.includes(admin.id)) {
      houseAdmins[admin.id] = admin;
    }
  });
  return houseAdmins;
};

export const houseAdminsAreCached = (house: House, admins: Admins): boolean => {
  if (house && house.id) {
    return house.adminIds.every(adminId => {
      let alreadyHaveAdmin = false;
      each(admins, admin => {
        if (admin.id === adminId) {
          alreadyHaveAdmin = true;
        }
      });
      return alreadyHaveAdmin;
    });
  }
  return false;
};

export const houseGuestsAreCached = (
  house: House,
  guests: Guests,
  userGuestId: string,
): boolean => {
  // check to see if already cached guests have a guest with the same houseId as the house id
  // and the guest is not the current user
  return some(guests, guest => {
    return guest.houseId === house.id && guest.id !== userGuestId;
  });
};

export const getHousePercentage = (house: House, guests: Guests) => {
  let runningTotal = 0;
  let count = 0;
  each(guests, guest => {
    count++;
    runningTotal += getOverallPercentage(guest, house, getTodaysDate());
  });
  return count > 0 ? Math.ceil(runningTotal / count) : 0;
};

export const getHouseActionItems = (house: House) => {
  const actionItems: { [key: string]: any } = {};
  HouseActionItems.forEach(actionItem => {
    actionItems[actionItem] = house[actionItem];
  });
  return actionItems;
};

export const countOpenItems = (item: any) => {
  let count = 0;
  each(item, value => {
    if (!value.resolution && !value.reply) {
      count++;
    }
  });
  return count;
};

export const countHouseActionItems = (house: House) => {
  const actionItems = getHouseActionItems(house);
  let count = 0;
  each(actionItems, actionItem => {
    if (actionItem) {
      count += countOpenItems(actionItem);
    }
  });
  return count;
};

export const countOpenIssues = (house: House) => {
  let count = 0;
  each(house.issues, issue => {
    if (!issue.resolution && !issue.invalid) {
      count++;
    }
  });
  return count;
};

export const countBeds = (rooms: Rooms) => {
  const beds = { max: 0, used: 0 };
  each(rooms, room => {
    each(room.beds, bed => {
      if (bed.guestId) {
        beds.used++;
      }
      beds.max++;
    });
  });
  return beds;
};

export const sortPhases = (phases: Phases) => {
  return sortBy(phases, phase => {
    return phase.order;
  });
};

export const filterPhases = (_phases: Phases, guestIds: string[]) => {
  const phases: Record<string, any> = {};
  Object.keys(_phases).forEach(phaseName => {
    if (!guestIds.includes(phaseName)) {
      phases[phaseName] = _phases[phaseName];
    }
  });
  return phases;
};

export const countOpenDisputes = (house: House) => {
  let count = 0;
  each(house.disputes, (dispute: Dispute) => {
    // Handle both old (active) and new (status) field names
    const isOpen =
      dispute.status === 'pending' || (dispute as any).active === true;
    if (isOpen) {
      count++;
    }
  });
  return count;
};

export const getFirstPhase = (phases: Phases): PhaseConfiguration | null => {
  let firstPhase: PhaseConfiguration | null = null;
  each(phases, phase => {
    if (!firstPhase || phase.order < firstPhase.order) {
      firstPhase = phase;
    }
  });
  return firstPhase;
};

export const calculateHouseHealth = (health: HouseHealth) => {
  let totalHealth = 0,
    count = 0;
  each(health, weekScore => {
    totalHealth += weekScore;
    count++;
  });
  return count > 0 ? Math.ceil(totalHealth / count) : 0;
};
