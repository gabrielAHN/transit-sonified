import { defineRailway, github, project, service } from "railway/iac";

export const partial = "transit-sonified";

export default defineRailway(() => {
  const transitSonified = service("transit-sonified", {
    source: github("gabrielAHN/transit-sonified", { branch: "main" }),
    build: {
      builder: "RAILPACK",
      watchPatterns: [
        "src/**",
        "scripts/**",
        "public/**",
        "index.html",
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        "tsconfig.json",
        "components.json",
        "railpack.json",
        "Caddyfile",
      ],
    },
    healthcheck: "/",
    healthcheckTimeout: 60,
  });
  return project("transit-sonified", {
    resources: [transitSonified],
  });
});
