import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account · Deloo" };

export default function Signup() {
  return <AuthForm kind="signup" />;
}
