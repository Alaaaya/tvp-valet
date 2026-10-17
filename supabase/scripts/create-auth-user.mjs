#!/usr/bin/env node
// Creates an identity only. An authenticated admin must then call manage_employee.
// No client can use this script or self-assign a profile.
import { createClient } from '@supabase/supabase-js'
async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TVP_EMPLOYEE_EMAIL, TVP_EMPLOYEE_PASSWORD } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TVP_EMPLOYEE_EMAIL || !TVP_EMPLOYEE_PASSWORD) {
    throw new Error('Set server-only SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TVP_EMPLOYEE_EMAIL and TVP_EMPLOYEE_PASSWORD.')
  }
  if (TVP_EMPLOYEE_PASSWORD.length < 16) throw new Error('Use a unique password of at least 16 characters.')
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  })
  const { data, error } = await client.auth.admin.createUser({
    email: TVP_EMPLOYEE_EMAIL, password: TVP_EMPLOYEE_PASSWORD, email_confirm: true
  })
  if (error || !data.user) throw new Error('Identity creation failed. Check the dashboard; no existing identity was modified.')
  console.log('Created identity ' + data.user.id + '. It has no app access until an admin calls manage_employee. No email sent.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
