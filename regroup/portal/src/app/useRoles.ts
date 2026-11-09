import { useSelector } from 'react-redux';
import { getRolesFromClaims } from '@mobile/util/roles';

export function useRoles(): Record<string, string> {
  const claims = useSelector((state: any) => state.user.token?.claims);
  return claims ? getRolesFromClaims(claims) : {};
}
