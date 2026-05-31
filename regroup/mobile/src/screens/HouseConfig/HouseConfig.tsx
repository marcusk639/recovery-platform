import React from 'react';
// Phase 3.3: Removed withRats HOC (translation/theme available globally via useTranslation and ThemeProvider)
import { View } from 'react-native';
import { RatsText } from '../../components/rats-text';
import { User } from '../../entities/User';

import styles from './HouseConfigStyles';
import RatsScrollView from '../../components/rats-scroll-view';
import HouseConfigForm from './HouseConfigForm';
import { useAppSelector } from '../../state/store';

interface Props {}

/**
 * House Config Screen
 *
 * Container for house configuration form.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed unused old Redux imports (userActions, houseActions)
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Updated 1 selector to use state.user (removed 'as any' cast)
 * - HOCs kept for Phase 3 removal
 */
const HouseConfig: React.FC<Props> = props => {
  const user = useAppSelector(state => state.user.user);

  return (
    <RatsScrollView
      keyboardShouldPersistTaps="always"
      resetScrollToCoords={{ x: 0, y: 0 }}
      scrollEnabled
      contentContainerStyle={styles.container}>
      <View style={styles.innerContainer}>
        <View style={styles.headerContainer}>
          <RatsText
            style={styles.header}
            translate={false}
            text="House Configuration"
          />
        </View>
        <HouseConfigForm />
      </View>
    </RatsScrollView>
  );
};

export default HouseConfig;
