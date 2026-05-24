import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const kinds = ["ms", "lf", "qn", "lm", "tm", "dds", "ds", "mm", "fd", "ss"];
const sources = {
  ms: process.env.MS_URL,
  lf: process.env.LF_URL,
  qn: process.env.QN_URL,
  lm: process.env.LM_URL,
  tm: process.env.TM_URL,
  dds: process.env.DDS_URL,
  ds: process.env.DS_URL,
  mm: process.env.MM_URL,
  fd: process.env.FD_URL,
  ss: process.env.SS_URL,
};

const OUT = "./files";

const hdr = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 Chrome/131",
};

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function compact(v) {
  if (Array.isArray(v)) {
    return v.map(compact);
  }

  if (v && typeof v === "object") {
    const skip = new Set([8, 13, 14, 21, 23]);

    return Object.values(v).reduce((acc, curr, idx) => {
      const n = idx + 1;

      if (skip.has(n)) {
        return acc;
      }

      acc[`f${n}`] = compact(curr);

      return acc;
    }, {});
  }

  if (typeof v === "string") {
    const cleaned = v
      .replace(/\u0000+/g, "")
      .replace(/\s+[0-9a-z]{7}$/i, "")
      .trim();

    return cleaned || null;
  }

  return v;
}

async function getState(dir) {
  const files = await fs.readdir(dir);

  const zeroPath = path.join(dir, "0.jsonl");

  const hasZero = files.includes("0.jsonl");

  if (hasZero) {
    const raw = await fs.readFile(zeroPath, "utf8");

    const lines = raw.split("\n").filter(Boolean);

    return {
      hasZero: true,
      next: lines.length + 1,
    };
  }

  const ids = files
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => Number.parseInt(f, 10))
    .filter(Number.isFinite);

  return {
    hasZero: false,
    next: ids.length ? Math.max(...ids) + 1 : 1,
  };
}

for (const kind of kinds) {
  const dir = path.join(OUT, kind);

  await fs.mkdir(dir, {
    recursive: true,
  });

  const state = await getState(dir);

  let idx = state.next;

  while (true) {
    try {
      const endpoint = `${sources[kind]}/${idx}`;

      const res = await fetch(endpoint, {
        headers: hdr,
      });

      if (!res.ok) {
        if (res.status === 500) {
          break;
        }

        idx++;

        await pause(1500);

        continue;
      }

      const payload = await res.json();

      const mapped = compact(payload);

      if (!state.hasZero) {
        const zeroFile = path.join(dir, "0.jsonl");

        await fs.appendFile(zeroFile, JSON.stringify(mapped) + "\n", "utf8");
      } else {
        const file = path.join(dir, `${idx}.jsonl`);

        await fs.writeFile(file, JSON.stringify(mapped), "utf8");
      }

      console.log(`[${kind}] saved ${idx}`);

      idx++;

      await pause(250);
    } catch (e) {
      console.error(`[${kind}] fail`);

      await pause(2000);
    }
  }
}

console.log("done");
