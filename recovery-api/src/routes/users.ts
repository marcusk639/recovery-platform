import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/firebase.js";

export const users = new Hono();

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  sobrietyDate: z.string().date().optional(),
  homeApp: z
    .enum(["detox-recovery", "sober-living", "homegroups", "treatment-center"])
    .optional(),
});

users.get("/me", async (c) => {
  const uid = c.get("uid");
  const doc = await db.collection("users").doc(uid).get();

  if (!doc.exists) {
    return c.json({ uid, profile: null });
  }

  return c.json({ uid, profile: doc.data() });
});

users.put("/me", zValidator("json", UpdateProfileSchema), async (c) => {
  const uid = c.get("uid");
  const body = c.req.valid("json");

  await db
    .collection("users")
    .doc(uid)
    .set({ ...body, updatedAt: new Date() }, { merge: true });

  return c.json({ uid, updated: true });
});
