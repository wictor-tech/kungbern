import { z } from "zod/v4";

/** Validering av en guide från adminläget. */
export const GuideInput = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,60}$/, "id får bara innehålla a–z, 0–9 och bindestreck"),
  number: z.number().int().min(0),
  title: z.string().trim().min(2).max(120),
  category: z.string().min(1).max(60),
  app: z.enum(["location-admin", "site"]),
  pageKey: z.string().max(80).default(""),
  breadcrumb: z.array(z.string().max(80)).max(8),
  summary: z.string().max(600),
  screenshot: z.string().max(300).nullable(),
  screenshotAnnotated: z.boolean().optional(),
  screenshotSize: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable().optional(),
  hotspots: z
    .array(
      z.object({
        n: z.number().int(),
        label: z.string().max(120),
        text: z.string().max(600),
        x: z.number().min(0).max(100).optional(),
        y: z.number().min(0).max(100).optional(),
        w: z.number().min(0).max(100).optional(),
        h: z.number().min(0).max(100).optional(),
      }),
    )
    .max(30),
  steps: z
    .array(
      z.object({
        n: z.number().int(),
        text: z.string().trim().min(1).max(600),
        hotspot: z.number().int().optional(),
        image: z.string().max(300).optional(),
        target: z.string().max(200).optional(),
      }),
    )
    .max(30),
  notes: z.array(z.object({ type: z.enum(["tip", "warning"]), text: z.string().trim().min(1).max(600) })).max(10),
  alternativeQueries: z.array(z.string().trim().min(1).max(200)).max(50),
  keywords: z.array(z.string().max(120)).max(60).optional(),
  relatedGuides: z.array(z.string().max(60)).max(10),
  roles: z.array(z.string().max(40)).max(10).default([]),
  status: z.enum(["draft", "published"]),
  video: z.object({ url: z.string().max(300), startSec: z.number().optional(), endSec: z.number().optional() }).nullable().optional(),
});
