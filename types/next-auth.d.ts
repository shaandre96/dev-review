import type { DefaultSession } from "next-auth";
import type { TierId } from "@/lib/tiers";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tier: TierId;
    } & DefaultSession["user"];
  }
}
