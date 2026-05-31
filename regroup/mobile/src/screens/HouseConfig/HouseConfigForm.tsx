import React from 'react';
import { withFormik } from 'formik';
import { useAppSelector } from '../../state/store';
import { useCreateAdmin } from '../../state/queries/adminQueries';
import { useCreateHouse } from '../../state/queries/houseQueries';
import { User } from '../../entities/User';
import { cloneDeep, each, map } from 'lodash';
import { House, houseSchema } from '../../entities/House';
import HouseConfigFormView from './HouseConfigFormView';
import Admin from '../../entities/Admin';
import { Routes, RootStackParamList } from '../../navigation/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export interface HouseConfigFormProps {
  user: User;
  createAdmin: (admin: Admin) => any;
  createHouse: (house: House, admins: Admin[]) => any;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

export interface HouseConfigFormValues {
  house: House;
  admins: { [key: string]: Admin };
}

const initialValues: HouseConfigFormValues = {
  house: new House(),
  admins: {},
};

const HouseConfigForm = withFormik<HouseConfigFormProps, HouseConfigFormValues>(
  {
    mapPropsToValues: props => initialValues,
    handleSubmit: async (values, { props, setStatus, setSubmitting }) => {
      setStatus({});
      setSubmitting(true);
      each(values.house.phases, (phase, key) => {
        values.house.phases[phase.name] = cloneDeep(phase);
        delete values.house.phases[key];
      });
      each(values.house.chores, (chore, key) => {
        values.house.chores[chore.name] = cloneDeep(chore);
        delete values.house.chores[key];
      });
      try {
        setSubmitting(false);
        await props.createHouse(values.house, map(values.admins));
        props.navigation.navigate(Routes.SendInvites);
      } catch (error) {
        setSubmitting(false);
        setStatus({ failed: true });
      }
    },
    // validationSchema: houseSchema
  },
)(HouseConfigFormView as any);

/**
 * House Config Form Wrapper
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (houseActions, adminActions)
 * - Added RTK imports: createHouse, createAdmin
 * - Updated Props interface to use generic function types
 * - Replaced 2 dispatch calls with RTK thunks (removed 'as any' casts)
 */
const HouseConfigFormWrapper: React.FC<any> = props => {
  const user = useAppSelector(state => state.user.user);
  const { mutateAsync: createAdmin } = useCreateAdmin();
  const { mutateAsync: createHouse } = useCreateHouse();

  return (
    <HouseConfigForm
      {...props}
      user={user}
      createAdmin={(admin: Admin) => createAdmin(admin)}
      createHouse={(house: House, _admins: Admin[]) => createHouse(house)}
    />
  );
};

export default HouseConfigFormWrapper;
