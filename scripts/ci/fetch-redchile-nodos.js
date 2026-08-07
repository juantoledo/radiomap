#!/usr/bin/env node
/**
 * Renderiza https://redchile.org/#!/nodos (SPA con hash-routing) con Chromium
 * headless y vuelca el texto visible a un archivo, para que un paso posterior
 * (Claude) lo lea como datos de entrada — no ejecuta fetch simple porque el
 * contenido se arma en el cliente tras cargar JS.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const URL = "https://redchile.org/#!/nodos";
const OUT_PATH = process.argv[2] || "/tmp/redchile-nodos.txt";
const NAV_TIMEOUT_MS = 30000;
const RENDER_WAIT_MS = 5000;

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    // La SPA arma la tabla de nodos tras el mount inicial; sin selector estable
    // conocido, se espera un tiempo fijo adicional en vez de un selector frágil.
    await page.waitForTimeout(RENDER_WAIT_MS);

    const text = await page.evaluate(() => document.body.innerText);

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, text, "utf-8");

    console.log(`Volcado ${text.length} caracteres en ${OUT_PATH}`);
    if (text.trim().length === 0) {
      console.error("Advertencia: contenido vacío — la SPA pudo no renderizar a tiempo.");
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Error al renderizar redchile.org:", err);
  process.exit(1);
});
