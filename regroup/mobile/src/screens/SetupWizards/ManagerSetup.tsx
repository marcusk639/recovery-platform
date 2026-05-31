import React, { Fragment, useState, useCallback, useEffect } from 'react';
// Phase 3.3: Migrated from withHouseSetupWizard HOC to useHouseSetupWizard hook
import { useHouseSetupWizard } from '../../hooks/useHouseSetupWizard';

import { withFormik, Field, FormikProps } from 'formik';
import ManagerSetupProps, { ManagerSetupWithForm } from './ManagerSetupEntity';
import { View } from 'react-native';
import { renderField, validateEmail } from '../../util/form';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import {
  normalize,
  color,
  fontSize,
  SCROLL_CONTAINER,
  STAT_BUTTON_TEXT,
  SAVE_BUTTON,
} from '../../styles/theme';
import { cloneDeep, each, isEmpty, size } from 'lodash';
import RatsRadioButtonGroup from '../../components/rats-radio-button-group';
import { ActionButton } from '../../components/action-button';
import RatsButton from '../../components/rats-button/rats-button';
import RatsScrollView from '../../components/rats-scroll-view';
import { RatsText } from '../../components/rats-text';
import { SetupButtons, SetupHeader } from './OperatorSetupWizard';
import { RatsHR } from '../../components/rats-horizontal-rule';
import { House } from '../../entities/House';

const labelColor = 'black';

const operatorOnlyLabel = 'operator.only.label';
const seniorPeerLabel = 'senior.peer.label';
const externalManagersLabel = 'external.managers.label';
const democraticLabel =
  'This home will be democratically run by the guests. (Coming soon)';

type ManagerSetupFormViewProps = ManagerSetupWithForm &
  FormikProps<ManagerSetupFormValues>;

const ManagerSetupFormView: React.FC<ManagerSetupFormViewProps> = props => {
  const setupWizard = useHouseSetupWizard();
  const {
    values,
    setFieldValue,
    touched,
    errors,
    handleSubmit,
    navigation,
    onPrevPress,
    forSettings,
  } = props;

  const [managerEmailCount, setManagerEmailCount] = useState(0);

  const managerIsRequired = useCallback(() => {
    return (
      values.managerSetupType === 'external-managers' ||
      values.managerSetupType === 'senior-peer'
    );
  }, [values.managerSetupType]);

  useEffect(() => {
    if (managerIsRequired()) {
      setManagerEmailCount(1);
      setFieldValue('managerEmails', { manager_0: '' });
    }
  }, [values.managerSetupType]);

  const addEmailField = useCallback(() => {
    const count = size(values.managerEmails);
    setFieldValue(`managerEmails.manager_${count}`, '');
  }, [values.managerEmails, setFieldValue]);

  const getManagerEmailsTouchedValue = useCallback(
    (index: number) => {
      return (
        touched &&
        touched.managerEmails &&
        touched.managerEmails[`manager_${index}`]
      );
    },
    [touched],
  );

  const deleteManager = useCallback(
    (index: number) => {
      const emails = cloneDeep(values.managerEmails);
      delete emails['manager_' + index];
      const managerEmails: Record<string, string> = {};
      let i = 0;
      each(emails, (email, key) => {
        managerEmails[`manager_${i}`] = email;
        i++;
      });
      setFieldValue('managerEmails', managerEmails);
    },
    [values.managerEmails, setFieldValue],
  );

  const renderCornerIcon = useCallback(
    (index: number) => () => {
      return (
        <ActionButton
          style={{
            padding: 0,
            borderRadius: 22.5,
          }}
          iconSize={fontSize.medium}
          iconName="times-circle"
          onPress={() => deleteManager(index)}
        />
      );
    },
    [deleteManager],
  );

  const renderEmailFields = () => {
    if (managerIsRequired()) {
      const seniorPeer = values.managerSetupType === 'senior-peer';
      const managerEmailFields: JSX.Element[] = [];
      each(values.managerEmails, (email, key) => {
        const result = key.substring(key.indexOf('_') + 1, key.length);
        const index = parseInt(result);
        managerEmailFields.push(
          <Fragment key={key}>
            {renderField(
              `managerEmails.${key}`,
              'Email',
              RatsTextInput,
              false,
              'Email',
              'string',
              labelColor,
              undefined,
              getManagerEmailsTouchedValue(index),
              undefined,
              undefined,
              undefined,
              true,
              false,
              () => deleteManager(index),
              'none',
            )}
          </Fragment>,
        );
      });
      return (
        <Fragment>
          <RatsHR
            style={{ borderBottomWidth: 1, marginBottom: normalize(10) }}
          />
          <RatsText
            text={seniorPeer ? 'Senior peers' : 'Managers'}
            style={{ fontSize: fontSize.large, marginVertical: normalize(10) }}
          />
          {managerEmailFields}
          <RatsButton
            title={seniorPeer ? 'ADD SENIOR PEER' : 'ADD MANAGER'}
            onPress={addEmailField}
            light
            style={STAT_BUTTON_TEXT}
            containerStyle={{ marginVertical: normalize(20) }}
          />
        </Fragment>
      );
    }
  };

  const renderButtons = () => {
    return (
      <SetupButtons
        navigation={navigation}
        rightButtonContainer={
          forSettings ? { ...SAVE_BUTTON, width: '49%' } : {}
        }
        leftLabel={forSettings ? 'Cancel' : 'Back'}
        leftPress={onPrevPress}
        rightLabel={forSettings ? 'Save' : 'Next'}
        submit={handleSubmit}
      />
    );
  };

  const managerSetupTypeError = errors.managerSetupType;
  const managerRequiredError = (errors as any).managerRequired;

  return (
    <View style={{ flex: 1 }}>
      <RatsScrollView contentContainerStyle={SCROLL_CONTAINER}>
        <SetupHeader
          header="Managers"
          text="This application assumes that there is a person in charge of the house who oversees its operation at some level. You will be able to assign managerial privileges to guests if necessary.">
          <View>
            <Field
              component={RatsRadioButtonGroup}
              name="managerSetupType"
              formHorizontal={false}
              selectedButtonColor={color.black}
              wrapStyle={{ marginHorizontal: 0 }}
              radioButtons={[
                { label: operatorOnlyLabel, value: 'operator-only' },
                { label: externalManagersLabel, value: 'external-managers' },
                {
                  label: democraticLabel,
                  value: 'democratic',
                  disabled: true,
                },
              ]}
            />
            {managerSetupTypeError && (
              <RatsText
                text={managerSetupTypeError}
                style={{
                  alignSelf: 'center' as const,
                  color: color.red,
                  fontSize: fontSize.medium,
                }}
                translate={false}
              />
            )}
            {managerRequiredError && (
              <RatsText
                text={managerRequiredError}
                style={{
                  alignSelf: 'center' as const,
                  color: color.red,
                  fontSize: fontSize.medium,
                }}
                translate={false}
              />
            )}
            {renderEmailFields()}
          </View>
        </SetupHeader>
      </RatsScrollView>
      {forSettings && renderButtons()}
    </View>
  );
};

