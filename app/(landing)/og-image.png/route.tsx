import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// GET /og-image.png: placeholder share card (wordmark + headline). TODO: replace with the gear flat-lay from §1.4.

export const dynamic = "force-static";
const size = { width: 1200, height: 630 };

// Brand fonts (OFL, Google Fonts), so the card doesn't fall back to the renderer's default sans.
const fontDir = join(process.cwd(), "lib/landing/fonts");
const bricolage = readFile(join(fontDir, "BricolageGrotesque-Bold.ttf"));
const atkinson = readFile(join(fontDir, "AtkinsonHyperlegibleNext-Regular.ttf"));

/** Not the opengraph-image file convention: that resolves against the root layout, which has no metadataBase. */
export async function GET() {
  const [display, body] = await Promise.all([bricolage, atkinson]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0F6B73", color: "#FFFFFF", fontFamily: "Atkinson" }}>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 72, letterSpacing: -2 }}>
          deloo<span style={{ color: "#F2A900" }}>.</span>
        </div>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 64, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 1000 }}>
          Camera, light and sound gear for your shoot, delivered across Lagos.
        </div>
        <div style={{ display: "flex", fontSize: 30 }}>Rent by the day · No deposit · Pay with Paystack</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bricolage", data: display, style: "normal", weight: 700 },
        { name: "Atkinson", data: body, style: "normal", weight: 400 },
      ],
    },
  );
}
