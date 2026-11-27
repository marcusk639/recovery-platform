/**
 * A blocked house for resident-limited-view.yaml (launch spec §4.1 item 2):
 * canceled, with no grace period, so its resident gets the limited view. The
 * resident has one payment and one document of their own; the house has one
 * house-level document they must not see.
 */
const d = require('./docs');

const LAPSED_HOUSE = 'test-house-lapsed';

function lapsedHouse(now, Timestamp) {
  const operator = d.operator('lapsed-operator', LAPSED_HOUSE, false, now);
  // setHouseSubscriptionStatusOnCreate re-derives the house's status from this.
  operator.user.subscriptionMetadata = {
    ...operator.user.subscriptionMetadata,
    status: 'canceled',
    houses: { [LAPSED_HOUSE]: { numberOfGuests: 1 } },
  };
  const resident = d.resident('guest-lapsed', 0, LAPSED_HOUSE);

  const house = d.house(LAPSED_HOUSE, 'E2E Lapsed House', operator.uid, now, {
    subscriptionStatus: 'canceled',
    currentCapacity: 1,
  });

  const payments = [
    {
      id: 'e2e-pay-lapsed',
      guestId: 'guest-lapsed',
      houseId: LAPSED_HOUSE,
      guestUserId: resident.uid,
      amount: 3333,
      description: 'Rent Payment',
      status: 'succeeded',
      stripePaymentIntentId: 'pi_e2e-pay-lapsed',
      createdAt: Timestamp.fromMillis(now - 3 * 86400000),
    },
  ];

  const document = (id, guestId) => ({
    id,
    houseId: LAPSED_HOUSE,
    ...(guestId ? { guestId } : {}),
    fileName: `${id}.pdf`,
    storagePath: guestId
      ? `houses/${LAPSED_HOUSE}/guests/${guestId}/documents/${id}`
      : `houses/${LAPSED_HOUSE}/documents/${id}`,
    fileType: 'pdf',
    category: 'lease',
    uploadedBy: operator.uid,
    createdAt: d.iso(now - 86400000),
  });
  const documents = [document('e2e-doc-lapsed', 'guest-lapsed'), document('e2e-doc-lapsed-house')];

  return { operator, resident, house, payments, documents };
}

module.exports = { LAPSED_HOUSE, lapsedHouse };
