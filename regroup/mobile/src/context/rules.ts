export interface DynamicRuleParams {
  guestUserId?: string;
  userId?: string;
  /** The caller's tier in the house, from myHouseTiers ('owner', 'manager', 'peerLeader'). */
  houseTier?: string;
  [key: string]: any;
}

export interface Rule {
  static: Action[];
  dynamic?: {
    [action: string]: (params: DynamicRuleParams) => boolean;
  };
}

export interface AuthRules {
  guest: Rule;
  admin: Rule;
  superAdmin: Rule;
}

export type Action =
  | 'house:view'
  | 'guest:view'
  | 'meeting:create'
  | 'house:edit'
  | 'house:partial-edit'
  | 'house:create'
  | 'house:full-edit'
  // Opening House Settings (the HouseSummary gear): owners and managers.
  | 'house:settings'
  | 'guest:edit'
  | 'guest:delete';

const rules: AuthRules = {
  guest: {
    static: ['house:view', 'guest:view', 'meeting:create'],
    dynamic: {
      'guest:edit': ({ guestUserId, userId }: DynamicRuleParams): boolean => {
        if (!guestUserId || !userId) {
          return false;
        }
        return guestUserId === userId;
      },
      'guest:delete': ({ guestUserId, userId }: DynamicRuleParams): boolean => {
        if (!guestUserId || !userId) {
          return false;
        }
        return guestUserId === userId;
      },
    },
  },
  admin: {
    static: [
      'house:view',
      'house:partial-edit',
      'guest:view',
      'meeting:create',
    ],
    dynamic: {
      // Managers and peer leaders share the admin claim; only a manager gets
      // House Settings (owner decision 2026-11-27, #308). No tier yet: no.
      'house:settings': (params: DynamicRuleParams | null): boolean =>
        params?.houseTier === 'manager',
    },
  },
  superAdmin: {
    static: [
      'house:view',
      'house:partial-edit',
      'house:full-edit',
      'house:settings',
      'house:create',
      'meeting:create',
      'guest:delete',
    ],
  },
};

export default rules;
