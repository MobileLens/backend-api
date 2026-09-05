import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, jwt } from "better-auth/plugins";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { APIError } from "better-auth";

const isProd = process.env["NODE_ENV"] === "production";
const secretFromEnv = process.env["BETTER_AUTH_SECRET"];

if (isProd && !secretFromEnv) {
  throw new Error(
    "BETTER_AUTH_SECRET nie jest ustawiony w środowisku produkcyjnym. "
  );
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user:         schema.user,
      session:      schema.session,
      account:      schema.account,
      verification: schema.verification,
      jwks:         schema.jwks,
    },
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    passwordValidation: (password: string) => {
      console.log(">>> SPRAWDZAM HASŁO:", password); // <-- DODANO LOG
      const isStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/.test(password);
      if (!isStrong) {
        throw new APIError("BAD_REQUEST", { message: "Hasło musi mieć min. 8 znaków, wielką literę, cyfrę i znak specjalny." });
      }
      return true;
    },
  },

  secret: secretFromEnv ?? "dev-only-insecure-secret",
  baseURL: process.env["API_BASE_URL"] ?? "http://localhost:3000",

  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
    },
  },

  plugins: [
    bearer(),
                               jwt({
                                 jwks: {
                                   keyPairConfig: { alg: "EdDSA" },
                                 },
                               }),
  ],

  user: {
    additionalFields: {
      username: { type: "string", required: false, unique: true },
      role:     { type: "string", required: false, defaultValue: "user" },
    },
  },
});

export type Auth = typeof auth;
