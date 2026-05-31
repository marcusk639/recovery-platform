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

const Can = (props: {
  role: Role;
  action: Action;
  data?: any;
  yes: () => any;
  no: () => any;
}) => {
  if (check(rules, props.role, props.action, props.data)) {
    return props.yes();
  } else {
    return props.no();
  }
};

Can.defaultProps = {
  yes: () => null,
  no: () => null,
  data: null,
};

export default Can;
