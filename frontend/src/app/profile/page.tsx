import type { Metadata } from "next";

import { ProfileSettings } from "./profile-settings";

export const metadata: Metadata = {
  title: "Profile",
  description: "Update your name and profile photo.",
};

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <ProfileSettings />
    </div>
  );
}
