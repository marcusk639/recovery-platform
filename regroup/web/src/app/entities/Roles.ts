export type Role = 'admin' | 'superAdmin' | 'guest' | 'supporter' | 'anonymous';

export interface Roles {
  houses: {
    [houseId: string]: Role;
  };
}
