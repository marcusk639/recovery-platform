import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useRoleToken } from '../../context/auth';
import { useHouseMoneyAccess } from '../../state/queries/houseTierQueries';
import ScreenHeader from '../screen-header';
import { RatsText } from '../rats-text';
import RatsButton from '../rats-button/rats-button';
import { color, fontSize, normalize } from '../../styles/theme';

/**
 * - `admin`: any house staff (owners, managers, peer leaders: the `superAdmin`
 *   or `admin` claim for the house).
 * - `manager`: owners and managers, not peer leaders, for the money screens
 *   (rent spec §4.7, portal spec §5). An `admin` claim alone can't tell a
 *   manager from a peer leader, so the tier comes from myHouseTiers, the same
 *   source the payments rules' callerRank and the portal use.
 */
export type HouseRank = 'admin' | 'manager';

interface Props {
  houseId: string | null | undefined;
  minRank: HouseRank;
  children: React.ReactNode;
}

export const NoAccessScreen: React.FC = () => {
  const navigation = useNavigation();
  return (
    <View style={styles.screen} testID="no-access-screen">
      <ScreenHeader renderBackButton header="No access" />
      <View style={styles.body}>
        <RatsText translate={false} text="You don't have access to this" style={styles.message} />
        <RatsButton
          testID="no-access-back-button"
          title="Go back"
          onPress={() => navigation.goBack()}
        />
      </View>
    </View>
  );
};

const Checking: React.FC = () => (
  <View style={[styles.screen, styles.centered]} testID="role-check-pending">
    <ActivityIndicator size="large" color={color.main} />
  </View>
);

/**
 * The per-screen role check (P5 Task 20). The rules still decide what can be
 * read and written; this keeps a screen from opening at all for someone who
 * can't use it, however they reached it (a deep link, a stale route, a future
 * entry point). It denies until it knows: no claims yet, or a tier still
 * loading, shows a spinner, never the screen.
 */
const RequireHouseRole: React.FC<Props> = ({ houseId, minRank, children }) => {
  const token = useRoleToken();
  const role = houseId ? token?.role?.[houseId] : undefined;
  const isOwner = role === 'superAdmin';
  const isStaff = isOwner || role === 'admin';
  const needsTier = minRank === 'manager' && isStaff && !isOwner;
  const moneyAccess = useHouseMoneyAccess(houseId ?? '', needsTier);

  if (!token?.claims) return <Checking />;
  if (!isStaff) return <NoAccessScreen />;
  if (needsTier) {
    if (moneyAccess === 'checking') return <Checking />;
    if (moneyAccess === 'no') return <NoAccessScreen />;
  }
  return <>{children}</>;
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.light_grey },
  centered: { justifyContent: 'center', alignItems: 'center' },
  body: { padding: normalize(24), alignItems: 'center' },
  message: {
    fontSize: fontSize.medium,
    color: color.dark_grey,
    marginBottom: normalize(20),
    textAlign: 'center',
  },
});

export default RequireHouseRole;
