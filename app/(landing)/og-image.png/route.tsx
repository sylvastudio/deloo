import { ImageResponse } from "next/og";

// GET /og-image.png: placeholder share card (wordmark + headline). TODO: replace with the gear flat-lay from §1.4.

export const dynamic = "force-static";
const size = { width: 1200, height: 630 };

/** Not the opengraph-image file convention: that resolves against the root layout, which has no metadataBase. */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0F6B73", color: "#FFFFFF" }}>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>
          deloo<span style={{ color: "#F2A900" }}>.</span>
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>
          Camera, light and sound gear for your shoot, delivered across Lagos.
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#E0EFEF" }}>Rent by the day · Refundable deposit · Pay with Paystack</div>
      </div>
    ),
    size,
  );
}