interface ManagerSetupFormValues {
  managerSetupType: 'operator-only' | 'senior-peer' | 'external-managers';
  managerEmails: { [key: string]: string };
}

const initialValues: ManagerSetupFormValues = {
  managerSetupType: 'operator-only',
  managerEmails: {},
};

const ManagerSetupForm = withFormik<ManagerSetupProps, ManagerSetupFormValues>({
  mapPropsToValues: ({ selectedHouse }) => {
    let managerEmails: Record<string, string> = {};
    const emailField = 'pendingAdminInvites';
    if (selectedHouse?.pendingAdminInvites) {
      selectedHouse.pendingAdminInvites.forEach((email, index) => {
        managerEmails[`manager_${index}`] = email;
      });
    }
    const managerSetupType = selectedHouse?.managerSetupType ?? 'operator-only';
    // Filter out 'democratic' as it's not supported yet
    const validType: 'operator-only' | 'senior-peer' | 'external-managers' =
      managerSetupType === 'democratic' ? 'operator-only' : managerSetupType;
    return {
      managerEmails,
      managerSetupType: validType,
    };
  },
  handleSubmit: (values, formikBag) => {
    const { selectedHouse, handleSubmit, updateHouse, onNextPress } =
      formikBag.props;
    if (!selectedHouse) return;

    const houseWithManagers = cloneDeep(selectedHouse) as House;
    const emailAttribute = 'pendingAdminInvites';
    // map attributes to house
    houseWithManagers.pendingAdminInvites = [];
    houseWithManagers.pendingGuestInvites = [];
    houseWithManagers.seniorPeerEmails = [];
    houseWithManagers.managerSetupType = values.managerSetupType;
    each(values.managerEmails, email => {
      if (email && email.length && email !== 'deleted') {
        houseWithManagers.pendingAdminInvites?.push(email.trim());
      }
    });
    if (handleSubmit) {
      handleSubmit(houseWithManagers);
    } else if (updateHouse && onNextPress) {
      updateHouse(houseWithManagers);
      onNextPress();
    }
  },
  validate: (values, props) => {
    const { managerSetupType, managerEmails } = values;
    const errors: Record<string, string> = {};
    if (!managerSetupType) {
      errors.managerSetupType = 'Please select an option';
    }
    if (
      managerSetupType === 'senior-peer' ||
      managerSetupType === 'external-managers'
    ) {
      if (isEmpty(managerEmails)) {
        errors.managerRequired = 'Please enter at least one email';
      }
      each(managerEmails, (email, key) => {
        if (!email || email.length === 0) {
          errors[`managerEmails.${key}`] = 'Must be a valid email';
        }
        if (
          email &&
          email !== 'deleted' &&
          !validateEmail(email?.trim() ?? '')
        ) {
          errors[`managerEmails.${key}`] = 'Must be a valid email';
        }
      });
    }
    return errors;
  },
  //@ts-ignore
})(ManagerSetupFormView);

export const ManagerSetup: React.FC<ManagerSetupWithForm> = props => {
  return <ManagerSetupForm {...props} />;
};

export default ManagerSetup;
