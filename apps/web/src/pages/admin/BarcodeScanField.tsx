import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { normalizeBarcode } from "@volt/shared";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

function getDetector(): Detector | null {
  const Ctor = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector })
    .BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"] });
  } catch {
    return new Ctor();
  }
}

function prefersPhotoCapture() {
  if (typeof navigator === "undefined") return true;
  if (!navigator.mediaDevices?.getUserMedia) return true;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function createZxingReader() {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

function canvasFromImage(img: HTMLImageElement) {
  const max = 1600;
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > max ? max / longest : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function decodeFromCanvas(canvas: HTMLCanvasElement) {
  const native = getDetector();
  if (native) {
    const found = await native.detect(canvas);
    const code = found[0]?.rawValue ? normalizeBarcode(found[0].rawValue) : "";
    if (code) return code;
  }
  const reader = await createZxingReader();
  return normalizeBarcode(reader.decodeFromCanvas(canvas).getText());
}

async function decodePhoto(file: File) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return await decodeFromCanvas(canvasFromImage(img));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function BarcodeScanField({
  disabled,
  onScan,
  label = "Barcode",
  hint,
}: {
  disabled?: boolean;
  onScan: (code: string) => void;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [photoOnly, setPhotoOnly] = useState(prefersPhotoCapture);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    if (!camera || disabled || photoOnly) return;
    let controls: { stop: () => void } | null = null;
    let active = true;
    const last = { code: "", at: 0 };

    void (async () => {
      try {
        const reader = await createZxingReader();
        const video = videoRef.current;
        if (!video || !active) return;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video,
          (result) => {
            const code = result ? normalizeBarcode(result.getText()) : "";
            if (code && (code !== last.code || Date.now() - last.at > 1500)) {
              last.code = code;
              last.at = Date.now();
              onScan(code);
            }
          },
        );
        if (!active) controls.stop();
      } catch {
        if (!active) return;
        setCamera(false);
        setPhotoOnly(true);
        setCameraError("Live camera is blocked on this page. Take a photo of the barcode instead.");
      }
    })();

    return () => {
      active = false;
      controls?.stop();
    };
  }, [camera, disabled, onScan, photoOnly]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const code = normalizeBarcode(value);
    if (!code) return;
    onScan(code);
    setValue("");
    inputRef.current?.focus();
  }

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCameraError("");
    try {
      const code = await decodePhoto(file);
      if (!code) throw new Error("empty");
      onScan(code);
    } catch {
      setCameraError("Could not read a barcode from that photo. Hold closer, fill the frame, and try again.");
    }
  }

  return (
    <div className="barcode-scan">
      <form className="barcode-scan-form" onSubmit={submit}>
        <label className="field">
          <span>{label}</span>
          <input
            ref={inputRef}
            value={value}
            disabled={disabled}
            autoComplete="off"
            inputMode="numeric"
            placeholder="Scan or type, then Enter"
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button className="ghost" type="submit" disabled={disabled || !value.trim()}>
          Match
        </button>
        {photoOnly ? (
          <label className={`ghost barcode-camera-label${disabled ? " is-disabled" : ""}`}>
            Use camera
            <input type="file" accept="image/*" capture="environment" disabled={disabled} onChange={onPhoto} />
          </label>
        ) : (
          <button
            className="ghost"
            type="button"
            disabled={disabled}
            onClick={() => {
              setCameraError("");
              setCamera((open) => !open);
            }}
          >
            {camera ? "Stop camera" : "Use camera"}
          </button>
        )}
      </form>
      {hint && <p className="muted">{hint}</p>}
      {cameraError && <p className="banner error">{cameraError}</p>}
      {camera && !photoOnly && <video ref={videoRef} className="barcode-preview" muted playsInline />}
    </div>
  );
}
