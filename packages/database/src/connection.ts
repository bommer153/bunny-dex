import dns from "node:dns";
import mongoose from "mongoose";

// Windows often fails mongodb+srv SRV lookups via the default DNS resolver.
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dns.setDefaultResultOrder("ipv4first");

let cached: typeof mongoose | null = null;

export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  if (cached && mongoose.connection.readyState === 1) {
    return cached;
  }
  mongoose.set("strictQuery", true);
  cached = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15_000,
    family: 4,
  });
  return cached;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  cached = null;
}

export { mongoose };
