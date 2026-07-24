import { createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Check, Search, ExternalLink, Folder, Volume2 } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";
import { useSpeech } from "../../../utils/useSpeech";
import { copySvgAsPng } from "../../../utils/imageExport";
import { useContextMenuPosition } from "../../../utils/contextMenu";
import { Session } from "../../../types";

export interface ContextMenuState {
  x: number;
  y: number;
  text: string;
  type: "user" | "assistant" | "tool" | "image";
  extra?: string;
  imagePath?: string;
  imageSrc?: string;
  sessionId?: string;
  turnIndex?: number;
  clickedText?: string;
  mermaidWrapper?: HTMLElement;
  mermaidContainer?: HTMLElement;
}

export interface DetailContextMenuProps {
  contextMenu: ContextMenuState | null;
  setContextMenu: (val: ContextMenuState | null) => void;
  menuPosition: ReturnType<typeof useContextMenuPosition>;
  session: Session | null;
}

export const DetailContextMenu = (props: DetailContextMenuProps) => {
  const { t } = useI18n();
  const speech = useSpeech();

  return (
    <Portal>
      <Show when={props.contextMenu}>
        {(context) => {
          const [copiedText, setCopiedText] = createSignal(false);
          const [copiedImage, setCopiedImage] = createSignal(false);

          const handleCopyText = async () => {
            try {
              await navigator.clipboard.writeText(context().text);
              setCopiedText(true);
              setTimeout(() => {
                setCopiedText(false);
                props.setContextMenu(null);
              }, 800);
            } catch (err) {
              console.error("Failed to copy context text:", err);
            }
          };

          const handleCopyImage = async () => {
            try {
              const src = context().imageSrc || context().extra;
              if (!src) return;

              if (src.startsWith("data:image/svg+xml")) {
                await copySvgAsPng(src);
                setCopiedImage(true);
                setTimeout(() => {
                  setCopiedImage(false);
                  props.setContextMenu(null);
                }, 800);
                return;
              }

              const response = await fetch(src);
              const blob = await response.blob();
              await navigator.clipboard.write([
                new ClipboardItem({
                  [blob.type]: blob,
                }),
              ]);
              setCopiedImage(true);
              setTimeout(() => {
                setCopiedImage(false);
                props.setContextMenu(null);
              }, 800);
            } catch (err) {
              console.error("Failed to copy image:", err);
            }
          };

          const handleShowInFolder = async () => {
            try {
              const path = context().imagePath || context().text;
              if (!path) return;
              await invoke("reveal_image_in_folder", { path });
              props.setContextMenu(null);
            } catch (err) {
              console.error("Failed to reveal file:", err);
            }
          };

          const getLabel = () => {
            if (context().type === "user" || context().type === "assistant") {
              return t("detailPane.copyMessageText");
            }
            return t("detailPane.copyToolOutput");
          };

          const isImage = () => context().type === "image";
          const isSelection = () => context().extra === "selected-text";

          return (
            <div
              ref={props.menuPosition.ref}
              class="fixed bg-surface border border-border rounded-xl shadow-xl w-56 py-1.5 z-[10001] select-none transition-opacity duration-75 text-xs text-text-primary"
              style={{
                top: `${props.menuPosition.pos().top}px`,
                left: `${props.menuPosition.pos().left}px`,
                opacity: props.menuPosition.pos().visible ? 1 : 0,
                "pointer-events": props.menuPosition.pos().visible ? "auto" : "none",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Show when={isSelection()}>
                {/* Text Selection Actions */}
                <button
                  class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                  onClick={handleCopyText}
                >
                  <Show when={copiedText()} fallback={<Copy class="w-3.5 h-3.5" />}>
                    <Check class="w-3.5 h-3.5 text-emerald-400" />
                  </Show>
                  <span>{copiedText() ? t("common.copied") : t("detailPane.copySelection")}</span>
                </button>

                <button
                  class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                  onClick={() => {
                    invoke("open_external_url", {
                      url: `https://www.google.com/search?q=${encodeURIComponent(context().text)}`,
                    });
                    props.setContextMenu(null);
                  }}
                >
                  <Search class="w-3.5 h-3.5" />
                  <span>{t("detailPane.searchWithGoogle")}</span>
                </button>

                <button
                  class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                  onClick={() => {
                    invoke("open_external_url", {
                      url: `https://translate.google.com/?sl=auto&text=${encodeURIComponent(context().text)}`,
                    });
                    props.setContextMenu(null);
                  }}
                >
                  <ExternalLink class="w-3.5 h-3.5" />
                  <span>{t("detailPane.translateSelection")}</span>
                </button>

                {/* Append Image Operations if selection is inside an image */}
                <Show when={isImage()}>
                  <div class="h-[1px] bg-border/20 my-1" />

                  <button
                    class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                    onClick={handleCopyImage}
                  >
                    <Show when={copiedImage()} fallback={<Copy class="w-3.5 h-3.5" />}>
                      <Check class="w-3.5 h-3.5 text-emerald-400" />
                    </Show>
                    <span>{copiedImage() ? t("common.copied") : t("detailPane.copyImage")}</span>
                  </button>

                  <Show when={context().imagePath}>
                    <button
                      class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                      onClick={handleShowInFolder}
                    >
                      <Folder class="w-3.5 h-3.5" />
                      <span>
                        {navigator.userAgent.includes("Mac")
                          ? t("detailPane.showInFinder")
                          : t("detailPane.showInFolder")}
                      </span>
                    </button>
                  </Show>
                </Show>

                <Show when={context().type === "assistant" || context().type === "user"}>
                  <div class="h-[1px] bg-border/20 my-1" />
                  <button
                    class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                    onClick={() => {
                      const sid = context().sessionId;
                      const tid = context().turnIndex;
                      const text = context().clickedText || "";
                      if (sid !== undefined && tid !== undefined && props.session) {
                        speech.playFromHere(sid, tid, text, {
                          sourceId: props.session.sourceId,
                          filePath: props.session.filePath,
                        });
                      }
                      props.setContextMenu(null);
                    }}
                  >
                    <Volume2 class="w-3.5 h-3.5" />
                    <span>{t("readAloud.playFromHere")}</span>
                  </button>
                </Show>
              </Show>

              <Show when={isImage() && !isSelection()}>
                {/* Pure Image Actions */}
                <button
                  class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                  onClick={handleCopyImage}
                >
                  <Show when={copiedImage()} fallback={<Copy class="w-3.5 h-3.5" />}>
                    <Check class="w-3.5 h-3.5 text-emerald-400" />
                  </Show>
                  <span>{copiedImage() ? t("common.copied") : t("detailPane.copyImage")}</span>
                </button>

                <Show when={context().text}>
                  <button
                    class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                    onClick={handleShowInFolder}
                  >
                    <Folder class="w-3.5 h-3.5" />
                    <span>
                      {navigator.userAgent.includes("Mac")
                        ? t("detailPane.showInFinder")
                        : t("detailPane.showInFolder")}
                    </span>
                  </button>
                </Show>
              </Show>

              <Show when={!isImage() && !isSelection()}>
                {/* Standard Bubble Text Actions */}
                <button
                  class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                  onClick={handleCopyText}
                >
                  <Show when={copiedText()} fallback={<Copy class="w-3.5 h-3.5" />}>
                    <Check class="w-3.5 h-3.5 text-emerald-400" />
                  </Show>
                  <span>{copiedText() ? t("common.copied") : getLabel()}</span>
                </button>

                <Show when={context().type === "assistant" || context().type === "user"}>
                  <button
                    class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                    onClick={() => {
                      const sid = context().sessionId;
                      const tid = context().turnIndex;
                      const text = context().clickedText || "";
                      if (sid !== undefined && tid !== undefined && props.session) {
                        speech.playFromHere(sid, tid, text, {
                          sourceId: props.session.sourceId,
                          filePath: props.session.filePath,
                        });
                      }
                      props.setContextMenu(null);
                    }}
                  >
                    <Volume2 class="w-3.5 h-3.5" />
                    <span>{t("readAloud.playFromHere")}</span>
                  </button>
                </Show>
              </Show>

              <Show when={context().mermaidWrapper && context().mermaidContainer}>
                <div class="h-[1px] bg-border/20 my-1" />

                <Show when={context().mermaidWrapper!.getAttribute("data-show-raw") !== "true"}>
                  <button
                    class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                    onClick={async () => {
                      const svgEl = context().mermaidContainer?.querySelector("svg");
                      if (svgEl) {
                        try {
                          const svgString = new XMLSerializer().serializeToString(svgEl);
                          const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
                          await copySvgAsPng(svgDataUrl, svgEl);
                          setCopiedImage(true);
                          setTimeout(() => {
                            setCopiedImage(false);
                            props.setContextMenu(null);
                          }, 800);
                          return;
                        } catch (err) {
                          console.error("Failed to copy mermaid diagram:", err);
                        }
                      }
                      props.setContextMenu(null);
                    }}
                  >
                    <Show when={copiedImage()} fallback={<Copy class="w-3.5 h-3.5" />}>
                      <Check class="w-3.5 h-3.5 text-emerald-400" />
                    </Show>
                    <span>{copiedImage() ? t("common.copied") : t("detailPane.copyImage")}</span>
                  </button>
                  <div class="h-[1px] bg-border/20 my-1" />
                </Show>

                <button
                  class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                  onClick={() => {
                    const event = new CustomEvent("toggle-mermaid-raw", {
                      detail: {
                        wrapper: context().mermaidWrapper,
                        container: context().mermaidContainer,
                      },
                    });
                    window.dispatchEvent(event);
                    props.setContextMenu(null);
                  }}
                >
                  <svg
                    class="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    {context().mermaidWrapper!.getAttribute("data-show-raw") === "true" ? (
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    ) : (
                      <>
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </>
                    )}
                  </svg>
                  <span>
                    {context().mermaidWrapper!.getAttribute("data-show-raw") === "true"
                      ? t("detailPane.mermaidShowDiagram")
                      : t("detailPane.mermaidShowOriginal")}
                  </span>
                </button>
              </Show>
            </div>
          );
        }}
      </Show>
    </Portal>
  );
};
