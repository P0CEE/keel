import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc";
import { describeImage } from "@keel/ai";

// Cap the inlined image at ~10 MB decoded; base64 inflates the string ~4/3.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 64;

/**
 * Accept ONLY a base64 `data:image/*` URL — the client inlines the image
 * bytes. The server never fetches a caller-supplied URL, which removes the
 * SSRF surface entirely (no private-range/redirect/DNS-rebinding guessing to
 * get wrong). A size cap keeps a single request from buffering arbitrary data.
 */
const imageDataUrlSchema = z
  .string()
  .max(MAX_DATA_URL_LENGTH, "image is too large")
  .regex(
    /^data:image\/(png|jpe?g|webp|gif|avif);base64,/,
    "image must be a base64 data: URL (data:image/...;base64,...)",
  );

/** AI helpers exposed to the product app. */
export const aiRouter = router({
  describeImage: protectedProcedure
    .input(z.object({ image: imageDataUrlSchema }))
    .mutation(({ input }) => {
      if (!process.env.OPENAI_API_KEY) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "OPENAI_API_KEY is not configured",
        });
      }
      return describeImage(input.image);
    }),
});
