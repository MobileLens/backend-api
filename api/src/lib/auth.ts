import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, jwt } from "better-auth/plugins";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";

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
  },

  secret: process.env["BETTER_AUTH_SECRET"] ?? "change-me-in-production",
  baseURL: process.env["API_BASE_URL"] ?? "http://localhost:3000",

  plugins: [
    bearer(),
    jwt({
      jwks: {
        keyPairConfig: { alg: "EdDSA" },
      },
    }),
  ],

  // Expose custom user fields
  user: {
    additionalFields: {
      username: { type: "string", required: false, unique: true },
      role:     { type: "string", required: false, defaultValue: "user" },
    },
  },
});

export type Auth = typeof auth;
