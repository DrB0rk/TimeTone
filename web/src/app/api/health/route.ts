export function GET() {
  return Response.json({
    status: "ok",
    service: "timetone",
    time: new Date().toISOString(),
  });
}
