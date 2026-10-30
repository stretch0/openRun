import { type CSSProperties, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import type { LogoPlacement } from '@openrun/schemas';

type Fit = LogoPlacement['fit'];

/**
 * Shows a picked image as the square logo it will become, before uploading.
 * "Fill the square" crops it (drag to move, zoom to crop tighter); "Fit whole
 * image" shrinks it to fit, for wordmarks and other wide or tall logos. The
 * server does the actual cut. Loaded lazily: the cropper is only needed here.
 */
export default function LogoPicker({
  imageUrl,
  saving,
  onSave,
  onCancel,
}: {
  /** An object URL for the picked file; the caller revokes it. */
  imageUrl: string;
  saving: boolean;
  onSave: (placement: LogoPlacement) => void;
  onCancel: () => void;
}) {
  const [fit, setFit] = useState<Fit>('fill');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  /** Percentages of the image, as the cropper reports them. */
  const [area, setArea] = useState<Area | null>(null);

  const save = () => {
    if (fit === 'whole' || !area) {
      onSave(fit === 'whole' ? { fit } : { fit: 'fill', ...MIDDLE });
      return;
    }
    const f = (n: number) => Math.min(Math.max(n / 100, 0), 1);
    onSave({
      fit: 'fill',
      x: f(area.x),
      y: f(area.y),
      width: f(area.width),
      height: f(area.height),
    });
  };

  return (
    <div className="space-y-3" aria-label="New logo" role="group">
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <legend className="sr-only">How the image fits the square</legend>
        {(
          [
            ['fill', 'Fill the square'],
            ['whole', 'Fit whole image'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="logoFit"
              className="accent-brand-600"
              checked={fit === value}
              onChange={() => setFit(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <div className="relative aspect-square w-full max-w-64 overflow-hidden rounded-xl bg-white ring-1 ring-black/5 dark:ring-white/10">
          {fit === 'fill' ? (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              // The image covers the box, so the box itself is the logo.
              objectFit="cover"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={setArea}
              style={{
                containerStyle: { backgroundColor: 'white' },
                cropAreaStyle: { border: 'none', color: 'transparent' },
              }}
            />
          ) : (
            <img src={imageUrl} alt="" className="size-full object-contain" />
          )}
        </div>
        {/* How it will look in lists and on run cards. */}
        <div className="flex items-end gap-3" aria-hidden>
          <span
            className="size-10 rounded-lg bg-white ring-1 ring-black/5 dark:ring-white/10"
            style={previewStyle(imageUrl, fit, area)}
          />
          <span
            className="size-6 rounded-md bg-white ring-1 ring-black/5 dark:ring-white/10"
            style={previewStyle(imageUrl, fit, area)}
          />
        </div>
      </div>

      {fit === 'fill' ? (
        <div className="max-w-64">
          <label className="label" htmlFor="logoZoom">
            Zoom
          </label>
          <input
            id="logoZoom"
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-brand-600"
          />
          <p className="mt-1 text-xs text-stone-500">
            Drag the image to choose which part to keep.
          </p>
        </div>
      ) : (
        <p className="text-xs text-stone-500">
          The whole image is shown, with white space around it.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={saving}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save logo'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Before the cropper has reported an area: the middle of the image. */
const MIDDLE = { x: 0, y: 0, width: 1, height: 1 };

/** The chosen square drawn as a background, for the small previews. */
function previewStyle(
  imageUrl: string,
  fit: Fit,
  area: Area | null,
): CSSProperties {
  const image = { backgroundImage: `url("${imageUrl}")` };
  if (fit === 'whole' || !area) {
    return {
      ...image,
      backgroundSize: fit === 'whole' ? 'contain' : 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  // Scale the image so the chosen area fills the box, then line it up.
  const at = (offset: number, size: number) =>
    size >= 100 ? 0 : (offset / (100 - size)) * 100;
  return {
    ...image,
    backgroundSize: `${10000 / area.width}% ${10000 / area.height}%`,
    backgroundPosition: `${at(area.x, area.width)}% ${at(area.y, area.height)}%`,
    backgroundRepeat: 'no-repeat',
  };
}
