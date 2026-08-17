/*
 * Authentication is resolved by app-v26-onboarding immediately before the
 * protected Edge Functions are called. Do not block the final onboarding
 * action from cached mirror state: it can lag behind Supabase after OAuth.
 */

