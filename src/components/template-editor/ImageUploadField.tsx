import { useEffect, useRef, useState } from "react";
import { AlertCircle, ImageIcon, Loader2, Upload } from "lucide-react";
import { getPublicUrl } from "@/lib/storageUtils";
import { supabase } from "@/lib/supabase";
import {
  ALLOWED_TEMPLATE_IMAGE_MIME_TYPES,
  uploadTemplateBackground,
  validateTemplateImage,
} from "@/services/templateImageUpload";

interface ImageUploadFieldProps {
  currentPath: string | null;
  onUploaded: (path: string) => void;
  disabled?: boolean;
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function ImageUploadField({ currentPath, onUploaded, disabled }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    currentPath ? getPublicUrl(currentPath) : null,
  );

  useEffect(() => {
    setPreviewUrl(currentPath ? getPublicUrl(currentPath) : null);
  }, [currentPath]);

  async function handleFile(file: File) {
    const validationError = validateTemplateImage(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploadError(null);
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    try {
      const path = await uploadTemplateBackground(file, await getToken());
      onUploaded(path);
      setPreviewUrl(getPublicUrl(path));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
      setPreviewUrl(currentPath ? getPublicUrl(currentPath) : null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Background Image
      </label>
      <div
        className="relative rounded-xl border-2 border-dashed border-border bg-muted/25 overflow-hidden cursor-pointer hover:border-primary/40 transition-colors"
        style={{ aspectRatio: "16/9", minHeight: 120 }}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Template background" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-45" />
            <span className="text-xs">Click to upload background</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        )}
        {!disabled && !uploading && previewUrl && (
          <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
            <Upload className="h-6 w-6 text-white" />
          </div>
        )}
      </div>
      {uploadError && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />{uploadError}
        </p>
      )}
      {currentPath && (
        <p className="text-[10px] text-muted-foreground font-mono truncate">{currentPath}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TEMPLATE_IMAGE_MIME_TYPES.join(",")}
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
