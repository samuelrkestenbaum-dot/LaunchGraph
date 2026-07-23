// DISTRACTOR: a non-webhook route that reads no body. LG-004 must not apply.
export async function GET() {
  return new Response('ok');
}
