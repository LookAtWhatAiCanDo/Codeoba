import { createSignal, Show, For } from "solid-js";
import { X, Shield } from "lucide-solid";
import { useI18n } from "../i18n/i18n";

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
    description: "Outfit is a beautiful geometric sans-serif typeface designed for digital screens, acting as the primary typography system for the Codeoba application.",
    licenseText: `Copyright 2021 The Outfit Project Authors (https://github.com/Outfitio/Outfit-Fonts)\n\n${silOflLicense}`
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono Font Family",
    category: "fonts",
    author: "JetBrains",
    url: "https://github.com/JetBrains/JetBrainsMono",
    licenseName: "SIL Open Font License 1.1",
    description: "JetBrains Mono is a highly readable monospace font tailored specifically for code blocks, terminal representations, and search query displays in Codeoba.",
    licenseText: `Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)\n\n${silOflLicense}`
  },
  // Models
  {
    id: "all-minilm-l6-v2",
    name: "all-MiniLM-L6-v2 Model (ONNX)",
    category: "models",
    author: "SentenceTransformers / Xenova",
    url: "https://huggingface.co/Xenova/all-MiniLM-L6-v2",
    licenseName: "Apache License 2.0",
    description: "A lightweight transformer model mapping sentences and search transcripts to a 384-dimensional dense vector space to support extremely fast offline semantic search.",
    licenseText: `Copyright (c) SentenceTransformers & Xenova\n\n${apacheLicense}`
  },
  // Frameworks
  {
    id: "tauri",
    name: "Tauri Platform",
    category: "frameworks",
    author: "Tauri Apps Contributors",
    url: "https://github.com/tauri-apps/tauri",
    licenseName: "MIT / Apache 2.0",
    description: "Tauri is a framework for building tiny, fast, secure desktop applications using web-frontend technologies backed by a Rust runtime.",
    licenseText: `Copyright (c) Tauri Apps Contributors\n\n${mitLicense}`
  },
  {
    id: "solid-js",
    name: "SolidJS",
    category: "frameworks",
    author: "Ryan Carniato",
    url: "https://github.com/solidjs/solid",
    licenseName: "MIT",
    description: "SolidJS is a declarative, efficient, and flexible JavaScript library for building user interfaces utilizing fine-grained reactive updates.",
    licenseText: `Copyright (c) 2018 Ryan Carniato\n\n${mitLicense}`
  },
  {
    id: "tailwindcss",
    name: "Tailwind CSS",
    category: "frameworks",
    author: "Tailwind Labs",
    url: "https://github.com/tailwindlabs/tailwindcss",
    licenseName: "MIT",
    description: "A utility-first CSS framework for rapid UI styling, powering the responsive design tokens and custom theme properties of Codeoba.",
    licenseText: `Copyright (c) Tailwind Labs, Inc.\n\n${mitLicense}`
  },
  {
    id: "tract",
    name: "Tract ONNX Engine",
    category: "frameworks",
    author: "Sonos",
    url: "https://github.com/sonos/tract",
    licenseName: "Apache 2.0 / MIT",
    description: "Tract is a high-performance neural network inference engine, executing Codeoba's local vector evaluations directly in Rust.",
    licenseText: `Copyright (c) Sonos, Inc.\n\n${apacheLicense}`
  },
  {
    id: "wasmtime",
    name: "Wasmtime Runtime",
    category: "frameworks",
    author: "Bytecode Alliance",
    url: "https://github.com/bytecodealliance/wasmtime",
    licenseName: "Apache 2.0",
    description: "Wasmtime is a standalone, WebAssembly-first runtime used by Codeoba's premium module validation layer to run sandboxed guest WASM functions.",
    licenseText: `Copyright (c) Bytecode Alliance\n\n${apacheLicense}`
  },
  // Libraries
  {
    id: "rusqlite",
    name: "Rusqlite Library",
    category: "libraries",
    author: "Rusqlite Contributors",
    url: "https://github.com/rusqlite/rusqlite",
    licenseName: "MIT",
    description: "Ergonomic Rust bindings for the SQLite database engine, allowing lock-free WAL reading of local logs.",
    licenseText: `Copyright (c) 2014 Rusqlite Contributors\n\n${mitLicense}`
  },
  {
    id: "marked",
    name: "marked Markdown Parser",
    category: "libraries",
    author: "Marked Contributors",
    url: "https://github.com/markedjs/marked",
    licenseName: "MIT",
    description: "A fast, fully-featured Markdown parser and compiler written in JavaScript, powering chat transcript formatting.",
    licenseText: `Copyright (c) 2011-2026 Christopher Jeffrey\n\n${mitLicense}`
  },
  {
    id: "prismjs",
    name: "prismjs Code Highlighter",
    category: "libraries",
    author: "PrismJS Contributors",
    url: "https://github.com/PrismJS/prism",
    licenseName: "MIT",
    description: "A lightweight, robust syntax highlighter utilized for rendering beautiful code blocks inside search transcripts.",
    licenseText: `Copyright (c) 2012 Lea Verou\n\n${mitLicense}`
  },
  {
    id: "dompurify",
    name: "dompurify Sanitizer",
    category: "libraries",
    author: "Mario Heiderich",
    url: "https://github.com/cure53/DOMPurify",
    licenseName: "Apache 2.0 / MPL 2.0",
    description: "A DOM-only, super-fast, UI-compatible HTML sanitizer used to prevent cross-site scripting (XSS) attacks in Markdown renderings.",
    licenseText: `Copyright (c) 2015 Mario Heiderich\n\n${apacheLicense}`
  },
  {
    id: "lucide-solid",
    name: "lucide-solid Icons",
    category: "libraries",
    author: "Lucide Contributors",
    url: "https://github.com/lucide-icons/lucide",
    licenseName: "ISC",
    description: "A clean and consistent vector icon library for SolidJS applications.",
    licenseText: `Copyright (c) 2022 Lucide Contributors\n\n${iscLicense}`
  }
];

