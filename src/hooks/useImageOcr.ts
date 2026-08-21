import { useCallback, useEffect, useRef, useState } from "react";
import {
  extractTextFromImageBrowser,
  OCR_ALLOWED_MIME,
  OCR_MAX_FILE_BYTES,
} from "@/services/ocrService";

const ALLOWED_MIME_TYPES = OCR_ALLOWED_MIME as readonly string[];
const MAX_FILE_SIZE_MB = OCR_MAX_FILE_BYTES / (1024 * 1024);

export const OCR_IMAGE_MAX_SIZE_MB = MAX_FILE_SIZE_MB;

function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UseImageOcrOptions {
  disabled: boolean;
  onClaim: (claim: string) => void;
}

export function useImageOcr({ disabled, onClaim }: UseImageOcrOptions) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrSuccess, setOcrSuccess] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const processFile = useCallback(async (file: File) => {
    if (disabled) return;
    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      setOcrError("Hindi supportado ang format na ito. Gamitin ang JPG, PNG, o WebP.");
      return;
    }
    if (file.size > OCR_MAX_FILE_BYTES) {
      setOcrError(`Masyadong malaki ang file (${formatFileSize(file.size)}). Hanggang ${MAX_FILE_SIZE_MB} MB lang ang puwedeng i-upload.`);
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    setFileSize(formatFileSize(file.size));
    setOcrError(null);
    setOcrSuccess(false);
    setIsExtracting(true);

    try {
      const result = await extractTextFromImageBrowser(file);
      const claim = (result.suggestedClaim?.trim() || result.text?.trim()) ?? "";
      if (result.success) {
        if (claim) {
          onClaim(claim);
          setOcrSuccess(true);
        } else {
          setOcrError("Walang nahanap na teksto sa larawan. Subukan ang mas malinaw na screenshot.");
        }
      } else {
        setOcrError(
          result.error ??
          "Hindi nakuha ang teksto mula sa larawan. Subukan ang ibang larawan o i-type na lang ang claim.",
        );
      }
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : "Hindi ma-konekta sa OCR service. Subukang muli.");
    } finally {
      setIsExtracting(false);
    }
  }, [disabled, onClaim, preview]);

  const handleFiles = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (file) void processFile(file);
  }, [processFile]);

  const removeImage = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName(null);
    setFileSize(null);
    setOcrError(null);
    setOcrSuccess(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [preview]);

  return {
    inputRef,
    preview,
    fileName,
    fileSize,
    isExtracting,
    ocrError,
    ocrSuccess,
    handleFiles,
    removeImage,
    clearError: () => setOcrError(null),
  };
}
