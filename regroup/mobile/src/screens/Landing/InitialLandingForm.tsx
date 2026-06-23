import React, { useState } from 'react';
import { withFormik, Field, FormikProps } from 'formik';
import { useNavigation } from '@react-navigation/native';
import * as yup from 'yup';
import { View, TouchableOpacity, TextStyle, ViewStyle } from 'react-native';
import {
  AuthScreenNavigationProp,
  AuthStackParamList,
  Routes,
} from '../../navigation/types';
import {
  navigateAuthStackRoute,
  navigateToMain,
} from '../../navigation/authNavigation';
import RatsRadioButtonGroup from '../../components/rats-radio-button-group';
import RatsButton from '../../components/rats-button/rats-button';
import {
  color,
  fontFamily,
  fontSize,
  normalize,
  ROW,
} from '../../styles/theme';
import { RatsText } from '../../components/rats-text';
import { login, initialSignUp } from '../../state/slices/userSlice';
import { RatsHR } from '../../components/rats-horizontal-rule';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { useAppSelector, useAppDispatch } from '../../state/store';
import { User } from '../../entities/User';

interface FormValues {
  potentialUserType: string;
}

interface FormViewProps extends FormikProps<FormValues> {
  login: (email: string, password: string) => Promise<void>;
}

const InitialLandingFormView = (props: FormViewProps) => {
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<AuthScreenNavigationProp>();

  const potentialGuestLabel = "I'm looking to join a recovery home.";
  const potentialManagerLabel =
    'I want to manage my recovery homes with this app.';

  const FORM: ViewStyle = {
    flex: 1,
    paddingTop: normalize(15),
  };

  const ERROR_MESSAGE: TextStyle = {
    color: color.red,
    textAlign: 'center',
    fontSize: fontSize.medium,
    fontFamily: fontFamily.roboto,
  };

  const renderErrors = () => {
    const { errors, touched, submitCount } = props;
    return Object.keys(errors).map(
      key =>
        submitCount > 0 &&
        (touched as Record<string, boolean>)[key] && (
          <RatsText
            key={key}
            style={ERROR_MESSAGE}
            text={(errors as Record<string, string>)[key]}
          />
        ),
    );
  };

  const showDemo = async () => {
    setLoading(true);
    await props.login('demo_user@appdemo.net', 'DemoUser1');
    setLoading(false);
    navigateToMain(navigation);
  };

  if (loading) {
    return <RatsLoadingIndicator />;
  }

  return (
    <View style={FORM}>
      <View>
        <RatsText
          style={{
            fontSize: normalize(23),
            marginTop: normalize(20),
            marginLeft: normalize(0),
            marginBottom: normalize(10),
            fontWeight: '600' as const,
          }}
          text="How can we help?"
        />
        <Field
          component={RatsRadioButtonGroup}
          name="potentialUserType"
          formHorizontal={false}
          wrapStyle={{ marginHorizontal: 0 }}
          selectedButtonColor={color.black}
          radioButtons={[
            {
              label: potentialGuestLabel,
              value: 'guest',
              testID: 'landing-role-guest',
            },
            {
              label: potentialManagerLabel,
              value: 'superAdmin',
              testID: 'landing-role-manager',
            },
          ]}
        />
        {Object.keys(props.errors).length > 0 && <View>{renderErrors()}</View>}
        <RatsButton
          disabled={!props.isValid}
          containerStyle={{ height: normalize(45) }}
          title="NEXT"
          testID="nav-house-search"
          onPress={props.handleSubmit as any}
        />
      </View>
      <View
        style={[
          ROW,
          { justifyContent: 'space-between', paddingVertical: normalize(30) },
        ]}>
        <RatsHR
          style={{ width: '40%', borderBottomWidth: 2, alignSelf: 'center' }}
        />
        <RatsText text="OR" style={{ fontSize: fontSize.medium }} />
        <RatsHR
          style={{ width: '40%', borderBottomWidth: 2, alignSelf: 'center' }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <RatsText
          style={{
            fontSize: normalize(23),
            marginLeft: normalize(0),
            marginBottom: normalize(10),
            fontWeight: '600' as const,
          }}
          text="Have an account?"
        />
        <RatsButton
          containerStyle={{
            marginTop: normalize(10),
            height: normalize(45),
          }}
          testID="sign-in-button"
          title="SIGN IN"
          onPress={() => {
            navigation.navigate(Routes.Login);
          }}
        />
        <View
          style={{
            ...ROW,
            justifyContent: 'center',
            alignItems: 'flex-end',
            flex: 1,
          }}>
          <RatsText
            style={{
              fontFamily: fontFamily.roboto,
              fontSize: fontSize.regular_medium,
            }}
            text="Want to try it out?"
          />
          <TouchableOpacity
            testID="landing-demo-link"
            onPress={() => {
              navigation.navigate(Routes.Login);
            }}>
            <RatsText
              style={{
                fontFamily: fontFamily.roboto,
                fontSize: fontSize.regular_medium,
                color: color.baby_blue,
                paddingLeft: normalize(10),
              }}
              text="Use the demo"
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const initialValues: FormValues = {
  potentialUserType: '',
};

const determineInitialRoute = (
  potentialUserType: string,
): keyof AuthStackParamList | undefined => {
  if (potentialUserType === 'superAdmin') {
    return Routes.Login;
  }
  if (potentialUserType === 'guest') {
    return Routes.HouseSearch;
  }
  return undefined;
};

const FormikForm = withFormik<any, FormValues>({
  mapPropsToValues: () => initialValues,
  handleSubmit: async (values, { props, setStatus, setSubmitting }) => {
    const { potentialUserType } = values;
    setStatus({});
    setSubmitting(true);
    try {
      props.initialSignUp(props.user, potentialUserType);
      const initialRoute = determineInitialRoute(potentialUserType);
      if (initialRoute) {
        navigateAuthStackRoute(props.navigation, initialRoute);
      }
    } catch (error) {
      setSubmitting(false);
      setStatus({ failed: true });
    }
  },
  validationSchema: yup.object().shape({
    potentialUserType: yup.string().required('Please select an option.'),
  }),
})(InitialLandingFormView);

/**
 * Initial Landing Form
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux imports (useDispatch, useSelector, userActions)
 * - Added RTK imports: login, initialSignUp from userSlice
 * - Added useAppSelector, useAppDispatch from store
 * - Updated 1 selector to use state.user (removed 'as any' cast)
 * - Replaced 2 dispatch calls with RTK thunks
 */
const InitialLandingForm = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.user.user);
  const navigation = useNavigation<AuthScreenNavigationProp>();

  const handleLogin = (email: string, password: string) =>
    dispatch(login({ email, password }));

  const handleInitialSignUp = (user: User, potentialUserType: string) =>
    dispatch(initialSignUp({ user, potentialUserType }));

  return (
    <FormikForm
      user={user}
      login={handleLogin}
      initialSignUp={handleInitialSignUp}
      navigation={navigation}
    />
  );
};

export default InitialLandingForm;
