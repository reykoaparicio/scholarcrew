import { z } from "zod";
import { Id, IsoDateTime } from "./common";

export const NotificationKind = z.enum(["new_matches", "deadline", "job_ready", "family", "digest", "system"]);
export type NotificationKind = z.infer<typeof NotificationKind>;

export const Notification = z.strictObject({
  id: Id,
  kind: NotificationKind,
  title: z.string(),
  body: z.string(),
  link: z.string(),
  createdAt: IsoDateTime,
  readAt: IsoDateTime.nullable(),
});
export type Notification = z.infer<typeof Notification>;

export const NotificationPrefs = z.strictObject({
  digestDay: z.number().int().min(0).max(6),
  digestHour: z.number().int().min(0).max(23),
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  phoneSet: z.boolean(),
  quietStartHour: z.number().int().min(0).max(23),
  quietEndHour: z.number().int().min(0).max(23),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export const NotificationPrefsPatch = z.strictObject({
  digestDay: z.number().int().min(0).max(6).optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .nullable()
    .optional(),
  quietStartHour: z.number().int().min(0).max(23).optional(),
  quietEndHour: z.number().int().min(0).max(23).optional(),
});
export type NotificationPrefsPatch = z.infer<typeof NotificationPrefsPatch>;
