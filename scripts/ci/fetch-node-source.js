#!/usr/bin/env node
/**
 * Renderiza una URL (posible SPA con hash-routing) con Chromium headless y
 * vuelca el texto visible a un archivo, para que un paso posterior (Claude)
 * lo lea como datos de entrada — no hace fetch simple porque el contenido
 * puede armarse en el cliente tras cargar JS.
 *
 * Uso: node fetch-node-source.js <url> <out-path>
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const URL = process.argv[2];
const OUT_PATH = process.argv[3];
const NAV_TIMEOUT_MS = 30000;
const RENDER_WAIT_MS = 5000;

if (!URL || !OUT_PATH) {
  console.error("Uso: node fetch-node-source.js <url> <out-path>");
  process.exit(2);
}

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    // Las SPAs arman su contenido tras el mount inicial; sin selector estable
    // conocido por sitio, se espera un tiempo fijo adicional en vez de un
    // selector frágil específico de cada fuente.
    await page.waitForTimeout(RENDER_WAIT_MS);

    const text = await page.evaluate(() => document.body.innerText);

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, text, "utf-8");

    console.log(`Volcado ${text.length} caracteres de ${URL} en ${OUT_PATH}`);
    if (text.trim().length === 0) {
      console.error(`Advertencia: contenido vacío para ${URL} — pudo no renderizar a tiempo.`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`Error al renderizar ${URL}:`, err);
  process.exit(1);
});
