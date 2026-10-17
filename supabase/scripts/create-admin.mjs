#!/usr/bin/env node
// Trusted operator machine only. Never import this module into client code.
import { createClient } from '@supabase/supabase-js'

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TVP_ADMIN_EMAIL, TVP_ADMIN_PASSWORD, TVP_ADMIN_NAME } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TVP_ADMIN_EMAIL || !TVP_ADMIN_PASSWORD || !TVP_ADMIN_NAME) {
    throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TVP_ADMIN_EMAIL, TVP_ADMIN_PASSWORD and TVP_ADMIN_NAME on the trusted server.')
  }
  if (TVP_ADMIN_PASSWORD.length < 16) throw new Error('Use a unique admin password of at least 16 characters.')
  if (!TVP_ADMIN_NAME.trim() || TVP_ADMIN_NAME.trim().length > 120) throw new Error('Invalid display name.')
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  })
  const { count, error: checkError } = await client.from('profiles').select('id', { count: 'exact', head: true }).eq('role','admin').eq('active',true)
  if (checkError) throw new Error('Cannot check profiles. Apply the migration and verify the server credentials first.')
  if (count > 0) throw new Error('An active admin already exists. Use manage_employee with an authenticated admin session instead.')
  // createUser with email_confirm does not send an invitation or confirmation email.
  const { data, error } = await client.auth.admin.createUser({
    email: TVP_ADMIN_EMAIL, password: TVP_ADMIN_PASSWORD, email_confirm: true
  })
  if (error || !data.user) throw new Error('Auth creation failed. Check the operator dashboard; no existing user was modified.')
  const { error: profileError } = await client.from('profiles').insert({
    id: data.user.id, full_name: TVP_ADMIN_NAME.trim(), email: data.user.email, role: 'admin', active: true
  })
  if (profileError) {
    // Never delete a pre-existing user. Only roll back the identity created above.
    const { error: cleanupError } = await client.auth.admin.deleteUser(data.user.id)
    throw new Error(cleanupError
      ? 'Profile creation failed and identity cleanup failed. Remove the newly created identity in the dashboard before retrying.'
      : 'Profile creation failed. Newly created identity was removed.')
  }
  console.log('First admin created. Sign in through the app. No email sent.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
