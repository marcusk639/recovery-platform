import React, { Component, PropsWithChildren } from 'react';
import '@react-native-firebase/auth';
import { User } from '../../entities/User';
import { connect } from 'react-redux';
import { AuthProvider } from '../../context/auth';
import { House } from '../../entities/House';
import { Houses } from '../../types';
import { Role } from '../../entities/Roles';
import { getRolesFromClaims } from '../../util/roles';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';

interface Props {
  user: User;
  house: House;
  houses: Houses;
  token: TokenWithClaims;
}

export interface Claims {
  // Maps of houseId -> true, matching the custom-claims shape the backend writes
  // (functions: util/claims.ts) and the Firestore rules consume. See P0-1.
  guest: Record<string, boolean>;
  admin: Record<string, boolean>;
  superAdmin: Record<string, boolean>;
  potentialSuperAdmin: boolean;
}

interface TokenWithClaims extends FirebaseAuthTypes.IdTokenResult {
  claims: Claims;
}

export interface RoleToken {
  claims: Claims;
  role: {
    [houseId: string]: Role;
  };
}

class State {
  token: {
    claims: Claims;
    role: {
      [houseId: string]: Role;
    };
  } = {
    claims: {
      guest: {},
      admin: {},
      superAdmin: {},
      potentialSuperAdmin: false,
    },
    role: {},
  };
}

class Auth extends Component<PropsWithChildren<Props>> {
  state = new State();

  checkForUser = async () => {
    if (this.props.user && this.props.user.id && this.props.token) {
      this.setUserRole(this.props.token);
    }
  };

  setUserRole = (user: TokenWithClaims) => {
    const roles = getRolesFromClaims(user.claims);
    this.setState({
      user: {
        claims: user.claims,
        role: roles,
      },
    });
  };

  async componentDidMount() {
    this.checkForUser();
  }

  async componentDidUpdate(prevProps: Props) {
    if (!prevProps.user || prevProps.user.id !== this.props.user.id) {
      this.checkForUser();
    }
  }

  render() {
    const authProviderValue = {
      token: {
        claims: this.props.token && this.props.token.claims,
        role: this.props.token && getRolesFromClaims(this.props.token.claims),
      },
    };
    return (
      <AuthProvider value={authProviderValue}>
        {this.props.children}
      </AuthProvider>
    );
  }
}

function mapStateToProps(state: any) {
  return {
    user: state.user.user,
    houses: state.houses.houses,
    house: state.houses.selectedHouse,
    token: state.user.token,
  };
}

export default connect(mapStateToProps, null)(Auth);
