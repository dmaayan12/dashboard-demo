// A single shared entry code, checked server-side (not just a client-side gate) - so calling the
// Worker directly still gets blocked. env.ENTRY_CODE is a Cloudflare secret, set via the
// dashboard - see README.md's deployment section for the demo value used here (not the real
// production value, which this project never had access to in the first place).
export function checkEntryCode(request, env) {
  const provided = request.headers.get('X-Entry-Code');
  return provided === env.ENTRY_CODE;
}
