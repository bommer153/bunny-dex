import mongoose from "mongoose";

let cached: typeof mongoose | null = null;

export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  if (cached && mongoose.connection.readyState === 1) {
    return cached;
  }
  mongoose.set("strictQuery", true);
  cached = await mongoose.connect(uri);
  return cached;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  cached = null;
}

export { mongoose };
