/**
 * Where the project is, and the key every client carries.
 *
 * Here rather than in either app because both speak to the same project, and
 * a URL written twice is a URL that drifts -- the day it changes, one of the
 * two would go on asking the old one and the failure would look like a
 * network problem rather than a stale constant.
 *
 * Both values are public by design. The anon key is a JWT whose payload says
 * `"role": "anon"`, and every client that speaks to the project has to carry
 * it; shipping it in the app is the intended arrangement, not a leak. The
 * boundary is row level security, which `supabase/migrations/0001_tasks.sql`
 * puts on the table and `supabase/verify.js` checks against the live project.
 *
 * `service_role` must never appear here or anywhere else in either app. It
 * bypasses RLS completely.
 *
 * Each platform layers its own overrides on top: the desktop reads
 * `NEKAN_SUPABASE_URL` so a dev run can point at a second project without
 * sharing rows with the one verify.js writes to. This file has no way to read
 * an environment and should not grow one -- it cannot know what a phone would
 * even mean by that.
 */

export const SUPABASE_URL = "https://bycfderwvgceffqorkup.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5Y2ZkZXJ3dmdjZWZmcW9ya3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4OTE4NTIsImV4cCI6MjEwMTQ2Nzg1Mn0.qh8jKRtKdJ9-_GSSHwtD35_VWS-YOR0sb9edyoORFt8";
