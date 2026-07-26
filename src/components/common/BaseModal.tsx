import { Show, onMount, onCleanup, type JSX } from "solid-js";

export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: JSX.Element;
  class?: string;
  backdropClass?: string;
  closeOnEsc?: boolean;
  closeOnBackdropClick?: boolean;
}

export const BaseModal = (props: BaseModalProps) => {
  const closeOnEsc = () => props.closeOnEsc ?? true;
  const closeOnBackdrop = () => props.closeOnBackdropClick ?? true;

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (props.isOpen && closeOnEsc() && e.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <Show when={props.isOpen}>
      <div
        class={
          props.backdropClass ||
          "fixed inset-0 bg-black/60 z-[999] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm"
        }
        onClick={() => {
          if (closeOnBackdrop()) {
            props.onClose();
          }
        }}
      >
        <div
          class={
            props.class ||
            "w-[520px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl relative animate-in zoom-in-95 duration-200"
          }
          onClick={(e) => e.stopPropagation()}
        >
          {props.children}
        </div>
      </div>
    </Show>
  );
};
