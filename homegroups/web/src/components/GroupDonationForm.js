import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  useStripe,
  useElements,
  CardElement,
} from "@stripe/react-stripe-js";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth"; // Needed to ensure user is logged in
import styled from "styled-components";

// --- Styled Components (Basic Styling) ---
const FormContainer = styled.form`
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 8px;
  max-width: 400px;
  margin: 20px auto;
`;

const FormRow = styled.div`
  margin-bottom: 15px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
`;

const CardElementContainer = styled.div`
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: white;
`;

const SubmitButton = styled.button`
  background-color: #4caf50; /* Green */
  color: white;
  padding: 12px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  width: 100%;
  font-size: 16px;
  opacity: ${(props) => (props.disabled ? 0.7 : 1)};
  &:hover {
    background-color: ${(props) => (props.disabled ? "#4CAF50" : "#45a049")};
  }
`;

const ErrorMessage = styled.div`
  color: red;
  margin-top: 10px;
  font-size: 14px;
`;
// --- End Styled Components ---

// Initialize Firebase Functions (ensure Firebase is initialized in your web app entry point)
const functions = getFunctions();
const auth = getAuth(); // Get auth instance
const createPaymentIntent = httpsCallable(
  functions,
  "createStripePaymentIntent"
);

const DonationForm = ({ groupId, groupName }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [amount, setAmount] = useState(10); // Default $10
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [donationSuccess, setDonationSuccess] = useState(false);

  const handleAmountChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1) {
      setAmount(value);
    } else if (e.target.value === "") {
      setAmount("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements || !auth.currentUser) {
      setError("Payment system not ready or user not logged in.");
      return;
    }
    if (!amount || amount < 1) {
      setError("Please enter a valid donation amount (minimum $1).");
      return;
    }

    setLoading(true);
    setError(null);
    setDonationSuccess(false);

    try {
      console.log(
        `Calling createStripePaymentIntent for group ${groupId} with amount ${
          amount * 100
        } cents`
      );
      const result = await createPaymentIntent({
        groupId: groupId,
        amount: amount * 100, // Send amount in cents
      });

      const { clientSecret, error: backendError } = result.data;

      if (backendError || !clientSecret) {
        throw new Error(
          backendError?.message || "Failed to initiate payment from server."
        );
      }
      console.log("Received client secret");

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error("Card element not found");

      setProcessing(true);
      const { error: stripeError, paymentIntent } =
        await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardElement },
        });
      setProcessing(false);

      if (stripeError) {
        throw stripeError; // Throw Stripe error
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        console.log("Payment succeeded!");
        setDonationSuccess(true);
        // Clear form elements
        cardElement.clear();
        setAmount(10);
      } else {
        setError("Payment status: " + paymentIntent?.status ?? "unknown");
      }
    } catch (err) {
      console.error("Error in donation process:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormContainer onSubmit={handleSubmit}>
      <h3>Donate to {groupName}</h3>
      {donationSuccess && (
        <p style={{ color: "green", fontWeight: "bold" }}>
          Thank you for your donation!
        </p>
      )}
      <FormRow>
        <Label htmlFor="amount">Amount ($):</Label>
        <Input
          id="amount"
          type="number"
          value={amount}
          onChange={handleAmountChange}
          min="1"
          required
          disabled={processing || loading}
        />
      </FormRow>
      <FormRow>
        <Label>Card Details:</Label>
        <CardElementContainer>
          <CardElement
            options={{
              style: { base: { fontSize: "16px" } },
              hidePostalCode: true,
            }}
          />
        </CardElementContainer>
      </FormRow>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <SubmitButton type="submit" disabled={!stripe || loading || processing}>
        {processing
          ? "Processing..."
          : loading
          ? "Initiating..."
          : `Donate $${amount}`}
      </SubmitButton>
    </FormContainer>
  );
};

// Load stripe outside of component render
const stripePromise = loadStripe(
  process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || ""
);

const GroupDonationComponent = ({ groupId, groupName }) => (
  <Elements stripe={stripePromise}>
    <DonationForm groupId={groupId} groupName={groupName} />
  </Elements>
);

export default GroupDonationComponent;
