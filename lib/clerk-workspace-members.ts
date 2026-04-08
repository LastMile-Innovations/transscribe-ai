/** Structural shape of Clerk Backend `User` — avoids importing `@clerk/backend` types (duplicate package resolution). */
export type ClerkUserPublic = {
  id: string
  primaryEmailAddressId: string | null
  emailAddresses: { id: string; emailAddress: string }[]
  firstName: string | null
  lastName: string | null
  imageUrl: string
}

type ClerkUsersListClient = {
  users: {
    getUserList: (params: {
      emailAddress?: string[]
      query?: string
      userId?: string[]
      limit?: number
    }) => Promise<{ data: ClerkUserPublic[] }>
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const FULL_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

export function isLikelyFullEmail(q: string): boolean {
  return FULL_EMAIL.test(q.trim())
}

export function primaryEmailString(user: ClerkUserPublic): string | null {
  const primaryId = user.primaryEmailAddressId
  if (primaryId) {
    const found = user.emailAddresses.find((a) => a.id === primaryId)
    if (found) return found.emailAddress
  }
  return user.emailAddresses[0]?.emailAddress ?? null
}

export function displayNameFromUser(user: ClerkUserPublic): string | null {
  const t = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return t || null
}

export function clerkUserToSearchHit(user: ClerkUserPublic) {
  const email = primaryEmailString(user)
  const displayName = displayNameFromUser(user)
  return {
    id: user.id,
    email,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl || null,
    displayName: displayName ?? email ?? user.id,
  }
}

export function clerkUserToMemberEnrichment(user: ClerkUserPublic) {
  const email = primaryEmailString(user)
  const displayName = displayNameFromUser(user)
  return {
    email,
    displayName: displayName ?? email ?? null,
    imageUrl: user.imageUrl || null,
  }
}

export async function resolveUserIdFromNormalizedEmail(
  clerk: ClerkUsersListClient,
  normalizedEmail: string,
): Promise<{ ok: true; userId: string } | { ok: false; message: string; status: number }> {
  const { data } = await clerk.users.getUserList({
    emailAddress: [normalizedEmail],
    limit: 10,
  })
  if (data.length === 0) {
    return { ok: false, message: 'No user found with that email', status: 404 }
  }
  const exactPrimary = data.find((u) => {
    const e = primaryEmailString(u)
    return e && normalizeEmail(e) === normalizedEmail
  })
  const withEmail = data.find((u) =>
    u.emailAddresses.some((a) => normalizeEmail(a.emailAddress) === normalizedEmail),
  )
  const user = exactPrimary ?? withEmail ?? data[0]
  return { ok: true, userId: user.id }
}
