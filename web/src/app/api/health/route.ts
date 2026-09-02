import packageInfo from "../../../../package.json";

export function GET() {
  return Response.json({
    status: "ok",
    service: "timetone",
    version: packageInfo.version,
    time: new Date().toISOString(),
  });
}
