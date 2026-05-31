import { useMemo } from 'react';
import { useOfficers } from '../state/queries/oxfordQueries';
import { useData } from '../context/DataContext';

export type TreasuryRole =
  | 'comptroller'
  | 'treasurer'
  | 'president'
  | 'admin'
  | 'member';

export function useTreasuryRole(houseId: string): {
  role: TreasuryRole;
  canCreate: boolean;
  canApprove: boolean;
  canViewDrafts: boolean;
  isLoading: boolean;
} {
  const { currentUser, currentHouse } = useData();
  const { data: officers, isLoading } = useOfficers(houseId, !!houseId);
  const uid = currentUser?.uid ?? '';

  return useMemo(() => {
    if (isLoading || !officers) {
      return {
        role: 'member' as const,
        canCreate: false,
        canApprove: false,
        canViewDrafts: false,
        isLoading,
      };
    }

    // Check if user is a house admin (from adminIds/superAdminIds on house doc)
    const isHouseAdmin =
      currentHouse?.adminIds?.includes(uid) ||
      currentHouse?.superAdminIds?.includes(uid) ||
      false;

    const active = officers.filter((o: any) => o.isActive);
    const myRoles = active
      .filter((o: any) => o.userId === uid)
      .map((o: any) => o.role);

    const isComptroller = myRoles.includes('comptroller');
    const isTreasurer = myRoles.includes('treasurer');
    const isPresident = myRoles.includes('president');

    const hasComptroller = active.some((o: any) => o.role === 'comptroller');
    const hasApprover = active.some(
      (o: any) => o.role === 'treasurer' || o.role === 'president',
    );

    let role: TreasuryRole = 'member';
    if (isComptroller) role = 'comptroller';
    else if (isTreasurer) role = 'treasurer';
    else if (isPresident) role = 'president';
    else if (isHouseAdmin) role = 'admin';

    // Spec fallback: if no officer assigned for a role, any admin can fill it
    const canCreate =
      isComptroller ||
      (!hasComptroller && (isTreasurer || isPresident || isHouseAdmin));
    const canApprove =
      isTreasurer ||
      isPresident ||
      (!hasApprover && (isComptroller || isHouseAdmin));
    const canViewDrafts =
      isComptroller || isTreasurer || isPresident || isHouseAdmin;

    return { role, canCreate, canApprove, canViewDrafts, isLoading };
  }, [officers, uid, isLoading, currentHouse]);
}
