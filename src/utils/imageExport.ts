export const copySvgAsPng = async (svgUrl: string, originalSvgEl?: SVGElement) => {
  const promise = new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");

        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (originalSvgEl) {
          const viewBox = originalSvgEl.getAttribute("viewBox");
          if (viewBox) {
            const parts = viewBox.split(/\s+/).map(Number);
            if (parts.length === 4 && !isNaN(parts[2]) && !isNaN(parts[3])) {
              width = parts[2];
              height = parts[3];
            }
          }
          if (!width || !height) {
            const rect = originalSvgEl.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
          }
        }

        if (!width) width = 800;
        if (!height) height = 600;

        const scale = window.devicePixelRatio || 2;
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas 2d context"));
          return;
        }

        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Failed to generate canvas blob"));
            return;
          }
          resolve(blob);
        }, "image/png");
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      reject(new Error("Failed to load SVG image source"));
    };
    img.src = svgUrl;
  });

  // Write to clipboard synchronously using the Promise pattern
  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": promise,
    }),
  ]);
};
