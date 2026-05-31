import { createContext } from 'react';
import { RoleToken } from '../components/auth/auth';

const authContext = createContext<{ token: RoleToken }>({
  token: {
    //@ts-ignore
    claims: {},
    role: {},
  },
});

export const AuthProvider = authContext.Provider;
export const AuthConsumer = authContext.Consumer;
