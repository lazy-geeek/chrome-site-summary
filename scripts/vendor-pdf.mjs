import { cpSync, mkdirSync } from "node:fs";
mkdirSync("vendor/pdfjs", { recursive: true });
for (const name of ["pdf.min.mjs", "pdf.worker.min.mjs"]) cpSync(`node_modules/pdfjs-dist/legacy/build/${name}`, `vendor/pdfjs/${name}`);
for (const name of ["LICENSE", "cmaps", "standard_fonts"]) cpSync(`node_modules/pdfjs-dist/${name}`, `vendor/pdfjs/${name}`, { recursive: true });
console.log("Local PDF.js assets updated.");
