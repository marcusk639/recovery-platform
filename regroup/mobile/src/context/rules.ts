export interface DynamicRuleParams {
  guestUserId?: string;
  userId?: string;
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
  },
  superAdmin: {
    static: [
      'house:view',
      'house:partial-edit',
      'house:full-edit',
      'house:create',
      'meeting:create',
      'guest:delete',
    ],
  },
};

export default rules;
