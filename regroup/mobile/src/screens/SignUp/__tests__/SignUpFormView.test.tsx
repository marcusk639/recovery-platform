/**
 * SignUpFormView Tests
 *
 * Regression coverage for 2026-07-05: both the confirm-password field and
 * the Terms of Service checkbox were seeded in form state (mapPropsToValues)
 * and imported (RatsCheckBox) but never actually rendered — signup could
 * submit with no confirm-password entry and no affirmative terms
 * acceptance. This suite confirms both are now rendered and wired to
 * Formik's field/onChange mechanics.
 *
 * Hardened 2026-07-06: the first version of this test rendered
 * <SignUpFormView> directly with a hand-built FormikProps-shaped object —
 * that doesn't work, because the component's <Field> children read from
 * Formik's own React context (useFormikContext), not from props passed to
 * the outer component. Confirmed via a real Jest run once the test
 * environment was fixed: `TypeError: formik.getFieldProps is not a
 * function`. Wrapping in a real <Formik> provider fixes it.
 */

jest.mock("../../../state/hooks", () => ({
  useAppSelector: (selector: any) =>
    selector({ user: { invitation: null, signUpRole: null } }),
}));

jest.mock("../../../util/platform", () => ({ IOS: false }));

import React from "react";
import { render, cleanup } from "@testing-library/react-native";
import { Formik } from "formik";
import SignUpFormView from "../SignUpFormView";

// Hardened 2026-07-07: without an explicit unmount between tests, a
// component in this tree (react-native's Animated, per the stack trace)
// leaves a timer scheduled past this file's own teardown, surfacing as
// "You are trying to access a property or method of the Jest environment
// after it has been torn down." The suite still passed, but this is exactly
// the kind of leak that starts flaking in CI once enough of it accumulates.
afterEach(() => {
  cleanup();
});

const baseValues = {
  email: "",
  password: "",
  confirmPassword: "",
  termsOfService: false,
  firstName: "",
  lastName: "",
};

function renderForm(initialValues: Partial<typeof baseValues> = {}) {
  return render(
    <Formik
      initialValues={{ ...baseValues, ...initialValues }}
      onSubmit={jest.fn()}
    >
      {(formikProps) => (
        <SignUpFormView
          {...(formikProps as any)}
          error={null}
          navigation={{ navigate: jest.fn() } as any}
        />
      )}
    </Formik>
  );
}

describe("SignUpFormView", () => {
  it("renders a confirm-password field", () => {
    const { getByTestId } = renderForm();
    expect(getByTestId("signup-confirm-password-input")).toBeTruthy();
  });

  it("renders a Terms of Service checkbox", () => {
    const { getByTestId } = renderForm();
    expect(getByTestId("terms-of-service-checkbox")).toBeTruthy();
  });

  it("reflects values.termsOfService in the checkbox value", () => {
    // @react-native-community/checkbox renders `value` onto an inner native
    // element, not the outer testID'd View — accessibilityState.checked on
    // the outer View mirrors it and is what's actually queryable here.
    const { getByTestId } = renderForm({ termsOfService: true });
    expect(
      getByTestId("terms-of-service-checkbox").props.accessibilityState.checked
    ).toBe(true);
  });

  it("the confirm-password field is a secure text entry, matching the password field", () => {
    const { getByTestId } = renderForm();
    expect(
      getByTestId("signup-confirm-password-input").props.secureTextEntry
    ).toBe(true);
  });
});
