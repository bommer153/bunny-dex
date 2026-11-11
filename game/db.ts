import mongoose from "mongoose";

// Cached on globalThis so Next.js dev hot-reload doesn't open a new connection per reload.
const g = globalThis as unknown as { __bdMongo?: Promise<typeof mongoose> };

export function connectDb(uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/bunnydex_v2") {
  g.__bdMongo ??= mongoose.connect(uri);
  return g.__bdMongo;
}
