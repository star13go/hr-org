import pptxgen from "pptxgenjs";
import { OrgNode } from "../types";
import * as d3 from 'd3';

export const exportToPPT = (nodes: OrgNode | OrgNode[], canvasWidth: number = 25.4, canvasHeight: number = 14.288) => {
  const pres = new pptxgen();
  const rootNodes = Array.isArray(nodes) ? nodes : [nodes];
  
  // Set Slide Size
  // 1 inch = 2.54 cm
  const slideWidthIn = canvasWidth / 2.54;
  const slideHeightIn = canvasHeight / 2.54;
  
  pres.defineLayout({ name: 'CUSTOM', width: slideWidthIn, height: slideHeightIn });
  pres.layout = 'CUSTOM';

  rootNodes.forEach((rootNode) => {
    const slide = pres.addSlide();

    // Node Box Dimensions: 2.16cm x 1.45cm
    const nodeWidth = 2.16 / 2.54; // ~0.85
    const rectHeight = 1.45 / 2.54; // ~0.57
    
    // Photo Circle Dimensions: 1.3cm x 1.13cm
    const photoWidth = 1.3 / 2.54; // ~0.51
    const photoHeight = 1.13 / 2.54; // ~0.445
    
    // Offset for photo overlap (half of photo height)
    const rectYOffset = photoHeight / 2;

    // Use D3 to calculate positions
    const hierarchy = d3.hierarchy(rootNode);
    // Adjust tree layout spacing
    const treeLayout = d3.tree<OrgNode>().nodeSize([nodeWidth * 1.5, rectHeight * 2.5]);
    treeLayout(hierarchy);

    // Get bounds to scale
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    hierarchy.descendants().forEach(d => {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
      if (d.y < minY) minY = d.y;
      if (d.y > maxY) maxY = d.y;
    });

    const chartWidth = maxX - minX || 1;
    const chartHeight = maxY - minY || 1;

    // Scale to fit page with margins
    const margin = 0.5;
    const availableWidth = slideWidthIn - (margin * 2);
    const availableHeight = slideHeightIn - (margin * 2);
    
    const scaleX = availableWidth / (chartWidth + nodeWidth);
    const scaleY = availableHeight / (chartHeight + rectHeight + rectYOffset);
    const scale = Math.min(scaleX, scaleY, 1);

    const offsetX = margin + (availableWidth - (chartWidth * scale)) / 2 - (minX * scale);
    const offsetY = margin + rectYOffset;

    // Draw Links
    hierarchy.links().forEach(link => {
      const startX = link.source.x * scale + offsetX;
      const startY = link.source.y * scale + offsetY + rectYOffset;
      const endX = link.target.x * scale + offsetX;
      const endY = link.target.y * scale + offsetY + rectYOffset;

      // Vertical line from source
      slide.addShape(pres.ShapeType.line, {
        x: startX,
        y: startY,
        w: 0,
        h: (endY - startY) / 2,
        line: { color: "141414", width: 1 }
      });

      // Horizontal line
      slide.addShape(pres.ShapeType.line, {
        x: Math.min(startX, endX),
        y: startY + (endY - startY) / 2,
        w: Math.abs(startX - endX),
        h: 0,
        line: { color: "141414", width: 1 }
      });

      // Vertical line to target
      slide.addShape(pres.ShapeType.line, {
        x: endX,
        y: startY + (endY - startY) / 2,
        w: 0,
        h: (endY - startY) / 2,
        line: { color: "141414", width: 1 }
      });
    });

    // Draw Nodes
    hierarchy.descendants().forEach(d => {
      const x = d.x * scale + offsetX - (nodeWidth / 2);
      const y = d.y * scale + offsetY;

      // Node Box (Rectangle)
      slide.addShape(pres.ShapeType.rect, {
        x, 
        y: y + rectYOffset, 
        w: nodeWidth, 
        h: rectHeight,
        fill: { color: "C6F6D5" },
        line: { color: "000000", width: 1 } // Thinner border
      });

      // Photo Circle
      const photoX = x + (nodeWidth / 2) - (photoWidth / 2);
      const photoY = y + rectYOffset - (photoHeight / 2);

      if (d.data.photo) {
        try {
          slide.addImage({
            data: d.data.photo,
            x: photoX, 
            y: photoY, 
            w: photoWidth, 
            h: photoHeight,
            rounding: true
          });
          // Add border for photo
          slide.addShape(pres.ShapeType.ellipse, {
            x: photoX, 
            y: photoY, 
            w: photoWidth, 
            h: photoHeight,
            fill: { type: 'none' },
            line: { color: "001F3F", width: 1 } // Thinner border
          });
        } catch (e) {
          console.error("Failed to add image to PPT", e);
        }
      } else {
        slide.addShape(pres.ShapeType.ellipse, {
          x: photoX, 
          y: photoY, 
          w: photoWidth, 
          h: photoHeight,
          fill: { color: "FFFFFF" },
          line: { color: "001F3F", width: 1 } // Thinner border
        });
      }

      // Department (Shrink to fit, PMingLiU)
      slide.addText(d.data.department, {
        x, 
        y: y + rectYOffset + (rectHeight * 0.4), 
        w: nodeWidth, 
        h: rectHeight * 0.2,
        fontSize: 10, 
        fontFace: "PMingLiU",
        color: "000000", 
        align: "center",
        shrinkText: true // Shrink to fit
      });

      // Name and Title (Shrink to fit, PMingLiU)
      slide.addText(`${d.data.name} ${d.data.title}`, {
        x, 
        y: y + rectYOffset + (rectHeight * 0.65), 
        w: nodeWidth, 
        h: rectHeight * 0.25,
        fontSize: 10, 
        fontFace: "PMingLiU",
        bold: true, 
        color: "000000", 
        align: "center",
        shrinkText: true // Shrink to fit
      });

      // Subordinate Count Circle
      if (d.children && d.children.length > 0) {
        const countSize = 0.15;
        const countX = x + nodeWidth - (countSize / 2);
        const countY = y + rectYOffset - (countSize / 2);
        slide.addShape(pres.ShapeType.ellipse, {
          x: countX, y: countY, w: countSize, h: countSize,
          fill: { color: "141414" }
        });
        slide.addText(d.children.length.toString(), {
          x: countX, y: countY, w: countSize, h: countSize,
          fontSize: 6, color: "FFFFFF", align: "center", valign: "middle"
        });
      }
    });
  });

  pres.writeFile({ fileName: `OrgChart_${new Date().getTime()}.pptx` });
};
