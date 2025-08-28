// 🚀 Dependencias (instalá con: npm install node-fetch)
import fetch from "node-fetch";

// ---------------- CONFIG ----------------
const API_URL = "https://arajet-api.ezycommerce.sabre.com/api/v1/Availability/SearchLowestFare";

const port = process.env.PORT || 4000 

const OUTBOUND_DATES = [
  "2026-06-03T00:00:00",
  "2026-06-12T00:00:00",
  "2026-06-15T00:00:00",
  "2026-06-17T00:00:00",
  "2026-06-19T00:00:00",
  "2026-06-22T00:00:00",
  "2026-06-24T00:00:00",
  "2026-06-26T00:00:00",
  "2026-06-29T00:00:00"
];

const RETURN_DATES = [
  "2026-07-21T00:00:00",
  "2026-07-23T00:00:00",
  "2026-07-26T00:00:00",
  "2026-07-28T00:00:00",
  "2026-07-30T00:00:00"
];

const BASE_PAYLOAD = {
  passengers: [
    { code: "ADT", count: 2 },
    { code: "CHD", count: 2 },
    { code: "INF", count: 0 }
  ],
  routes: [
    {
      fromAirport: "SCL",
      toAirport: "MIA",
      departureDate: "2026-06-24",
      startDate: "2026-06-01",
      endDate: "2026-06-30"
    },
    {
      fromAirport: "MIA",
      toAirport: "SCL",
      departureDate: "2026-07-28",
      startDate: "2026-07-01",
      endDate: "2026-07-31"
    }
  ],
  currency: "USD",
  fareTypeCategories: null,
  isManageBooking: false,
  languageCode: "es-do"
};

const PRICE_THRESHOLD = 700;
console.log("🚀 Buscando vuelos menores de:", PRICE_THRESHOLD);

// ---------------- Helpers ----------------
const getDateRaw = f => String(f?.departureDate ?? f?.date ?? "");
const toYMD = s => {
  if (!s) return "";
  const str = String(s);
  const m = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : str;
};
const numberVal = x => (typeof x === "number" ? x : parseFloat(String(x).replace(",", ".")));

// ---------------- Telegram ----------------
async function sendToTelegram(texto) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  const body = {
    chat_id: CHAT_ID,
    text: texto,
    parse_mode: "Markdown"
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    console.log("✅ Enviado a Telegram");
  } catch (e) {
    console.error("❌ Error al enviar a Telegram:", e);
  }
}

// ---------------- Lógica principal ----------------
async function buscarVuelos() {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "appcontext": "ibe",
        "languagecode": "es-do",
        "tenant-identifier": "caTRCudVPKmnHNnNeTgD3jDHwtsVvNtTmVHnRhYQzEqVboamwZp6fDEextRR8DAB",
        "x-clientversion": "0.5.3617",
        "x-useridentifier": "q3SUgiU0c8VOvSbaZpLxob5l6tnljB"
      },
      body: JSON.stringify(BASE_PAYLOAD)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const outboundFlights = data?.routes?.[0]?.flights ?? [];
    const returnFlights   = data?.routes?.[1]?.flights ?? [];

    console.log("📊 Opciones de IDA (todas):");
    console.table(outboundFlights.map(f => ({
      fecha: toYMD(getDateRaw(f)),
      precio: numberVal(f.pricePerPassenger)
    })));

    console.log("📊 Opciones de VUELTA (todas):");
    console.table(returnFlights.map(f => ({
      fecha: toYMD(getDateRaw(f)),
      precio: numberVal(f.pricePerPassenger)
    })));

    let mejor = null;

    for (const of of outboundFlights) {
      const idaRaw = getDateRaw(of);
      if (!OUTBOUND_DATES.includes(idaRaw)) continue;

      for (const rf of returnFlights) {
        const vueltaRaw = getDateRaw(rf);
        if (!RETURN_DATES.includes(vueltaRaw)) continue;

        const precioTotal = numberVal(of.pricePerPassenger) + numberVal(rf.pricePerPassenger);
        if (precioTotal < PRICE_THRESHOLD) {
          if (!mejor || precioTotal < mejor.precioTotal) {
            mejor = {
              idaRaw,
              vueltaRaw,
              precioIda: numberVal(of.pricePerPassenger),
              precioVuelta: numberVal(rf.pricePerPassenger),
              precioTotal
            };
          }
        }
      }
    }

    if (mejor) {
      const idaYMD = toYMD(mejor.idaRaw);
      const vueltaYMD = toYMD(mejor.vueltaRaw);

      const msg =
        `🎯 *Vuelo encontrado!*\n\n` +
        `Ida: ${idaYMD} - $${mejor.precioIda}\n` +
        `Vuelta: ${vueltaYMD} - $${mejor.precioVuelta}\n` +
        `💰 Total: $${mejor.precioTotal}\n\n` +
        `🔗 https://www.arajet.com/es/select?from=SCL&to=MIA&departureDate=${idaYMD}&returnDate=${vueltaYMD}&adt=2&chd=2&inf=0&currency=USD`;

      console.log(msg);
      await sendToTelegram(msg);
    } else {
      console.log(`⚠️ No hay combinaciones ida+vuelta con total < ${PRICE_THRESHOLD}.`);
    }
  } catch (err) {
    console.error("❌ Error en consulta:", err);
  }
}

// ---------------- Loop automático ----------------
buscarVuelos(); // primera vez

// cada 5 min
setInterval(buscarVuelos, 5 * 60 * 1000);