export const LicensesDialog = (props: LicensesDialogProps) => {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = createSignal<LicenseCategory>("fonts");
  
  // Find components matching active category
  const filteredComponents = () => 
    AUDITED_COMPONENTS.filter(c => c.category === activeCategory());

  // Track currently selected component in detail view
  const [selectedCompId, setSelectedCompId] = createSignal<string>("outfit");

  const activeComponent = () => 
    AUDITED_COMPONENTS.find(c => c.id === selectedCompId()) || filteredComponents()[0];

  // When switching categories, auto-select the first item in the new category
  const handleCategoryChange = (cat: LicenseCategory) => {
    setActiveCategory(cat);
    const first = AUDITED_COMPONENTS.find(c => c.category === cat);
    if (first) {
      setSelectedCompId(first.id);
    }
  };

  return (
    <Show when={props.isOpen}>
      {/* Modal backdrop */}
      <div 
        class="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm"
        onClick={props.onClose}
      >
        {/* Main Dialog card */}
        <div 
          class="w-[1080px] h-[580px] bg-surface border border-border/80 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar - Full Width spanning all columns */}
          <div class="h-[60px] border-b border-border/60 flex items-center justify-between px-6 bg-background/30 flex-shrink-0">
            <div class="flex items-center gap-2">
              <Shield class="w-4 h-4 text-accent" />
              <span class="font-bold text-text-primary tracking-wide text-sm">{t("licenses.title")}</span>
            </div>
            
            {/* Close button */}
            <button 
              onClick={props.onClose}
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
                class={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  activeCategory() === "fonts" 
                    ? "bg-accent/15 text-accent" 
                    : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
                }`}
              >
                {t("licenses.fonts")}
              </button>
              <button
                onClick={() => handleCategoryChange("models")}
                class={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  activeCategory() === "models" 
                    ? "bg-accent/15 text-accent" 
                    : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
                }`}
              >
                {t("licenses.models")}
              </button>
              <button
                onClick={() => handleCategoryChange("frameworks")}
                class={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  activeCategory() === "frameworks" 
                    ? "bg-accent/15 text-accent" 
                    : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
                }`}
              >
                {t("licenses.frameworks")}
              </button>
              <button
                onClick={() => handleCategoryChange("libraries")}
                class={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  activeCategory() === "libraries" 
                    ? "bg-accent/15 text-accent" 
                    : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
                }`}
              >
                {t("licenses.libraries")}
              </button>
            </div>
          </div>

          {/* Middle List - Items in the active category */}
          <div class="w-[220px] border-r border-border/60 flex flex-col p-4 pt-6 flex-shrink-0 bg-background/5">
            <span class="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 px-2">Components</span>
            <div class="flex flex-col gap-1 overflow-y-auto flex-1 pr-1 custom-scrollbar">
              <For each={filteredComponents()}>
                {(comp) => (
                  <button
                    onClick={() => setSelectedCompId(comp.id)}
                    class={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer flex flex-col gap-0.5 ${
                      selectedCompId() === comp.id 
                        ? "bg-surface-elevated border border-border/40 shadow-sm" 
                        : "border border-transparent text-text-secondary hover:bg-surface-elevated/40 hover:text-text-primary"
                    }`}
                  >
                    <span class="font-bold text-text-primary">{comp.name}</span>
                    <span class="text-[10px] text-accent font-mono">{comp.licenseName}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* Right Detail Pane - Full license display */}
          <div class="flex-1 flex flex-col p-6 pt-6 overflow-hidden">
            <Show when={activeComponent()} fallback={
              <div class="flex-1 flex items-center justify-center text-text-secondary text-xs">
                Select a component to view details.
              </div>
            }>
              {(comp) => (
                <div class="flex-1 flex flex-col overflow-hidden">
                  {/* Package Metadata */}
                  <div class="flex flex-col gap-1.5 mb-4">
                    <h2 class="text-lg font-extrabold text-text-primary">{comp().name}</h2>
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                      <div>Author: <span class="font-semibold text-text-primary">{comp().author}</span></div>
                      <div class="w-1 h-1 rounded-full bg-border"></div>
                      <a 
                        href={comp().url} 
                        target="_blank" 
                        rel="noreferrer"
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
                      <span class="text-[10px] uppercase tracking-wider font-bold text-accent font-mono">{comp().licenseName}</span>
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
        </div>
      </div>
    </Show>
  );
};
