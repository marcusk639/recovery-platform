/**
 * MiscellaneousForm Tests
 *
 * Regression coverage for 2026-07-05: handleSubmit fired onSubmit(values)
 * without awaiting it, then immediately called dismissModal() — so the
 * modal closed before the async submission (a real Firestore/service write
 * in every caller: file complaint, house issue, bug report, feedback) had
 * even started, let alone succeeded or failed.
 */

jest.mock("../../../util/platform", () => ({ IOS: false }));

jest.mock("../../../components/rats-scroll-view", () => {
  const react = require("react");
  const { View } = require("react-native");
  return (props: any) => react.createElement(View, null, props.children);
});

let capturedConfirm: (() => void) | null = null;
jest.mock("../../../components/confirmation-buttons", () => (props: any) => {
  capturedConfirm = props.confirm;
  const react = require("react");
  const { TouchableOpacity, Text } = require("react-native");
  return react.createElement(
    TouchableOpacity,
    { testID: "confirm-button", onPress: props.confirm },
    react.createElement(Text, null, props.confirmButtonText)
  );
});

import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import MiscellaneousForm from "../MiscellaneousForm";

describe("MiscellaneousForm", () => {
  beforeEach(() => {
    capturedConfirm = null;
  });

  function renderForm(onSubmit: (values: any) => Promise<void>) {
    const dismissModal = jest.fn();
    const outerProps = { dismissModal, onSubmit, header: "Test Form" };
    const FormComponent = MiscellaneousForm(
      { description: "" },
      null,
      outerProps,
      {}
    );
    const utils = render(<FormComponent {...(outerProps as any)} />);
    return { ...utils, dismissModal };
  }

  it("awaits onSubmit before dismissing the modal", async () => {
    let resolveSubmit: () => void = () => {};
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const { dismissModal } = renderForm(onSubmit);

    let pressed: Promise<void> | undefined;
    // Formik's handleSubmit runs validation as a microtask before invoking
    // the config's handleSubmit (and therefore outer onSubmit) — a sync
    // act() returns before that microtask settles, so onSubmit hasn't been
    // called yet by the time of the assertion below. Awaiting a microtask
    // flush (not `pressed` itself, which only resolves once onSubmit's own
    // promise resolves later) is enough to let Formik reach onSubmit while
    // still leaving onSubmit's promise unresolved.
    await act(async () => {
      pressed = Promise.resolve(capturedConfirm && (capturedConfirm as any)());
      await Promise.resolve();
    });

    // Submission is in flight — the modal must not be dismissed yet.
    expect(onSubmit).toHaveBeenCalled();
    expect(dismissModal).not.toHaveBeenCalled();

    await act(async () => {
      resolveSubmit();
      await pressed;
    });

    expect(dismissModal).toHaveBeenCalled();
  });

  it("dismisses the modal after onSubmit resolves following a real async delay", async () => {
    const onSubmit = jest.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 10))
    );
    const { dismissModal } = renderForm(onSubmit);

    await act(async () => {
      (capturedConfirm as any)();
    });

    // Formik's own handleSubmit() promise doesn't reliably chain through to
    // the config handleSubmit's completion (confirmed via a real run: it
    // resolves before onSubmit's real 10ms setTimeout settles) — poll
    // instead of awaiting it directly.
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() => expect(dismissModal).toHaveBeenCalled());
  });
});
