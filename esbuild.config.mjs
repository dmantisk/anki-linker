import esbuild from "esbuild";
import { copyFile, mkdir } from "fs/promises";
import process from "process";

const isProduction = process.argv[2] === "production";

esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: isProduction ? false : "inline",
  treeShaking: true,
  outfile: "dist/main.js",
})
  .then(async () => {
    await mkdir("dist", { recursive: true });
    await Promise.all([
      copyFile("manifest.json", "dist/manifest.json"),
      copyFile("styles.css", "dist/styles.css"),
    ]);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
