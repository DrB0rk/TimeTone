export function GET() {
  return Response.json({
    status: "ok",
    service: "esp-timekeep",
    time: new Date().toISOString(),
  });
}
