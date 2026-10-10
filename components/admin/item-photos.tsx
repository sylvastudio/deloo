"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addItemPhoto } from "@/app/admin/_actions/inventory";
import { createClient } from "@/lib/supabase/client";

/** Resize to 2000px on the long edge as JPEG (the items bucket takes up to 5 MB). */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (blob) return blob;
  } catch {
    // fall through to the original
  }
  return file;
}

/** Uploads listing photos straight to the public `items` bucket at <vendor id>/<item id>-<time>.jpg. */
export function ItemPhotoUpload({ itemId, vendorId, disabled }: { itemId: string; vendorId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const db = createClient();
    let n = 0;
    for (const f of [...files]) {
      n += 1;
      setBusy(`Uploading ${n} of ${files.length}…`);
      try {
        const blob = await shrink(f);
        if (blob.size > 5 * 1024 * 1024) throw new Error(`${f.name} is still over 5 MB.`);
        const path = `${vendorId}/${itemId}-${Date.now()}-${n}.jpg`;
        const { error: up } = await db.storage.from("items").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
        if (up) throw new Error(up.message);
        const r = await addItemPhoto({ itemId, path });
        if (r.error) throw new Error(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      }
    }
    setBusy("");
    router.refresh();
  }

  return (
    <div className="grid gap-1">
      <label className="btn btn-secondary btn-sm" aria-disabled={disabled || !!busy} style={{ justifySelf: "start" }}>
        {busy || "Upload photos"}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple hidden disabled={disabled || !!busy}
          onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
