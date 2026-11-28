import rules, { AuthRules, Action, Rule } from '../../context/rules';
import { Role } from '../../entities/Roles';

const check = (rules: AuthRules, role: Role, action: Action, data: any) => {
  const permissions: Rule | undefined = rules[role as keyof AuthRules];

  if (!permissions) {
    return false;
  }

  const staticPermissions = permissions.static;

  if (staticPermissions && staticPermissions.includes(action)) {
    return true;
  }

  const dynamicPermissions = permissions.dynamic;

  if (dynamicPermissions) {
    const permissionCondition = dynamicPermissions[action];
    if (!permissionCondition) {
      return false;
    }

    return permissionCondition(data);
  }

  return false;
};

/**
 * The same check as `<Can>`, for code that decides without rendering (a list
 * of settings entries, say).
 */
export const can = (role: Role, action: Action, data: any = null): boolean =>
  check(rules, role, action, data);

// Defaults in the parameter list: React 19 ignores defaultProps on function
// components, which left `<Can>` without `yes` or `no` throwing.
const Can = ({
  role,
  action,
  data = null,
  yes = () => null,
  no = () => null,
}: {
  role: Role;
  action: Action;
  data?: any;
  yes?: () => any;
  no?: () => any;
}) => {
  if (can(role, action, data)) {
    return yes();
  } else {
    return no();
  }
};

export default Can;
