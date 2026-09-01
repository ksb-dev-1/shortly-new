function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT) || 5000,
  NODE_ENV: process.env.NODE_ENV ?? "development",
  IS_PRODUCTION: process.env.NODE_ENV === "production",

  // Set by .env.test. The rate limiters read this and step aside: their
  // counters live in memory for the life of the process, so a test file making
  // six signup requests would otherwise be throttled by the fifth and fail for
  // a reason that has nothing to do with what it is testing.
  IS_TEST: process.env.NODE_ENV === "test",
  DATABASE_URL: requireEnv("DATABASE_URL"),
  ACCESS_TOKEN_SECRET: requireEnv("ACCESS_TOKEN_SECRET"),
  RESEND_API_KEY: requireEnv("RESEND_API_KEY"),
  EMAIL_FROM: requireEnv("EMAIL_FROM"),
  FRONTEND_URL: requireEnv("FRONTEND_URL"),

  CLOUDINARY_CLOUD_NAME: requireEnv("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY: requireEnv("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: requireEnv("CLOUDINARY_API_SECRET"),

  // Number of reverse proxies in front of the app; 0 means direct connections.
  // Rate limiting keys on req.ip, which is only correct when this is accurate.
  TRUST_PROXY: Number(process.env.TRUST_PROXY) || 0,
} as const;
