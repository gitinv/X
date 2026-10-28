import { SignupForm } from "@/components/signup-form";
import { CustomerFrame } from "@/components/customer-frame";
import Link from "next/link";

export const metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <CustomerFrame>
      <div className="mx-auto max-w-md rounded-[2rem] bg-white p-6 shadow-card">
        <Link href="/" className="text-sm text-bark underline">Home</Link>
        <h1 className="mt-3 font-serif text-5xl italic text-wine">Create your login</h1>
        <p className="mt-2 text-sm text-bark">Use the email or phone already on your visits and the same profile opens at every studio.</p>
        <SignupForm />
      </div>
    </CustomerFrame>
  );
}
