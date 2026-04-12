import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

export const captureElement = async (elementId: string): Promise<{ dataUrl: string, width: number, height: number } | null> => {
  const element = document.getElementById(elementId);
  if (!element) return null;

  // Use html-to-image for better SVG support
  const dataUrl = await toPng(element, {
    quality: 1,
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    filter: (node) => {
      // Ignore the floating toolbar buttons (z-20)
      if (node instanceof HTMLElement && node.classList.contains('z-20')) {
        return false;
      }
      return true;
    }
  });

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ dataUrl, width: img.width, height: img.height });
    };
    img.src = dataUrl;
  });
};

export const exportToPDF = async (elementId: string, filename: string = 'Organization_Chart.pdf') => {
  // Wait a bit for any animations to settle
  await new Promise(resolve => setTimeout(resolve, 800));

  try {
    const result = await captureElement(elementId);
    if (!result) return;

    const { dataUrl, width, height } = result;

    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
      hotfixes: ["px_scaling"]
    });

    pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
    pdf.save(filename);
  } catch (error) {
    console.error('PDF Export failed:', error);
    alert('PDF 匯出失敗，請稍後再試。建議縮小組織圖後再試一次。');
  }
};
