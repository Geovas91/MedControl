import type { PostgrestError, User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AuthProfile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name" | "email">;
type ProfileResult = Promise<{ data: AuthProfile | null; error: PostgrestError | null }>;
type ProfileTable = {
  select(columns: "id, full_name, email"): {
    eq(column: "id", value: string): { maybeSingle(): ProfileResult };
  };
  upsert(values: AuthProfile, options: { onConflict: "id" }): {
    select(columns: "id, full_name, email"): { single(): ProfileResult };
  };
};
type ProfileSyncClient = { from(table: "profiles"): ProfileTable };

function metadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getAuthProfileValues(
  user: Pick<User, "id" | "email" | "user_metadata">,
  existingProfile: AuthProfile | null
): AuthProfile {
  const providerFullName = metadataString(user.user_metadata.full_name) ?? metadataString(user.user_metadata.name);
  const providerEmail = metadataString(user.user_metadata.email);

  return {
    id: user.id,
    full_name: metadataString(existingProfile?.full_name) ?? providerFullName,
    email: metadataString(user.email) ?? providerEmail ?? metadataString(existingProfile?.email)
  };
}

export async function syncAuthUserProfile(supabase: ServerSupabaseClient, user: User) {
  const profiles = (supabase as unknown as ProfileSyncClient).from("profiles");
  const { data: existingProfile, error: readError } = await profiles
    .select("id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) {
    return { profile: null, error: readError };
  }

  const profileValues = getAuthProfileValues(user, existingProfile);

  const { data: profile, error } = await profiles
    .upsert(profileValues, { onConflict: "id" })
    .select("id, full_name, email")
    .single();

  return { profile: profile ?? null, error };
}
