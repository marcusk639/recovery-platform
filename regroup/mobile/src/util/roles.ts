import { Claims, RoleToken } from '../components/auth/auth';
import { Role } from '../entities/Roles';
import { camelCaseToDisplayForm } from './display';
import { Guest } from '../entities/Guest';
import Admin from '../entities/Admin';

export const fillRoleFromClaim = (
  claims: Claims,
  claim: keyof Claims,
  roles: any,
) => {
  if (claims[claim] && (claims[claim] as string[]).length) {
    (claims[claim] as string[]).forEach(houseId => {
      roles[houseId] = claim;
    });
  }
};

export const getRolesFromClaims = (claims: Claims) => {
  const roles: { [houseId: string]: Role } = {};
  // needs to be executed in order from least privilege to greatest privilege
  fillRoleFromClaim(claims, 'guest', roles);
  fillRoleFromClaim(claims, 'admin', roles);
  fillRoleFromClaim(claims, 'superAdmin', roles);
  return roles;
};

export const isAdmin = (token: RoleToken, houseId: string) =>
  token.role[houseId] === 'admin' || token.role[houseId] === 'superAdmin';

export const displayRole = (
  token: RoleToken,
  houseId: string,
  guest: Guest,
) => {
  if (token.role[houseId] === 'superAdmin') {
    return 'Operator';
  }
  if (guest.isAdmin) {
    return 'Guest Administrator';
  }
  return camelCaseToDisplayForm(token.role[houseId]);
};

export const isSameUser = (member: Guest | Admin, userId: string) =>
  member.userId === userId;
