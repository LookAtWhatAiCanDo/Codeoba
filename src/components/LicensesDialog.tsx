import { createSignal, Show, For } from "solid-js";
import { X, Shield, Type, Cpu, Layers, Library } from "lucide-solid";
import { useI18n } from "../i18n/i18n";
import { BaseModal } from "./common/BaseModal";

// Import license texts directly from text resources at compile time
import mitLicense from "../resources/licenses/mit.txt?raw";
import apacheLicense from "../resources/licenses/apache-2.0.txt?raw";
import iscLicense from "../resources/licenses/isc.txt?raw";
import silOflLicense from "../resources/licenses/sil-ofl-1.1.txt?raw";

interface LicensesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type LicenseCategory = "fonts" | "models" | "frameworks" | "libraries";

interface AuditedComponent {
  id: string;
  name: string;
  category: LicenseCategory;
  author: string;
  url: string;
  licenseName: string;
  description: string;
  licenseText: string;
}

const AUDITED_COMPONENTS: AuditedComponent[] = [
  // Fonts
  {
    id: "outfit",
    name: "Outfit Font Family",
    category: "fonts",
    author: "Rodrigo Fuenzalida",
    url: "https://github.com/Outfitio/Outfit-Fonts",
    licenseName: "SIL Open Font License 1.1",
    description:
      "Outfit is a beautiful geometric sans-serif typeface designed for digital screens, acting as the primary typography system for the Codeoba application.",
    licenseText: `Copyright 2021 The Outfit Project Authors (https://github.com/Outfitio/Outfit-Fonts)\n\n${silOflLicense}`,
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono Font Family",
    category: "fonts",
    author: "JetBrains",
    url: "https://github.com/JetBrains/JetBrainsMono",
    licenseName: "SIL Open Font License 1.1",
    description:
      "JetBrains Mono is a highly readable monospace font tailored specifically for code blocks, terminal representations, and search query displays in Codeoba.",
    licenseText: `Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)\n\n${silOflLicense}`,
  },
  // Frameworks
  {
    id: "tauri",
    name: "Tauri Platform",
    category: "frameworks",
    author: "Tauri Apps Contributors",
    url: "https://github.com/tauri-apps/tauri",
    licenseName: "MIT / Apache 2.0",
    description:
      "Tauri is a framework for building tiny, fast, secure desktop applications using web-frontend technologies backed by a Rust runtime.",
    licenseText: `Copyright (c) Tauri Apps Contributors\n\n${mitLicense}`,
  },
  {
    id: "solid-js",
    name: "SolidJS",
    category: "frameworks",
    author: "Ryan Carniato",
    url: "https://github.com/solidjs/solid",
    licenseName: "MIT",
    description:
      "SolidJS is a declarative, efficient, and flexible JavaScript library for building user interfaces utilizing fine-grained reactive updates.",
    licenseText: `Copyright (c) 2018 Ryan Carniato\n\n${mitLicense}`,
  },
  {
    id: "tailwindcss",
    name: "Tailwind CSS",
    category: "frameworks",
    author: "Tailwind Labs",
    url: "https://github.com/tailwindlabs/tailwindcss",
    licenseName: "MIT",
    description:
      "A utility-first CSS framework for rapid UI styling, powering the responsive design tokens and custom theme properties of Codeoba.",
    licenseText: `Copyright (c) Tailwind Labs, Inc.\n\n${mitLicense}`,
  },

  // Libraries
  {
    id: "rusqlite",
    name: "Rusqlite Library",
    category: "libraries",
    author: "Rusqlite Contributors",
    url: "https://github.com/rusqlite/rusqlite",
    licenseName: "MIT",
    description:
      "Ergonomic Rust bindings for the SQLite database engine, allowing lock-free WAL reading of local logs.",
    licenseText: `Copyright (c) 2014 Rusqlite Contributors\n\n${mitLicense}`,
  },
  {
    id: "marked",
    name: "marked Markdown Parser",
    category: "libraries",
    author: "Marked Contributors",
    url: "https://github.com/markedjs/marked",
    licenseName: "MIT",
    description:
      "A fast, fully-featured Markdown parser and compiler written in JavaScript, powering chat transcript formatting.",
    licenseText: `Copyright (c) 2011-2026 Christopher Jeffrey\n\n${mitLicense}`,
  },
  {
    id: "prismjs",
    name: "prismjs Code Highlighter",
    category: "libraries",
    author: "PrismJS Contributors",
    url: "https://github.com/PrismJS/prism",
    licenseName: "MIT",
    description:
      "A lightweight, robust syntax highlighter utilized for rendering beautiful code blocks inside search transcripts.",
    licenseText: `Copyright (c) 2012 Lea Verou\n\n${mitLicense}`,
  },
  {
    id: "mermaid",
    name: "mermaid Diagramming",
    category: "libraries",
    author: "Knut Sveidqvist",
    url: "https://github.com/mermaid-js/mermaid",
    licenseName: "MIT",
    description:
      "A JavaScript-based diagramming and charting tool that uses Markdown-inspired text definitions to render SVGs.",
    licenseText: `Copyright (c) 2014-2026 Knut Sveidqvist\n\n${mitLicense}`,
  },
  {
    id: "dompurify",
    name: "dompurify Sanitizer",
    category: "libraries",
    author: "Mario Heiderich",
    url: "https://github.com/cure53/DOMPurify",
    licenseName: "Apache 2.0 / MPL 2.0",
    description:
      "A DOM-only, super-fast, UI-compatible HTML sanitizer used to prevent cross-site scripting (XSS) attacks in Markdown renderings.",
    licenseText: `Copyright (c) 2015 Mario Heiderich\n\n${apacheLicense}`,
  },
  {
    id: "lucide-solid",
    name: "lucide-solid Icons",
    category: "libraries",
    author: "Lucide Contributors",
    url: "https://github.com/lucide-icons/lucide",
    licenseName: "ISC",
    description: "A clean and consistent vector icon library for SolidJS applications.",
    licenseText: `Copyright (c) 2022 Lucide Contributors\n\n${iscLicense}`,
  },
];

