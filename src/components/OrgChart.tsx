import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { OrgNode, Employee, MemberType } from '../types';

const CM_TO_PX = 37.7952755906;

interface OrgChartProps {
  data: OrgNode;
  employees: Employee[];
  memberTypes?: MemberType[];
  onNodeClick?: (node: OrgNode) => void;
  onViewSubChart?: (nodeId: string) => void;
  width?: number;
  height?: number;
  showDepartmentCodes?: boolean;
  showEmployeeIds?: boolean;
  isSubChart?: boolean;
  selectedId?: string | null;
  onDeselect?: () => void;
  companyName?: string;
}

const OrgChart: React.FC<OrgChartProps> = ({ 
  data, 
  employees, 
  memberTypes = [],
  onNodeClick, 
  onViewSubChart,
  width = 1000, 
  height = 600,
  showDepartmentCodes = false,
  showEmployeeIds = false,
  isSubChart = false,
  selectedId,
  onDeselect,
  companyName
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const updateChart = () => {
      if (!data || !svgRef.current) return;

      const svgElement = svgRef.current;
      
      // Scale factor to maintain proportions from 33.867cm to 25.4cm width
      const scale = 25.4 / 33.867;
      
      const nodeWidth = 2.16 * CM_TO_PX * scale;
      const nodeHeight = 2 * CM_TO_PX * scale;
      const photoWidth = 1.3 * CM_TO_PX * scale;
      const photoHeight = 1.13 * CM_TO_PX * scale;

      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      svg.attr('width', width)
         .attr('height', height)
         .on('click', (event) => {
           if (event.button !== 0) return;
           onDeselect?.();
         });

      const g = svg.append('g');

      const isSpecialAssistant = (d: OrgNode) => d.isSpecialAssistant;
      const isRegular = (d: OrgNode) => !d.isSpecialAssistant;
      
      const asstPerRow = 10; 
      const staffGap = 10 * scale; 
      const asstGapX = 20 * scale; 
      const asstGridGap = 10 * scale; 
      const padding = 30 * scale;
      const minHorizontalGap = 0.375 * CM_TO_PX * scale; // 1.5x of 0.25

      // 1. Build hierarchy (Include all regular children)
      const root = d3.hierarchy(data, d => d.children?.filter(isRegular));

      // 2. Pre-calculate subtree dimensions and layout modes (Bottom-Up)
      const nodeInfo = new Map<string, { 
        width: number, 
        height: number, 
        reservedWidth: number,
        isVertical: boolean,
        asstWidth: number,
        asstHeight: number
      }>();

      const leafWidth = nodeWidth + 0.375 * CM_TO_PX * scale; // 1.5x of 0.25
      const groupGap = 1.125 * CM_TO_PX * scale; // 1.5x of 0.75

      const calculateDimensions = (n: d3.HierarchyNode<OrgNode>): number => {
        const subordinatesPerRow = n.data.subordinatesPerRow || 5;
        const assistants = n.data.children?.filter(isSpecialAssistant) || [];
        const children = n.children || [];
        
        // Rule: Grid layout only if all children are leaf nodes (no children and not a sub-page)
        const canUseGrid = children.every(c => (!c.children || c.children.length === 0) && !c.data.isSubPage);
        const effectivePerRow = canUseGrid ? subordinatesPerRow : children.length;
        
        // Vertical gap: 0.75x if children have no manager label and no subordinates
        const allChildrenNoManager = children.every(c => !c.data.isManagerLabel && (!c.children || c.children.length === 0));
        const currentStaffGapY = allChildrenNoManager ? 22.5 * scale : 30 * scale;

        let asstWidth = 0;
        let asstHeight = 0;
        if (assistants.length > 0) {
          const cols = Math.min(assistants.length, asstPerRow);
          const rows = Math.ceil(assistants.length / asstPerRow);
          asstWidth = cols * nodeWidth + (cols - 1) * asstGridGap;
          asstHeight = rows * nodeHeight + (rows - 1) * asstGridGap;
        }

        if (children.length === 0) {
          const totalHeight = nodeHeight + 10 * scale; // Removed asstHeight
          nodeInfo.set(n.data.id, { 
            width: nodeWidth, 
            height: totalHeight, 
            reservedWidth: leafWidth,
            isVertical: false,
            asstWidth,
            asstHeight
          });
          return leafWidth;
        }

        const colWidths: number[] = [];
        const rowHeights: number[] = [];

        children.forEach((child, i) => {
          const col = i % effectivePerRow;
          const row = Math.floor(i / effectivePerRow);
          const childReservedWidth = calculateDimensions(child);
          const childHeight = nodeInfo.get(child.data.id)!.height;

          colWidths[col] = Math.max(colWidths[col] || 0, childReservedWidth);
          rowHeights[row] = Math.max(rowHeights[row] || 0, childHeight);
        });

        const totalReservedWidth = colWidths.reduce((a, b) => a + b, 0) + (colWidths.length - 1) * groupGap;
        const childrenHeight = rowHeights.reduce((a, b) => a + b, 0) + (rowHeights.length - 1) * currentStaffGapY;

        const totalHeight = nodeHeight + currentStaffGapY + childrenHeight;

        nodeInfo.set(n.data.id, { 
          width: nodeWidth,
          height: totalHeight, 
          reservedWidth: totalReservedWidth,
          isVertical: false,
          asstWidth,
          asstHeight
        });

        return totalReservedWidth;
      };

      calculateDimensions(root);

      const boxABoundary = height * 0.4;
      const boxCBoundary = height * 0.33;

      const getBoxY = (depth: number) => {
        if (!isSubChart) {
          if (depth === 0) return height * 0.08;
          if (depth === 1) return height * 0.24;
          // Dynamic progression for depth >= 2 to prevent huge gaps
          return height * 0.24 + (depth - 1) * (nodeHeight + 30 * scale); // Reduced from 60
        } else {
          if (depth === 0) return height * 0.08;
          if (depth === 1) return height * 0.22;
          // Box D: 0.33 to 1.0
          const boxStart = height * 0.33;
          const boxHeight = height * 0.67;
          const maxDepth = root.height;
          if (maxDepth <= 1) return boxStart + boxHeight * 0.5;
          return boxStart + (depth - 1) * (boxHeight / (maxDepth + 1));
        }
      };

      // 3. Position nodes
      const links: any[] = [];

      const positionNodes = (n: d3.HierarchyNode<OrgNode>, x: number, y: number) => {
        const info = nodeInfo.get(n.data.id)!;
        (n as any).x = x;
        (n as any).y = y;

        const children = n.children || [];
        if (children.length > 0) {
          const subordinatesPerRow = n.data.subordinatesPerRow || 5;
          const canUseGrid = children.every(c => (!c.children || c.children.length === 0) && !c.data.isSubPage);
          const effectivePerRow = canUseGrid ? subordinatesPerRow : children.length;
          
          const colWidths: number[] = [];
          
          // Pre-calculate column widths
          children.forEach((child, i) => {
            const col = i % effectivePerRow;
            colWidths[col] = Math.max(colWidths[col] || 0, nodeInfo.get(child.data.id)!.reservedWidth);
          });

          const totalWidth = colWidths.reduce((a, b) => a + b, 0) + (colWidths.length - 1) * groupGap;
          let startX = x - totalWidth / 2;
          
          const allChildrenNoManager = children.every(c => !c.data.isManagerLabel && (!c.children || c.children.length === 0));
          const currentStaffGapY = allChildrenNoManager ? 22.5 * scale : 30 * scale;
          let currentYBase = y + nodeHeight + currentStaffGapY; // Removed info.asstHeight

          const rowHeights: number[] = [];
          // Pre-calculate row heights
          const numRows = Math.ceil(children.length / effectivePerRow);
          for (let r = 0; r < numRows; r++) {
            let maxH = 0;
            for (let c = 0; c < effectivePerRow; c++) {
              const idx = r * effectivePerRow + c;
              if (idx < children.length) {
                maxH = Math.max(maxH, nodeInfo.get(children[idx].data.id)!.height);
              }
            }
            rowHeights[r] = maxH;
          }

          children.forEach((child, i) => {
            const row = Math.floor(i / effectivePerRow);
            const col = i % effectivePerRow;
            
            // Calculate X for this column
            let colX = startX;
            for (let c = 0; c < col; c++) {
              colX += colWidths[c] + groupGap;
            }
            const childX = colX + colWidths[col] / 2;

            // Calculate Y for this row
            let rowY = currentYBase;
            for (let r = 0; r < row; r++) {
              rowY += rowHeights[r] + currentStaffGapY;
            }

            positionNodes(child, childX, rowY);

            // Link logic
            const hasChildren = child.data.children && child.data.children.some(c => !c.isSpecialAssistant);
            const isSubPage = child.data.isSubPage || child.data.isExecutive;
            const isManagerNode = hasChildren || isSubPage;

            // Rule: Link if target is a manager OR if effectivePerRow is 1 and it's the first child
            if (isManagerNode || (effectivePerRow === 1 && i === 0)) {
              links.push({ 
                source: n, 
                target: child, 
                isVertical: effectivePerRow === 1,
                isToStaff: !isManagerNode // Flag for the link renderer
              });
            }
          });
        }

        // Position Assistants (Special Assistants)
        const assistants = n.data.children?.filter(isSpecialAssistant) || [];
        if (assistants.length > 0) {
          const asstShiftDown = 0.25 * CM_TO_PX * scale;
          const asstHorizontalGap = 10 * scale;
          const asstVerticalGap = 10 * scale;
          const asstPerRowLocal = 3;

          assistants.forEach((asst, i) => {
            const row = Math.floor(i / asstPerRowLocal);
            const col = i % asstPerRowLocal;
            
            (n as any).assistants = (n as any).assistants || [];
            (n as any).assistants.push({
              data: asst,
              x: x + nodeWidth / 2 + asstHorizontalGap + col * (nodeWidth + asstHorizontalGap) + nodeWidth / 2,
              y: y + asstShiftDown + row * (nodeHeight + asstVerticalGap),
              isSpecialAssistant: true
            });
          });
        }
      };

      positionNodes(root, width / 2, getBoxY(0));

      const allNodes: any[] = [];
      const gatherNodes = (n: any) => {
        allNodes.push(n);
        if (n.assistants) {
          n.assistants.forEach((a: any) => allNodes.push(a));
        }
        if (n.children) {
          n.children.forEach(gatherNodes);
        }
      };
      gatherNodes(root);

      // Calculate bounds to center the tree horizontally
      let minX = Infinity, maxX = -Infinity;
      allNodes.forEach((d: any) => {
        const x = d.x;
        if (x - nodeWidth / 2 < minX) minX = x - nodeWidth / 2;
        if (x + nodeWidth / 2 > maxX) maxX = x + nodeWidth / 2;
      });

      const treeWidth = maxX - minX || 1;

      // Calculate centering offsets
      const offsetX = treeWidth > width ? -minX + 20 * scale : (width - treeWidth) / 2 - minX;
      const offsetY = 0; // Use absolute Y positioning

      g.attr('transform', `translate(${offsetX},${offsetY})`);

      // 4. Draw Links
      g.selectAll('.link')
        .data(links)
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('fill', 'none')
        .attr('stroke', '#141414')
        .attr('stroke-width', 1)
        .attr('d', (d: any) => {
          const s = d.source;
          const t = d.target;
          
          // Rule: Only draw link if target is a manager (has children)
          // OR if it's a staff and subordinatesPerRow is 1 (handled by isToStaff flag)
          const targetIsManager = t.data && (t.data.children && t.data.children.some((c: any) => !c.isSpecialAssistant));
          if (!targetIsManager && !d.isToStaff) return null;

          if (d.isVertical) {
            return `M${s.x},${s.y + nodeHeight / 2} V${t.y} H${t.x - nodeWidth / 2}`;
          } else {
            const midY = (s.y + t.y) / 2;
            return `M${s.x},${s.y + nodeHeight / 2} V${midY} H${t.x} V${t.y - nodeHeight / 2}`;
          }
        });

      // Special Assistant Links
      g.selectAll('.asst-link')
        .data(allNodes.filter(s => s.isSpecialAssistant))
        .enter()
        .append('path')
        .attr('class', 'asst-link')
        .attr('fill', 'none')
        .attr('stroke', '#141414')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('d', (d: any) => {
          const parent = allNodes.find(n => n.data.id === d.data.parentId);
          if (!parent) return '';
          return `M${parent.x + nodeWidth / 2},${parent.y} H${d.x - nodeWidth / 2}`;
        });

      const nodes = g.selectAll('.node')
        .data(allNodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', (d: any) => `translate(${d.x - nodeWidth / 2},${d.y - nodeHeight / 2})`)
        .style('cursor', 'pointer')
        .on('mouseover', function() {
          d3.select(this).select('.main-rect')
            .attr('stroke-width', 2)
            .attr('stroke', '#3182ce');
        })
        .on('mouseout', function(event, d: any) {
          const isSelected = d.data.id === selectedId;
          d3.select(this).select('.main-rect')
            .attr('stroke-width', isSelected ? 3 : 0.5)
            .attr('stroke', isSelected ? '#3182ce' : '#000');
        })
        .on('click', (event, d) => {
          if (event.button !== 0) return; // Only left-click
          event.stopPropagation();
          if (event.defaultPrevented) return;
          onNodeClick?.(d.data);
        })
        .on('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });

      nodes.append('rect')
        .attr('class', 'main-rect')
        .attr('x', 0)
        .attr('y', photoHeight / 2)
        .attr('width', nodeWidth)
        .attr('height', nodeHeight - (photoHeight / 2))
        .attr('fill', (d: any) => {
          const typeName = d.data.memberType;
          const typeConfig = memberTypes.find(mt => mt.name === typeName);
          if (typeConfig) return typeConfig.color;
          
          // Fallback for legacy or undefined types
          if (typeName === '經營層') return '#EBF8FF';
          if (typeName === '理級') return '#FFF5F5';
          if (typeName === '課級') return '#C6F6D5';
          if (typeName === '基層') return '#FFFFFF';
          return '#C6F6D5'; // Default
        })
        .attr('stroke', (d: any) => d.data.id === selectedId ? '#3182ce' : '#000')
        .attr('stroke-width', (d: any) => d.data.id === selectedId ? 3 : 0.5)
        .style('cursor', 'pointer');

      // Photo and Text (same as before but using scale)
      const photoGroup = nodes.append('g')
        .attr('transform', `translate(${nodeWidth / 2}, ${photoHeight / 2})`);

      photoGroup.append('ellipse')
        .attr('rx', photoWidth / 2)
        .attr('ry', photoHeight / 2)
        .attr('fill', '#fff')
        .attr('stroke', '#001F3F')
        .attr('stroke-width', 0.5);

      const clipId = (d: any) => `clip-${d.data.id}`;
      nodes.append('clipPath')
        .attr('id', (d: any) => clipId(d))
        .append('ellipse')
        .attr('cx', nodeWidth / 2)
        .attr('cy', photoHeight / 2)
        .attr('rx', photoWidth / 2)
        .attr('ry', photoHeight / 2);

      nodes.filter((d: any) => {
        const target = d.data.proxyId ? employees.find(e => e.id === d.data.proxyId) : d.data;
        return !!target?.photo;
      })
        .append('image')
        .attr('xlink:href', (d: any) => {
          const target = d.data.proxyId ? employees.find(e => e.id === d.data.proxyId) : d.data;
          return target?.photo;
        })
        .attr('x', nodeWidth / 2 - photoWidth / 2)
        .attr('y', 0)
        .attr('width', photoWidth)
        .attr('height', photoHeight)
        .attr('clip-path', (d: any) => `url(#${clipId(d)})`)
        .attr('preserveAspectRatio', 'xMidYMid slice');

      nodes.append('text')
        .attr('x', nodeWidth / 2)
        .attr('y', photoHeight + 12 * scale)
        .attr('text-anchor', 'middle')
        .attr('font-family', '"PMingLiU", "serif"')
        .attr('font-size', `${10 * scale}px`)
        .attr('font-weight', '500')
        .attr('fill', '#000')
        .text((d: any) => {
          const dept = d.data.department;
          const code = d.data.departmentCode;
          return showDepartmentCodes && code ? `${dept} (${code})` : dept;
        });

      nodes.append('text')
        .attr('x', nodeWidth / 2)
        .attr('y', photoHeight + 26 * scale)
        .attr('text-anchor', 'middle')
        .attr('font-family', '"PMingLiU", "serif"')
        .attr('font-size', `${10 * scale}px`)
        .attr('font-weight', 'bold')
        .attr('fill', (d: any) => {
          const target = d.data.proxyId ? employees.find(e => e.id === d.data.proxyId) : d.data;
          const name = target?.name || d.data.name;
          return name === '新員工' ? '#ff0000' : '#000';
        })
        .text((d: any) => {
          const target = d.data.proxyId ? employees.find(e => e.id === d.data.proxyId) : d.data;
          let name = target?.name || d.data.name;
          if (d.data.proxyId) name = `${name}(代)`;
          const title = d.data.title;
          const empId = target?.employeeId || d.data.employeeId;
          const base = `${name} ${title}`;
          return showEmployeeIds && empId ? `${base} [${empId}]` : base;
        });

      // Subordinate Count (Headcount including all members)
      const getRealGroupSize = (node: OrgNode): number => {
        let count = 1;
        const visited = new Set<string>();
        const find = (id: string) => {
          if (visited.has(id)) return;
          visited.add(id);
          employees.forEach(emp => {
            if (emp.parentId === id) {
              count++;
              find(emp.id);
            }
          });
        };
        find(node.id);
        return count;
      };

      // Helper to check if node has any descendants (to decide if it's a "manager")
      const hasDescendants = (node: OrgNode): boolean => {
        return employees.some(e => e.parentId === node.id);
      };

      nodes.filter((d: any) => hasDescendants(d.data) && getRealGroupSize(d.data) > 1)
        .append('rect')
        .attr('x', nodeWidth - 12 * scale)
        .attr('y', 0)
        .attr('width', 14 * scale)
        .attr('height', 14 * scale)
        .attr('rx', 7 * scale)
        .attr('fill', '#141414');

      nodes.filter((d: any) => hasDescendants(d.data) && getRealGroupSize(d.data) > 1)
        .append('text')
        .attr('x', nodeWidth - 5 * scale)
        .attr('y', 10 * scale)
        .attr('text-anchor', 'middle')
        .attr('fill', '#fff')
        .attr('font-size', `${8 * scale}px`)
        .text((d: any) => getRealGroupSize(d.data));

      // 5. Draw Company/Department Name in Top Right
      const titleText = isSubChart ? data.department : companyName;
      if (titleText) {
        svg.append('text')
          .attr('x', width - 40 * scale)
          .attr('y', 60 * scale)
          .attr('text-anchor', 'end')
          .attr('font-family', '"PMingLiU", "serif"')
          .attr('font-size', `${24 * scale}px`)
          .attr('font-weight', 'bold')
          .attr('fill', '#141414')
          .attr('opacity', 0.8)
          .text(titleText);
      }
    };

    updateChart();
    window.addEventListener('resize', updateChart);
    return () => window.removeEventListener('resize', updateChart);
  }, [data, employees, memberTypes, onNodeClick, onViewSubChart, showDepartmentCodes, showEmployeeIds, selectedId, onDeselect]);

  return (
    <div className="relative">
      <svg 
        ref={svgRef} 
        className="block" 
      />
    </div>
  );
};

export default OrgChart;
