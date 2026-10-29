import { z } from 'zod';
import { editSchema } from './patch.js';

const label = z.string().trim().min(1).max(40);

export const menuOptionSchema = z.object({
  /** e.g. "Milk". */
  name: label,
  /** e.g. ["Whole", "Oat", "Soy"]. */
  choices: z.array(label).min(1).max(12),
});
export type MenuOptionInput = z.infer<typeof menuOptionSchema>;

export const menuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  options: z.array(menuOptionSchema),
  /** Hidden items can't be ordered. Only organisers see them. */
  hidden: z.boolean(),
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const createMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(60),
  options: z.array(menuOptionSchema).max(6).default([]),
});
export type CreateMenuItem = z.infer<typeof createMenuItemSchema>;

export const updateMenuItemSchema = editSchema(createMenuItemSchema).extend({
  hidden: z.boolean().optional(),
});
export type UpdateMenuItem = z.infer<typeof updateMenuItemSchema>;

export const orderChoiceSchema = z.object({
  option: z.string(),
  choice: z.string(),
});
export type OrderChoiceOutput = z.infer<typeof orderChoiceSchema>;

/** What someone picked: option name to choice. Leave an option out to skip it. */
const pickedSchema = z.record(z.string(), z.string().nullable()).default({});

export const coffeeOrderSchema = z.object({
  /** Null if the item has since been hidden or removed from the menu. */
  menuItemId: z.string().nullable(),
  item: z.string(),
  choices: z.array(orderChoiceSchema),
});
export type CoffeeOrder = z.infer<typeof coffeeOrderSchema>;

export const orderInputSchema = z.object({
  menuItemId: z.string(),
  choices: pickedSchema,
  /** Also save this as my usual at this club. */
  saveAsUsual: z.boolean().default(false),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export const usualSchema = coffeeOrderSchema.extend({
  menuItemId: z.string(),
  /** Order it whenever I say I'm going. */
  autoAdd: z.boolean(),
});
export type Usual = z.infer<typeof usualSchema>;

export const usualInputSchema = z.object({
  menuItemId: z.string(),
  choices: pickedSchema,
  autoAdd: z.boolean().default(false),
});
export type UsualInput = z.infer<typeof usualInputSchema>;

/** Coffee on a run page. */
export const runCoffeeSchema = z.object({
  /** When orders lock. */
  closesAt: z.iso.datetime(),
  open: z.boolean(),
  orderCount: z.number(),
  myOrder: coffeeOrderSchema.nullable(),
});
export type RunCoffee = z.infer<typeof runCoffeeSchema>;

/** The cashier view: what to ask for, and who's having what. */
export const orderSummarySchema = z.object({
  clubName: z.string(),
  runTitle: z.string(),
  startsAt: z.iso.datetime(),
  timezone: z.string(),
  closesAt: z.iso.datetime(),
  open: z.boolean(),
  total: z.number(),
  lines: z.array(
    z.object({
      item: z.string(),
      count: z.number(),
      variants: z.array(z.object({ choices: z.string(), count: z.number() })),
    }),
  ),
  people: z.array(
    z.object({ name: z.string(), item: z.string(), choices: z.string() }),
  ),
});
export type OrderSummaryOutput = z.infer<typeof orderSummarySchema>;