export const LicensesDialog = (props: LicensesDialogProps) => {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = createSignal<LicenseCategory>("fonts");

  // Find components matching active category
  const filteredComponents = () =>
    AUDITED_COMPONENTS.filter((c) => c.category === activeCategory());

  // Track currently selected component in detail view
  const [selectedCompId, setSelectedCompId] = createSignal<string>("outfit");

  const activeComponent = () =>
    AUDITED_COMPONENTS.find((c) => c.id === selectedCompId()) || filteredComponents()[0];

  // When switching categories, auto-select the first item in the new category
  const handleCategoryChange = (cat: LicenseCategory) => {
    setActiveCategory(cat);
    const first = AUDITED_COMPONENTS.find((c) => c.category === cat);
    if (first) {
      setSelectedCompId(first.id);
    }
  };

  const handleOpenUrl = (url: string) => {
    window.open(url, "_blank");
  };

  return (
    <BaseModal
      isOpen={props.isOpen}
      onClose={props.onClose}
      class="w-[1080px] h-[580px] bg-surface border border-border/80 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200"
    >
      {/* Header Bar - Full Width spanning all columns */}
      <div class="h-[60px] border-b border-border/60 flex items-center justify-between px-6 bg-background/30 flex-shrink-0">
        <div class="flex items-center gap-2">
          <Shield class="w-4 h-4 text-accent" />
          <span class="font-bold text-text-primary tracking-wide text-sm">
            {t("licenses.title")}
          </span>
        </div>

        {/* Close button */}
        <button
          onClick={() => props.onClose()}
          class="p-1.5 bg-background hover:bg-surface border border-border/60 rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      {/* Three-Column Layout Container */}
      <div class="flex flex-1 overflow-hidden min-h-0">
        {/* Left Navigation Bar */}
        <div class="w-[200px] border-r border-border/60 flex flex-col p-4 pt-5 gap-4 flex-shrink-0 bg-background/20">
          <div class="flex flex-col gap-1">
            <button
              onClick={() => handleCategoryChange("fonts")}
              class={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                activeCategory() === "fonts"
                  ? "bg-accent/15 text-accent border border-accent/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface"
              }`}
            >
              <Type class="w-3.5 h-3.5" />
              <span>Fonts</span>
            </button>
            <button
              onClick={() => handleCategoryChange("models")}
              class={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                activeCategory() === "models"
                  ? "bg-accent/15 text-accent border border-accent/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface"
              }`}
            >
              <Cpu class="w-3.5 h-3.5" />
              <span>Models</span>
            </button>
            <button
              onClick={() => handleCategoryChange("frameworks")}
              class={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                activeCategory() === "frameworks"
                  ? "bg-accent/15 text-accent border border-accent/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface"
              }`}
            >
              <Layers class="w-3.5 h-3.5" />
              <span>Frameworks</span>
            </button>
            <button
              onClick={() => handleCategoryChange("libraries")}
              class={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                activeCategory() === "libraries"
                  ? "bg-accent/15 text-accent border border-accent/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface"
              }`}
            >
              <Library class="w-3.5 h-3.5" />
              <span>Libraries</span>
            </button>
          </div>
        </div>

        {/* Middle Column - Components List */}
        <div class="w-[300px] border-r border-border/60 flex flex-col p-3 flex-shrink-0 bg-background/10">
          <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
            <For each={filteredComponents()}>
              {(comp) => (
                <button
                  onClick={() => setSelectedCompId(comp.id)}
                  class={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                    selectedCompId() === comp.id
                      ? "bg-accent/10 border-accent/30 shadow-sm"
                      : "bg-surface/40 border-border/40 hover:bg-surface/80 hover:border-border/80 text-text-secondary"
                  }`}
                >
                  <div class="flex items-center justify-between gap-2">
                    <span
                      class={`font-semibold text-xs truncate ${
                        selectedCompId() === comp.id ? "text-accent" : "text-text-primary"
                      }`}
                    >
                      {comp.name}
                    </span>
                  </div>
                  <div class="flex items-center justify-between text-[0.6875rem] text-text-secondary/70">
                    <span>{comp.licenseName}</span>
                    <Show when={comp.author}>
                      <span class="truncate max-w-[120px]">{comp.author}</span>
                    </Show>
                  </div>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Right Column - Detail Pane */}
        <div class="flex-1 flex flex-col p-6 overflow-hidden min-h-0 bg-surface/20">
          <Show when={activeComponent()}>
            {(comp) => (
              <div class="flex-1 flex flex-col overflow-hidden">
                {/* Package Metadata */}
                <div class="flex flex-col gap-1.5 mb-4">
                  <h2 class="text-lg font-extrabold text-text-primary">{comp().name}</h2>
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <div>
                      Author: <span class="font-semibold text-text-primary">{comp().author}</span>
                    </div>
                    <div class="w-1 h-1 rounded-full bg-border" />
                    <a
                      href={comp().url}
                      onClick={(e) => {
                        e.preventDefault();
                        handleOpenUrl(comp().url);
                      }}
                      class="text-accent hover:underline cursor-pointer"
                    >
                      Project Homepage
                    </a>
                  </div>
                </div>

                {/* Description */}
                <div class="text-xs text-text-secondary leading-relaxed bg-background/30 border border-border/40 rounded-xl p-3.5 mb-4">
                  {comp().description}
                </div>

                {/* Scrollable License Code Block */}
                <div class="flex-1 flex flex-col overflow-hidden min-h-0 bg-black/35 rounded-xl border border-border/40 relative">
                  {/* Header bar of the code block to host the license name badge cleanly */}
                  <div class="flex items-center justify-between px-4 py-2 border-b border-border/20 bg-black/20 select-none flex-shrink-0">
                    <span class="text-[10px] uppercase tracking-wider font-bold text-accent font-mono">
                      {comp().licenseName}
                    </span>
                  </div>
                  <div class="flex-1 overflow-auto p-4 pt-3 select-text custom-scrollbar">
                    <pre class="text-[11px] font-mono text-text-primary leading-relaxed whitespace-pre pr-2">
                      {comp().licenseText}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </BaseModal>
  );
};
