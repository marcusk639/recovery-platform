import React, { Fragment } from 'react';
import { Field } from 'formik';
import { View } from 'react-native';
import RatsPicker from '../../components/rats-picker/rats-picker';
import { getPickerItems } from '../../util/display';
import { Guest } from '../../entities/Guest';
import { normalize } from '../../styles/theme';
import FilterForm, { FilterFormProps } from '../../forms/FilterForm';
import Admin from '../../entities/Admin';

interface Props extends FilterFormProps {
  // users: (Admin | Guest)[];
  filters: ContactFilterFormValues;
}

export type UserTypeFilters = 'guest' | 'admin' | 'operator' | 'all';

export class ContactFilterFormValues {
  type: UserTypeFilters = 'all';
}

const userTypeItems = {
  Guest: 'guest',
  Admin: 'admin',
  Operator: 'operator',
  All: 'all',
};

export const ContactFilterForm = (props: Props) => {
  const renderField = (field: JSX.Element) => {
    return <View style={{ marginVertical: normalize(10) }}>{field}</View>;
  };
  const fields = (
    <Fragment>
      {renderField(
        <Field
          component={RatsPicker}
          name="type"
          label="Type"
          items={getPickerItems(userTypeItems, undefined, true)}
        />,
      )}
    </Fragment>
  );
  return React.createElement(
    FilterForm(props.filters, fields, props, new ContactFilterFormValues()),
  );
};
