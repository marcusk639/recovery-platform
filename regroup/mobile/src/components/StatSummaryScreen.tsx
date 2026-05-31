/**
 * StatSummaryScreen Component
 *
 * Reusable component for rendering stat summary screens.
 * Replaces the class-based BaseStatSummary with a composable component.
 */

import React from 'react';
import { Dimensions, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Components
import RatsScrollView from './rats-scroll-view';
import { RatsText } from './rats-text';
import RatsLoadingIndicator from './rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from './screen-header';
import HelpIcon from './help-icon';
import WeekStatSummary from './week-stat-summary';
import RatsBarGraph from './rats-bar-graph';
import { RatsStatCard } from './rats-stat-card';
import RatsButton from './rats-button/rats-button';
import { AuthConsumer } from '../context/auth';
import { isAdmin } from '../util/roles';

// Types
import { Stat } from '../entities/Guest';
import { House } from '../entities/House';
import { User } from '../entities/User';

// Utils & Styles
import { color, fontSize, normalize, ROW } from '../styles/theme';
import { STAT_MAP } from '../util/display';
import { IOS } from '../util/platform';
import { Routes, RootStackParamList } from '../navigation/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

const CONTAINER: ViewStyle = {
  flexGrow: 1,
  alignItems: 'center',
  backgroundColor: color.light_grey,
};

interface StatSummaryScreenProps {
  stat: Stat;
  statSum: number;
  phaseRule: number;
  percentage: number;
  disputes: number;
  daysRemaining: number;
  graphData: Array<{ x: string; y: number }>;
  getBarFillColor: (dataPoint: { y: number }) => string;
  isLoading: boolean;
  house: House | null;
  user: User | null;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  setRef: (ref: any) => void;

  // Customization
  renderStatDetails?: () => JSX.Element;
  renderHelp?: () => void;
  testID?: string;
}

/**
 * BarGraph - Renders the historical stat graph
 */
const BarGraph: React.FC<{
  graphData: Array<{ x: string; y: number }>;
  getBarFillColor: (dataPoint: { y: number }) => string;
  isLoading: boolean;
}> = ({ graphData, getBarFillColor, isLoading }) => {
  return (
    <RatsStatCard
      containerStyle={{ height: IOS ? undefined : normalize(220) }}
      contentContainerStyle={{
        alignItems: 'center',
        justifyContent: 'center',
      }}
      contentTextStyle={{ color: color.green }}
      headerItems={[
        <RatsText
          key="1"
          translate={false}
          text="LAST TWO MONTHS"
          style={{
            fontSize: fontSize.regular_medium,
            color: color.dark_grey,
          }}
        />,
      ]}>
      {!isLoading && graphData.length > 0 ? (
        <RatsBarGraph
          barWidth={normalize(20)}
          height={Dimensions.get('screen').height / 4}
          width={Dimensions.get('window').width}
          data={graphData}
          barStyles={{
            data: { fill: (data: any) => getBarFillColor(data) },
            tickLabels: { fontSize: 5 },
          }}
        />
      ) : (
        <RatsLoadingIndicator />
      )}
    </RatsStatCard>
  );
};

/**
 * WeekDetails - Renders the weekly stats section
 */
const WeekDetails: React.FC<{
  statSum: number;
  phaseRule: number;
  percentage: number;
  disputes: number;
  daysRemaining: number;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}> = ({
  statSum,
  phaseRule,
  percentage,
  disputes,
  daysRemaining,
  navigation,
}) => {
  const routeToDisputes = () => {
    navigation.navigate(Routes.House, {
      screen: Routes.HouseDisputes,
    });
  };

  return (
    <WeekStatSummary
      percentage={percentage}
      header="THIS WEEK"
      rightSideContainer={{ justifyContent: 'flex-start' }}
      rightSideContent={
        <View style={{ flex: 1 }}>
          <View style={{ ...ROW, flex: 1 }}>
            <View
              style={{
                flex: 0.6,
                justifyContent: 'space-between',
                marginRight: normalize(10),
              }}>
              <RatsText text="COMPLETED" style={{ color: color.dark_grey }} />
              <RatsText
                text="DISPUTES"
                style={{ color: disputes ? color.red : color.dark_grey }}
              />
              <RatsText text="DAYS LEFT" style={{ color: color.dark_grey }} />
            </View>
            <View style={{ flex: 0.4, justifyContent: 'space-between' }}>
              <RatsText
                text={`${statSum} of ${phaseRule}`}
                style={{
                  fontSize: fontSize.regular,
                  color: color.black,
                  fontWeight: 'bold' as const,
                }}
              />
              <RatsText
                text={String(disputes)}
                style={{
                  fontSize: fontSize.regular,
                  color: disputes ? color.red : color.black,
                  fontWeight: 'bold' as const,
                }}
              />
              <RatsText
                text={String(daysRemaining)}
                style={{
                  fontSize: fontSize.regular,
                  color: color.black,
                  fontWeight: 'bold' as const,
                }}
              />
            </View>
          </View>
        </View>
      }>
      <View style={{ marginTop: normalize(15), marginBottom: normalize(5) }}>
        <RatsButton light onPress={routeToDisputes} title="VIEW DISPUTES" />
      </View>
    </WeekStatSummary>
  );
};

/**
 * ActionButtons - Renders the action buttons for the stat screen
 */
export const ActionButtons: React.FC<{
  leftButtonLabel: string;
  rightButtonLabel: string;
  leftButtonOnPress: () => void;
  rightButtonOnPress: () => void;
  user: User | null;
  house: House | null;
  guestUserId: string;
  leftButtonProps?: any;
  rightButtonProps?: any;
  leftButtonTestID?: string;
  rightButtonTestID?: string;
}> = ({
  leftButtonLabel,
  rightButtonLabel,
  leftButtonOnPress,
  rightButtonOnPress,
  user,
  house,
  guestUserId,
  leftButtonProps,
  rightButtonProps,
  leftButtonTestID,
  rightButtonTestID,
}) => {
  return (
    <AuthConsumer>
      {({ token }) => {
        if (user?.id === guestUserId || house?.isDemoHouse) {
          return (
            <View>
              <View
                style={{
                  flexDirection: 'row',
                  flex: 1,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                <RatsButton
                  testID={leftButtonTestID}
                  light
                  containerStyle={{ flex: 0.48 }}
                  onPress={leftButtonOnPress}
                  title={leftButtonLabel}
                  {...leftButtonProps}
                />
                <RatsButton
                  testID={rightButtonTestID}
                  containerStyle={{ flex: 0.48 }}
                  onPress={rightButtonOnPress}
                  title={rightButtonLabel}
                  {...rightButtonProps}
                />
              </View>
            </View>
          );
        }
        if (
          (house && isAdmin(token, house.id)) ||
          (house?.isDemoHouse && leftButtonLabel === 'CHANGE CHORE')
        ) {
          return (
            <RatsButton
              testID={leftButtonTestID}
              light
              containerStyle={{ flex: 1 }}
              onPress={leftButtonOnPress}
              title={leftButtonLabel}
              {...leftButtonProps}
            />
          );
        }
        return null;
      }}
    </AuthConsumer>
  );
};

/**
 * StatSummaryScreen - Main component for stat summary screens
 */
const StatSummaryScreen: React.FC<StatSummaryScreenProps> = ({
  stat,
  statSum,
  phaseRule,
  percentage,
  disputes,
  daysRemaining,
  graphData,
  getBarFillColor,
  isLoading,
  navigation,
  setRef,
  renderStatDetails,
  renderHelp = () => {},
  testID,
}) => {
  if (isLoading && graphData.length === 0) {
    return <RatsLoadingIndicator />;
  }

  return (
    <SafeAreaView
      testID={testID}
      edges={['bottom']}
      style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader
        renderBackButton
        icon={<HelpIcon helpFn={renderHelp} setRef={setRef} />}
        header={STAT_MAP[stat].label}
      />
      <RatsScrollView contentContainerStyle={CONTAINER}>
        {renderStatDetails && renderStatDetails()}
        <WeekDetails
          statSum={statSum}
          phaseRule={phaseRule}
          percentage={percentage}
          disputes={disputes}
          daysRemaining={daysRemaining}
          navigation={navigation}
        />
        <BarGraph
          graphData={graphData}
          getBarFillColor={getBarFillColor}
          isLoading={isLoading}
        />
      </RatsScrollView>
    </SafeAreaView>
  );
};

export default StatSummaryScreen;
