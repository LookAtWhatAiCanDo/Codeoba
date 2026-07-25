import { Show } from "solid-js";
import { useI18n } from "../../../i18n/i18n";
import { Portal } from "solid-js/web";
import { X } from "lucide-solid";

export interface LightboxImage {
  path?: string;
  src: string;
}

export interface LightboxOverlayProps {
  activeLightboxImage: LightboxImage | null;
  onClose: () => void;
  onImageContextMenu: (e: MouseEvent, path?: string, src?: string) => void;
}

export const LightboxOverlay = (props: LightboxOverlayProps) => {
  const { t } = useI18n();

  return (
    <Portal>
      <Show when={props.activeLightboxImage}>
        {(src) => (
          <div
            class="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-200"
            onClick={props.onClose}
          >
            {/* Close button */}
            <button
              aria-label={t("common.close")}
              class="absolute top-4 right-4 text-white/70 hover:text-white hover:bg-white/10 p-2.5 rounded-full transition-all cursor-pointer"
              onClick={props.onClose}
            >
              <X class="w-6 h-6" />
            </button>

            {/* Fullscreen Image */}
            <img
              src={src().src}
              alt={t("detailPane.enlargedImage")}
              class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl border border-white/10 animate-in zoom-in duration-200"
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => props.onImageContextMenu(e, src().path, src().src)}
            />
          </div>
        )}
      </Show>
    </Portal>
  );
};
