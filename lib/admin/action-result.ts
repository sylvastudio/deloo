/** What every admin server action returns to its form (components/admin/action-form.tsx). */
export type ActionResult = { ok?: string; error?: string; id?: string } | undefined;
