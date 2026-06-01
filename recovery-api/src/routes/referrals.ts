import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/firebase.js";

export const referrals = new Hono();

const TARGET_APPS = [
  "treatment-center",
  "phoenix-cleanhouse",
  "homegroups",
] as const;

const SOURCE_APPS = [
  "detox-recovery",
  "homegroups",
  "phoenix-cleanhouse",
] as const;

const CreateReferralSchema = z.object({
  toApp: z.enum(TARGET_APPS),
  fromApp: z.enum(SOURCE_APPS),
  clientName: z.string().min(1).max(100),
  clientEmail: z.string().email(),
  condition: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

referrals.post("/", zValidator("json", CreateReferralSchema), async (c) => {
  const uid = c.get("uid");
  const body = c.req.valid("json");

  const ref = await db.collection("referrals").add({
    referredBy: uid,
    status: "pending",
    createdAt: new Date(),
    ...body, // includes validated fromApp and toApp from request body
  });

  return c.json({ id: ref.id, status: "pending" }, 201);
});

referrals.get("/", async (c) => {
  const uid = c.get("uid");

  const snap = await db
    .collection("referrals")
    .where("referredBy", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return c.json({ referrals: items });
});

referrals.get("/:id", async (c) => {
  const uid = c.get("uid");
  const doc = await db.collection("referrals").doc(c.req.param("id")).get();

  if (!doc.exists) return c.json({ error: "Not found" }, 404);

  const data = doc.data()!;
  if (data.referredBy !== uid) return c.json({ error: "Forbidden" }, 403);

  return c.json({ id: doc.id, ...data });
});
