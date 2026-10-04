import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in · Deloo" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return <AuthForm kind="login" next={typeof next === "string" ? next : undefined} linkError={error === "link"} />;
}
