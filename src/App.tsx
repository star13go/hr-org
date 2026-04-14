/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, 
  Upload, 
  Download, 
  Users, 
  Trash2, 
  Image as ImageIcon,
  Building2,
  Settings as SettingsIcon,
  X,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  GitBranch,
  Type,
  Eraser,
  GripHorizontal,
  FilePlus,
  Save,
  FolderOpen,
  Database,
  Maximize,
  Minus,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, OrgNode, AppSettings, Annotation } from './types';
import OrgChart from './components/OrgChart';
import { parseExcel, exportToExcel } from './utils/excel';
import { exportToPPT } from './utils/pptx';
import { exportToPDF, captureElement } from './utils/pdf';
import { jsPDF } from 'jspdf';
import { downloadExcelTemplate } from './utils/template';
import { saveProject, loadProject } from './utils/project';
import { saveToLocalStorage, loadFromLocalStorage, clearLocalStorage, getStorageSize } from './utils/storage';

import EmployeeTable from './components/EmployeeTable';

type ViewMode = { type: 'main' } | { type: 'sub'; rootId: string } | { type: 'table' };

const INITIAL_DATA: Employee[] = [
  { id: '1', name: '張大明', title: '執行長', department: '總經理室', departmentCode: 'GM', isExecutive: true, canBeProxy: true, isManagerLabel: false, subordinatesPerRow: 5, memberType: '經營層' },
];

const INITIAL_SETTINGS: AppSettings = {
  departments: [
    { name: '總經理室', code: 'GM' },
    { name: '人事部', code: 'HR' },
    { name: '財務部', code: 'FIN' },
    { name: '研發部', code: 'RD' },
    { name: '行銷部', code: 'MKT' },
    { name: '業務部', code: 'SALES' }
  ],
  titles: ['執行長', '總經理', '經理', '主任', '工程師', '專員'],
  canvasWidth: 33.867,
  canvasHeight: 19.05,
  showDepartmentCodes: false,
  showEmployeeIds: false,
  memberTypes: [
    { name: '經營層', color: '#EBF8FF' },
    { name: '理級', color: '#FFF5F5' },
    { name: '課級', color: '#C6F6D5' },
    { name: '組長', color: '#FEFCBF' }, // 淡黃底
    { name: '班長', color: '#E9D8FD' }, // 淡紫色
    { name: '基層', color: '#FFFFFF' }
  ],
  companyName: '公司名稱',
};

const CM_TO_PX = 37.7952755906;

function ManagerNavItem({ 
  manager, 
  depth = 0, 
  viewMode, 
  setViewMode 
}: any) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isActive = viewMode.type === 'sub' && viewMode.rootId === manager.id;
  const hasChildren = manager.managerChildren?.length > 0;
  
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 group">
        {hasChildren ? (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-black/5 rounded transition-colors"
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <div className="w-6" />
        )}
        <button 
          onClick={(e) => {
            if (e.button !== 0) return;
            setViewMode({ type: 'sub', rootId: manager.id });
          }}
          className={`flex-1 flex items-center gap-1.5 p-1.5 rounded-lg transition-all text-[12px] ${
            isActive
              ? 'bg-[#141414] text-white shadow-md' 
              : 'hover:bg-black/5 text-black/60'
          }`}
        >
          <GitBranch size={12} />
          <span className="truncate">{manager.name} {manager.department}</span>
        </button>
      </div>
      {hasChildren && isExpanded && (
        <div className="space-y-0.5 ml-3 border-l border-black/5">
          {manager.managerChildren.map((child: any) => (
            <ManagerNavItem 
              key={child.id} 
              manager={child} 
              depth={depth + 1} 
              viewMode={viewMode}
              setViewMode={setViewMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [orgName, setOrgName] = useState('我的組織');
  const [versionDate, setVersionDate] = useState(new Date().toLocaleDateString());
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_DATA);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showStorage, setShowStorage] = useState(false);
  const [showNewConfirm, setShowNewConfirm] = useState(false);
  const [tempSettings, setTempSettings] = useState({ 
    departments: [] as { name: string, code: string }[], 
    titles: [] as string[],
    memberTypes: [] as { name: string, color: string }[],
    canvasWidth: 33.867,
    canvasHeight: 19.05,
    showDepartmentCodes: false,
    showEmployeeIds: false,
    displayFilters: ['all'],
    companyName: ''
  });
  const [viewMode, setViewMode] = useState<ViewMode>({ type: 'main' });
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isSwapMode, setIsSwapMode] = useState(false);
  const [defaultAddType, setDefaultAddType] = useState('基層');
  const [exportViewId, setExportViewId] = useState<string>('current');
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(true);
  const [zoom, setZoom] = useState(0.8);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-sync logic for Executive and Sub-page flags
  useEffect(() => {
    const needsFix = employees.some(e => 
      (e.isExecutive || e.isSubPage) && !e.canBeProxy
    );

    if (needsFix) {
      setEmployees(prev => prev.map(e => {
        if ((e.isExecutive || e.isSubPage) && !e.canBeProxy) {
          return { ...e, canBeProxy: true };
        }
        return e;
      }));
    }
  }, [employees]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      setSidebarWidth(Math.max(240, Math.min(600, e.clientX)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Mouse wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setZoom(prev => Math.max(0.1, Math.min(2, prev + delta)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Load from LocalStorage on mount
  useEffect(() => {
    const saved = loadFromLocalStorage();
    if (saved) {
      setOrgName(saved.orgName);
      if (saved.versionDate) setVersionDate(saved.versionDate);
      setEmployees(saved.employees);
      setAnnotations(saved.annotations);
      setSettings({ ...INITIAL_SETTINGS, ...saved.settings });
    }
  }, []);

  // Auto-save to LocalStorage
  useEffect(() => {
    saveToLocalStorage({
      orgName,
      versionDate,
      employees,
      annotations,
      settings
    });
  }, [orgName, versionDate, employees, annotations, settings]);

  // Reset view if current sub-view root is no longer a manager
  useEffect(() => {
    if (viewMode.type === 'sub') {
      const root = employees.find(e => e.id === viewMode.rootId);
      if (!root || !root.isSubPage) {
        setViewMode({ type: 'main' });
      }
    }
  }, [employees, viewMode]);

  // Helper to build tree with level limit or specific root
  const buildOrgTree = (data: Employee[], mode: ViewMode) => {
    const map = new Map<string, OrgNode>();
    data.forEach(emp => map.set(emp.id, { ...emp, children: [] }));
    
    let root: OrgNode | null = null;
    
    if (mode.type === 'table') return null;
    
    if (mode.type === 'main' || mode.type === 'sub') {
      const roots = mode.type === 'main'
        ? data.filter(e => !e.parentId || !map.has(e.parentId))
        : data.filter(e => e.id === mode.rootId);
      
      if (roots.length === 0) return null;

      const visited = new Set<string>();
      const build = (node: OrgNode, currentDepth: number, searchId: string) => {
        if (visited.has(searchId)) return;
        visited.add(searchId);
        
        const children = data
          .filter(emp => emp.parentId === searchId)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        children.forEach(emp => {
          const childNode = map.get(emp.id)!;

          const hasSubordinates = data.some(e => e.parentId === emp.id);
          const isManagerial = childNode.isSubPage || childNode.isExecutive || childNode.isSpecialAssistant || hasSubordinates;

          if (isManagerial) {
            // Pruning: stop at sub-pages if they are NOT the root of the current view
            const isCurrentRoot = mode.type === 'sub' && mode.rootId === childNode.id;
            if (childNode.isSubPage && !isCurrentRoot) {
              node.children!.push(childNode);
              return;
            }

            node.children!.push(childNode);
            build(childNode, currentDepth + 1, childNode.id);
          } else {
            // Regular staff: add as leaf node
            node.children!.push(childNode);
          }
        });
      };

      if (roots.length === 1) {
        root = map.get(roots[0].id)!;
        build(root, 1, root.id);
      } else {
        // Create a virtual root for multiple executives/roots
        root = {
          id: 'virtual-root',
          name: '首頁',
          title: '',
          department: '',
          isSubPage: true,
          isVirtual: true,
          children: []
        };
        roots.forEach(r => {
          const childNode = map.get(r.id)!;
          root!.children!.push(childNode);
          build(childNode, 1, childNode.id);
        });
      }
    }
    
    return root;
  };

  // Helper to check if A is ancestor of B
  const isAncestorOf = (data: Employee[], ancestorId: string, descendantId: string): boolean => {
    let current = data.find(e => e.id === descendantId);
    while (current && current.parentId) {
      if (current.parentId === ancestorId) return true;
      current = data.find(e => e.id === current.parentId);
    }
    return false;
  };

  // Helper to get depth of B relative to A (A is depth 0)
  const getDepthFrom = (data: Employee[], ancestorId: string, descendantId: string): number => {
    if (ancestorId === descendantId) return 0;
    let depth = 0;
    let current = data.find(e => e.id === descendantId);
    while (current && current.parentId) {
      depth++;
      if (current.parentId === ancestorId) return depth;
      current = data.find(e => e.id === current.parentId);
    }
    return -1;
  };

  const orgTree = useMemo(() => buildOrgTree(employees, viewMode), [employees, viewMode, refreshKey]);

  // Identify all managers for the menu (those with sub-pages)
  const departmentManagers = useMemo(() => {
    return employees.filter(e => e.isSubPage);
  }, [employees, refreshKey]);

  // Build a tree of managers for the sidebar
  const managerTree = useMemo(() => {
    const managers = employees.filter(e => e.isSubPage);
    const managerIds = new Set(managers.map(m => m.id));
    
    const visited = new Set<string>();
    const buildTree = (manager: Employee): any => {
      if (visited.has(manager.id)) return { ...manager, managerChildren: [] };
      visited.add(manager.id);
      const children = managers.filter(m => m.parentId === manager.id);
      return {
        ...manager,
        managerChildren: children.map(buildTree)
      };
    };

    // Root managers are those who are managers but their parent is NOT a manager (or they have no parent)
    const roots = managers.filter(m => {
      if (!m.parentId) return true;
      return !managerIds.has(m.parentId);
    });

    return roots.map(buildTree);
  }, [employees, refreshKey]);

  const selectedEmployee = useMemo(() => 
    employees.find(e => e.id === selectedId), 
  [employees, selectedId]);

  const handleNodeClick = (node: Employee) => {
    if (isSwapMode && selectedId && selectedId !== node.id) {
      const selected = employees.find(e => e.id === selectedId);
      if (selected && selected.parentId === node.parentId) {
        // Swap sortOrder
        const selectedOrder = selected.sortOrder ?? 0;
        const nodeOrder = node.sortOrder ?? 0;
        
        const newEmployees = employees.map(e => {
          if (e.id === selectedId) return { ...e, sortOrder: nodeOrder };
          if (e.id === node.id) return { ...e, sortOrder: selectedOrder };
          return e;
        });
        setEmployees(newEmployees);
        setIsSwapMode(false);
        return;
      } else {
        alert('請選擇同一位主管底下的成員進行順序調整');
        setIsSwapMode(false);
        return;
      }
    }
    setSelectedId(node.id);
  };

  const handleAddEmployee = () => {
    if (!selectedId || !selectedEmployee) {
      alert('請先點選一位員工作為上級主管');
      return;
    }

    // Constraint: If the parent of the selected employee has subordinates arranged in > 2 rows,
    // then the selected employee (who is one of those subordinates) cannot have children.
    if (selectedEmployee.parentId) {
      const parent = employees.find(e => e.id === selectedEmployee.parentId);
      if (parent) {
        const siblings = employees.filter(e => e.parentId === parent.id);
        const subordinatesPerRow = parent.subordinatesPerRow || 5;
        
        // We only care about rows if they are currently in a grid (all siblings are leaf nodes)
        const allSiblingsAreLeaf = siblings.every(s => !employees.some(e => e.parentId === s.id));
        
        if (allSiblingsAreLeaf) {
          const rows = Math.ceil(siblings.length / subordinatesPerRow);
          if (rows > 2) {
            alert('由於上級主管的部屬排列已超過二列，該層級成員目前無法新增下屬。');
            return;
          }
        }
      }
    }

    const siblings = employees.filter(e => e.parentId === selectedId);
    const maxSortOrder = siblings.length > 0 
      ? Math.max(...siblings.map(s => s.sortOrder || 0)) 
      : -1;

    const newId = `emp-${Date.now()}`;
    const newEmp: Employee = {
      id: newId,
      name: '新員工',
      title: settings.titles[0] || '職稱',
      department: selectedEmployee.department,
      departmentCode: selectedEmployee.departmentCode,
      parentId: selectedId,
      memberType: defaultAddType,
      sortOrder: maxSortOrder + 1
    };

    // Validate if adding this employee exceeds canvas width or height
    const nextEmployees = [...employees, newEmp];
    const mainTree = buildOrgTree(nextEmployees, { type: 'main' });
    if (mainTree) {
      const { width: treeWidth, height: treeHeight } = calculateTreeSize(mainTree);
      if (treeWidth > settings.canvasWidth * CM_TO_PX) {
        alert('水平人數達上限，請調整部屬排列方式');
        return;
      }
      if (treeHeight > settings.canvasHeight * CM_TO_PX) {
        alert('垂直人數達上限，請調整排列人數');
        return;
      }
    }

    setEmployees(nextEmployees);
    // setSelectedId(newId); // Removed to maintain selection on the parent
  };

  const calculateTreeSize = (root: OrgNode): { width: number, height: number } => {
    // This logic must mirror OrgChart.tsx's calculateDimensions and positionNodes
    const scale = 25.4 / 33.867;
    const nodeWidth = 2.16 * CM_TO_PX * scale;
    const nodeHeight = 2 * CM_TO_PX * scale;
    const leafWidth = nodeWidth + 0.375 * CM_TO_PX * scale;
    const groupGap = 1.125 * CM_TO_PX * scale;
    const asstHorizontalGap = 10 * scale;
    const asstVerticalGap = 10 * scale;
    const asstPerRowLocal = 3;
    const asstPerRowGrid = 10;

    const nodeInfo = new Map<string, { reservedWidth: number, height: number, asstHeight: number }>();

    const getReservedWidth = (n: OrgNode): number => {
      if (nodeInfo.has(n.id)) return nodeInfo.get(n.id)!.reservedWidth;

      const regularChildren = n.children?.filter(c => !c.isSpecialAssistant) || [];
      const assistants = n.children?.filter(c => c.isSpecialAssistant) || [];
      const subordinatesPerRow = n.subordinatesPerRow || 5;

      let asstHeight = 0;
      if (assistants.length > 0) {
        const rows = Math.ceil(assistants.length / asstPerRowGrid);
        asstHeight = rows * nodeHeight + (rows - 1) * 10 * scale;
      }

      if (regularChildren.length === 0) {
        const h = nodeHeight + asstHeight + 10 * scale;
        nodeInfo.set(n.id, { reservedWidth: leafWidth, height: h, asstHeight });
        return leafWidth;
      }

      const canUseGrid = regularChildren.every(c => (!c.children || c.children.length === 0) && !c.isSubPage);
      const effectivePerRow = canUseGrid ? subordinatesPerRow : regularChildren.length;

      const colWidths: number[] = [];
      const rowHeights: number[] = [];
      regularChildren.forEach((child, i) => {
        const col = i % effectivePerRow;
        const row = Math.floor(i / effectivePerRow);
        const rw = getReservedWidth(child);
        const h = nodeInfo.get(child.id)!.height;
        colWidths[col] = Math.max(colWidths[col] || 0, rw);
        rowHeights[row] = Math.max(rowHeights[row] || 0, h);
      });

      const totalReservedWidth = colWidths.reduce((a, b) => a + b, 0) + (colWidths.length - 1) * groupGap;
      const allChildrenNoManager = regularChildren.every(c => !c.isManagerLabel && (!c.children || c.children.length === 0));
      const currentStaffGapY = allChildrenNoManager ? 22.5 * scale : 30 * scale;
      const childrenHeight = rowHeights.reduce((a, b) => a + b, 0) + (rowHeights.length - 1) * currentStaffGapY;
      const totalHeight = nodeHeight + asstHeight + currentStaffGapY + childrenHeight;

      nodeInfo.set(n.id, { reservedWidth: totalReservedWidth, height: totalHeight, asstHeight });
      return totalReservedWidth;
    };

    getReservedWidth(root);

    let minX = 0;
    let maxX = 0;

    const position = (n: OrgNode, x: number) => {
      minX = Math.min(minX, x - nodeWidth / 2);
      maxX = Math.max(maxX, x + nodeWidth / 2);

      const assistants = n.children?.filter(c => c.isSpecialAssistant) || [];
      assistants.forEach((_, i) => {
        const col = i % asstPerRowLocal;
        const asstX = x + nodeWidth / 2 + asstHorizontalGap + col * (nodeWidth + asstHorizontalGap) + nodeWidth / 2;
        minX = Math.min(minX, asstX - nodeWidth / 2);
        maxX = Math.max(maxX, asstX + nodeWidth / 2);
      });

      const children = n.children?.filter(c => !c.isSpecialAssistant) || [];
      if (children.length > 0) {
        const subordinatesPerRow = n.subordinatesPerRow || 5;
        const canUseGrid = children.every(c => (!c.children || c.children.length === 0) && !c.isSubPage);
        const effectivePerRow = canUseGrid ? subordinatesPerRow : children.length;

        const colWidths: number[] = [];
        children.forEach((child, i) => {
          const col = i % effectivePerRow;
          colWidths[col] = Math.max(colWidths[col] || 0, nodeInfo.get(child.id)!.reservedWidth);
        });

        const totalWidth = colWidths.reduce((a, b) => a + b, 0) + (colWidths.length - 1) * groupGap;
        let startX = x - totalWidth / 2;

        children.forEach((child, i) => {
          const col = i % effectivePerRow;
          let colX = startX;
          for (let c = 0; c < col; c++) {
            colX += colWidths[c] + groupGap;
          }
          const childX = colX + colWidths[col] / 2;
          position(child, childX);
        });
      }
    };

    position(root, 0);
    return { width: maxX - minX, height: nodeInfo.get(root.id)!.height };
  };

  const handleUpdateEmployee = (updates: Partial<Employee>) => {
    if (!selectedId) return;
    
    const currentEmp = employees.find(e => e.id === selectedId);
    
    // Prevent unchecking the only executive
    if (updates.isExecutive === false && currentEmp?.isExecutive) {
      alert('經營階層必須存在一位，請透過勾選其他人員來更換經營階層');
      return;
    }

    let finalUpdates = { ...updates };

    // Restrict only one root (parentId === undefined)
    if (updates.hasOwnProperty('parentId') && updates.parentId === undefined) {
      const otherRoots = employees.filter(e => !e.parentId && e.id !== selectedId);
      if (otherRoots.length > 0) {
        alert('組織圖只能有一位頂層主管（無直屬主管）。請先為其他頂層人員設定主管。');
        return;
      }
    }

    // Cycle detection: cannot select a descendant as a parent
    if (updates.parentId && currentEmp) {
      const isDescendant = (parentId: string, targetId: string): boolean => {
        const children = employees.filter(e => e.parentId === parentId);
        if (children.some(c => c.id === targetId)) return true;
        return children.some(c => isDescendant(c.id, targetId));
      };

      if (isDescendant(currentEmp.id, updates.parentId)) {
        alert('不能選擇自己的部屬(或部屬的部屬)當作自己直屬，否則會變成死循環。');
        return;
      }
    }
    
    // Proxy logic: when a proxy is selected, clear name/ID and update title
    if (updates.proxyId && updates.proxyId !== currentEmp?.proxyId) {
      const proxy = employees.find(e => e.id === updates.proxyId);
      if (proxy) {
        finalUpdates.name = '';
        finalUpdates.employeeId = '';
        finalUpdates.title = proxy.title;
      }
    }

    // Auto-link department code
    if (updates.department) {
      const deptInfo = settings.departments.find(d => d.name === updates.department);
      if (deptInfo) {
        finalUpdates.departmentCode = deptInfo.code;
      }
    }

    // Special Assistant logic: mutually exclusive with sub-page roles
    if (updates.isSpecialAssistant === true) {
      // Check if has subordinates
      const hasSubordinates = employees.some(e => e.parentId === selectedId);
      if (hasSubordinates) {
        alert('底下有帶人的成員，不能擔任特助');
        return;
      }

      // Check limit of 2
      const parentId = selectedEmployee.parentId;
      if (parentId) {
        const assistants = employees.filter(e => e.parentId === parentId && e.isSpecialAssistant && e.id !== selectedId);
        if (assistants.length >= 2) {
          alert('每個主管最多只能擁有 2 位特助');
          return;
        }
      }
      finalUpdates.isSubPage = false;
      finalUpdates.isExecutive = false;
    } else if (updates.isSubPage === true || updates.isExecutive === true || updates.isManagerLabel === true) {
      finalUpdates.isSpecialAssistant = false;
      
      // Sync logic: if checking Executive or Sub-page, also ensure they can be a proxy
      if (updates.isExecutive === true || updates.isSubPage === true) {
        finalUpdates.canBeProxy = true;
      }
    }

    // Validate if update exceeds canvas width
    const nextEmployees = employees.map(e => {
      if (e.id === selectedId) {
        const updated = { ...e, ...finalUpdates };
        if (updated.isManagerLabel === false) {
          updated.proxyId = undefined;
        }
        return updated;
      }
      if (updates.isManagerLabel === false && e.parentId === selectedId) {
        return { ...e, isSpecialAssistant: false };
      }
      if (updates.isExecutive === true) {
        return { ...e, isExecutive: false };
      }
      return e;
    });

    const nextTree = buildOrgTree(nextEmployees, { type: 'main' });
    if (nextTree) {
      const { width: treeWidth, height: treeHeight } = calculateTreeSize(nextTree);
      if (treeWidth > settings.canvasWidth * CM_TO_PX) {
        alert('水平人數達上限，請調整部屬排列方式');
        return;
      }
      if (treeHeight > settings.canvasHeight * CM_TO_PX) {
        alert('垂直人數達上限，請調整排列人數');
        return;
      }
    }

    setEmployees(nextEmployees);
  };

  const handleDeleteEmployee = (id: string) => {
    const empToDelete = employees.find(e => e.id === id);
    if (!empToDelete) return;

    if (empToDelete.isExecutive) {
      alert('經營階層為唯一且無法刪除');
      return;
    }
    if (employees.length <= 1) return;

    const deletedParentId = empToDelete.parentId;
    
    // Get existing siblings at the new parent level to determine starting sortOrder
    const existingSiblings = employees.filter(e => e.parentId === deletedParentId && e.id !== id);
    const maxSortOrder = existingSiblings.length > 0 
      ? Math.max(...existingSiblings.map(s => s.sortOrder || 0)) 
      : -1;

    let asstCount = 0;
    const nextEmployees = employees
      .filter(e => e.id !== id)
      .map(e => {
        if (e.parentId === id) {
          asstCount++;
          return { ...e, parentId: deletedParentId, sortOrder: maxSortOrder + asstCount };
        }
        return e;
      });

    // Validate if deletion/re-parenting exceeds canvas width or height
    const mainTree = buildOrgTree(nextEmployees, { type: 'main' });
    if (mainTree) {
      const { width: treeWidth, height: treeHeight } = calculateTreeSize(mainTree);
      if (treeWidth > settings.canvasWidth * CM_TO_PX) {
        alert('刪除後部屬遞補將導致水平人數達上限，請先調整排列方式。');
        return;
      }
      if (treeHeight > settings.canvasHeight * CM_TO_PX) {
        alert('刪除後部屬遞補將導致垂直人數達上限，請先調整排列方式。');
        return;
      }
    }

    setEmployees(nextEmployees);
    setSelectedId(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await parseExcel(file);
      
      // Update settings if departments or titles mapping is found in Excel
      if ((result.departments && result.departments.length > 0) || (result.titles && result.titles.length > 0)) {
        setSettings(prev => ({ 
          ...prev, 
          departments: result.departments && result.departments.length > 0 ? result.departments : prev.departments,
          titles: result.titles && result.titles.length > 0 ? result.titles : prev.titles
        }));
      }
      
      // Auto-link department codes
      const currentDepts = result.departments || settings.departments;
      const linkedEmployees = result.employees.map(emp => {
        let updated = { ...emp };
        
        // Link dept code
        const deptInfo = currentDepts.find(d => d.name === emp.department);
        if (deptInfo) {
          updated.departmentCode = deptInfo.code;
        }
        
        return updated;
      });
      
      setEmployees(linkedEmployees);
      if (result.orgName) setOrgName(result.orgName);
      if (result.versionDate) setVersionDate(result.versionDate);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Excel 匯入失敗，請檢查格式');
    }
    // Reset input
    e.target.value = '';
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      handleUpdateEmployee({ photo: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = () => {
    const newDepts = tempSettings.departments.filter(d => d.name.trim() !== '');
    const newTitles = tempSettings.titles.filter(s => s.trim() !== '');
    const newMemberTypes = tempSettings.memberTypes.filter(mt => mt.name.trim() !== '');
    
    const oldDepts = settings.departments;
    const oldTitles = settings.titles;
    const oldMemberTypes = settings.memberTypes;

    setEmployees(prev => prev.map(emp => {
      let updatedEmp = { ...emp };
      
      // Smart sync for departments
      const oldDeptIndex = oldDepts.findIndex(d => d.name === emp.department);
      const isDeptStillPresent = newDepts.some(d => d.name === emp.department);
      
      if (!isDeptStillPresent && oldDeptIndex !== -1 && newDepts.length === oldDepts.length) {
        // Rename case: same index, different name, list length unchanged
        updatedEmp.department = newDepts[oldDeptIndex].name;
        updatedEmp.departmentCode = newDepts[oldDeptIndex].code;
      } else if (isDeptStillPresent) {
        // If name is present, ensure code is updated to the latest mapping
        const currentDept = newDepts.find(d => d.name === emp.department);
        if (currentDept) {
          updatedEmp.departmentCode = currentDept.code;
        }
      }
      
      // Smart sync for titles
      const oldTitleIndex = oldTitles.indexOf(emp.title);
      const isTitleStillPresent = newTitles.includes(emp.title);
      
      if (!isTitleStillPresent && oldTitleIndex !== -1 && newTitles.length === oldTitles.length) {
        updatedEmp.title = newTitles[oldTitleIndex];
      }

      // Smart sync for member types
      if (emp.memberType) {
        const oldTypeIndex = oldMemberTypes.findIndex(mt => mt.name === emp.memberType);
        const isTypeStillPresent = newMemberTypes.some(mt => mt.name === emp.memberType);
        if (!isTypeStillPresent && oldTypeIndex !== -1 && newMemberTypes.length === oldMemberTypes.length) {
          updatedEmp.memberType = newMemberTypes[oldTypeIndex].name;
        }
      }
      
      return updatedEmp;
    }));

    setSettings({ 
      departments: newDepts, 
      titles: newTitles,
      memberTypes: newMemberTypes,
      canvasWidth: Number(tempSettings.canvasWidth) || 33.867,
      canvasHeight: Number(tempSettings.canvasHeight) || 19.05,
      showDepartmentCodes: tempSettings.showDepartmentCodes,
      showEmployeeIds: tempSettings.showEmployeeIds,
      maxDisplayLevels: tempSettings.maxDisplayLevels,
      companyName: tempSettings.companyName
    });
    setShowSettings(false);
  };

  const addAnnotation = () => {
    const newAnnotation: Annotation = {
      id: `note-${Date.now()}`,
      text: '點擊編輯文字',
      x: 100,
      y: 100
    };
    setAnnotations([...annotations, newAnnotation]);
    setIsEraserMode(false);
  };

  const updateAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    const originalView = viewMode;

    try {
      if (exportViewId === 'all') {
        // Export All Pages
        const views: ViewMode[] = [
          { type: 'table' },
          { type: 'main' }, 
          ...departmentManagers.map(m => ({ type: 'sub', rootId: m.id } as ViewMode))
        ];
        let pdf: jsPDF | null = null;

        for (let i = 0; i < views.length; i++) {
          setViewMode(views[i]);
          // Wait for render
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const result = await captureElement('org-chart-canvas');
          if (result) {
            const { dataUrl, width, height } = result;
            if (!pdf) {
              pdf = new jsPDF({
                orientation: width > height ? 'landscape' : 'portrait',
                unit: 'px',
                format: [width, height],
                hotfixes: ["px_scaling"]
              });
            } else {
              pdf.addPage([width, height], width > height ? 'landscape' : 'portrait');
            }
            pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
          }
        }
        
        if (pdf) {
          pdf.save(`OrgChart_Full_${Date.now()}.pdf`);
        }
        setViewMode(originalView);
      } else {
        // Export Single Page
        if (exportViewId !== 'current') {
          const newView: ViewMode = exportViewId === 'table' 
            ? { type: 'table' } 
            : exportViewId === 'main' 
              ? { type: 'main' } 
              : { type: 'sub', rootId: exportViewId };
          setViewMode(newView);
          // Wait for render
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        await exportToPDF('org-chart-canvas', `OrgChart_${exportViewId}_${Date.now()}.pdf`);
        
        if (exportViewId !== 'current') {
          setViewMode(originalView);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleExportPPT = () => {
    if (exportViewId === 'all') {
      const views: ViewMode[] = [
        { type: 'table' },
        { type: 'main' }, 
        ...departmentManagers.map(m => ({ type: 'sub', rootId: m.id } as ViewMode))
      ];
      // For PPT, we only export chart views for now as EmployeeTable is a list
      const chartViews = views.filter(v => v.type !== 'table');
      const nodes = chartViews.map(v => buildOrgTree(employees, v)).filter(n => n !== null) as OrgNode[];
      exportToPPT(nodes, settings.canvasWidth, settings.canvasHeight);
    } else if (exportViewId === 'table') {
      // Table view export to PPT is not supported yet, or we can alert
      alert('人員設定總表暫不支援匯出為 PPT，請使用 PDF 匯出');
    } else {
      let targetNode = orgTree;
      if (exportViewId !== 'current') {
        const targetView: ViewMode = exportViewId === 'main' ? { type: 'main' } : { type: 'sub', rootId: exportViewId };
        targetNode = buildOrgTree(employees, targetView);
      }
      if (targetNode) {
        exportToPPT(targetNode, settings.canvasWidth, settings.canvasHeight);
      }
    }
  };

  const handleNewProject = () => {
    setEmployees([...INITIAL_DATA]);
    setAnnotations([]);
    setOrgName('我的組織');
    setVersionDate(new Date().toLocaleDateString());
    setViewMode({ type: 'main' });
    setSelectedId(null);
    setShowNewConfirm(false);
  };

  const handleSaveProject = () => {
    saveProject(employees, annotations, settings, orgName, versionDate);
  };

  const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await loadProject(file);
      setEmployees(data.employees);
      setAnnotations(data.annotations || []);
      if (data.settings) setSettings({ ...INITIAL_SETTINGS, ...data.settings });
      if (data.orgName) setOrgName(data.orgName);
      if (data.versionDate) setVersionDate(data.versionDate);
      setViewMode({ type: 'main' });
      alert('專案讀取成功');
    } catch (error) {
      console.error(error);
      alert('讀取失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
    }
    // Reset input
    e.target.value = '';
  };

  const fitToWindow = () => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const padding = viewMode.type === 'table' ? 0 : 48; // p-12 is 48px
    const containerWidth = container.clientWidth - (padding * 2);
    const containerHeight = container.clientHeight - (padding * 2);
    
    const chartWidth = settings.canvasWidth * CM_TO_PX;
    const chartHeight = settings.canvasHeight * CM_TO_PX;
    
    const scaleX = containerWidth / chartWidth;
    const scaleY = containerHeight / chartHeight;
    
    // Calculate the best fit zoom
    const newZoom = viewMode.type === 'table' ? 1 : Math.min(scaleX, scaleY);
    setZoom(Math.max(0.1, Math.min(2, newZoom)));
  };

  // Initial fit to window and when view mode/sidebar changes
  useEffect(() => {
    const timer = setTimeout(fitToWindow, 100);
    return () => clearTimeout(timer);
  }, [viewMode, sidebarWidth]);

  // Handle window resize
  useEffect(() => {
    window.addEventListener('resize', fitToWindow);
    return () => window.removeEventListener('resize', fitToWindow);
  }, [settings, viewMode, sidebarWidth]);

  const uniqueEmployeeCount = useMemo(() => {
    const personIds = new Set<string>();
    
    let targetEmployees = employees;
    if (viewMode.type === 'sub') {
      const descendantIds = new Set<string>();
      descendantIds.add(viewMode.rootId);
      const findDescendants = (id: string) => {
        employees.forEach(emp => {
          if (emp.parentId === id) {
            descendantIds.add(emp.id);
            findDescendants(emp.id);
          }
        });
      };
      findDescendants(viewMode.rootId);
      targetEmployees = employees.filter(e => descendantIds.has(e.id));
    }

    targetEmployees.forEach(emp => {
      // If there's a proxy, the "active person" is the proxy
      // Otherwise, it's the employee themselves
      personIds.add(emp.proxyId || emp.id);
    });
    return personIds.size;
  }, [employees, viewMode]);

  const cumulativeLevelCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    const executive = employees.find(e => e.isExecutive);
    if (!executive) return counts;

    const nodeDepths: Record<string, number> = {};
    const visited = new Set<string>();
    const traverse = (id: string, depth: number) => {
      if (visited.has(id)) return;
      visited.add(id);
      nodeDepths[id] = depth;
      employees.forEach(emp => {
        if (emp.parentId === id) {
          traverse(emp.id, depth + 1);
        }
      });
    };
    traverse(executive.id, 1);

    const depths = Object.values(nodeDepths);
    if (depths.length === 0) return counts;
    const maxDepth = Math.max(...depths);
    for (let i = 1; i <= maxDepth; i++) {
      counts[i] = depths.filter(d => d <= i).length;
    }
    return counts;
  }, [employees]);

  // Adjust display filters if count exceeds thresholds
  useEffect(() => {
    // Thresholds for cumulative counts
    // (Disabled for now)
  }, [cumulativeLevelCounts]);

  return (
    <div className={`flex h-screen bg-[#E4E3E0] font-sans text-[#141414] overflow-hidden ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      {/* Sidebar */}
      <aside 
        className="bg-white border-r border-[#141414] flex flex-col shrink-0"
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="p-4 border-b border-[#141414]">
          <h1 className="text-xl font-serif italic font-bold tracking-tight mb-0.5">OrgChart Pro</h1>
          <p className="text-[11px] uppercase tracking-widest opacity-50">設計者：Star Chen</p>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Top Section: System Settings, Project Management, Navigation Menu, Export */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4 border-b border-black/10">
            {/* System Settings */}
            <div className="space-y-1">
              <h3 className="text-[12px] font-bold uppercase tracking-widest opacity-40 px-2">系統設定</h3>
              <div className="grid grid-cols-2 gap-1">
                <button 
                  onClick={() => setShowStorage(true)}
                  className="flex items-center justify-center gap-1 p-1.5 border border-black/10 hover:bg-black/5 rounded-lg transition-colors text-[11px] uppercase font-bold"
                >
                  <Database size={12} />
                  存檔
                </button>
                <button 
                  onClick={() => {
                    setTempSettings({
                      departments: settings.departments.map(d => ({ ...d })),
                      titles: [...settings.titles],
                      memberTypes: settings.memberTypes.map(mt => ({ ...mt })),
                      canvasWidth: settings.canvasWidth,
                      canvasHeight: settings.canvasHeight,
                      showDepartmentCodes: settings.showDepartmentCodes,
                      showEmployeeIds: settings.showEmployeeIds,
                      companyName: settings.companyName || ''
                    });
                    setShowSettings(true);
                  }}
                  className="flex items-center justify-center gap-1 p-1.5 border border-black/10 hover:bg-black/5 rounded-lg transition-colors text-[11px] uppercase font-bold"
                >
                  <SettingsIcon size={12} />
                  設定
                </button>
              </div>
            </div>

            {/* Project Controls */}
            <div className="space-y-1">
              <h3 className="text-[12px] font-bold uppercase tracking-widest opacity-40 px-2">專案管理</h3>
            <div className="grid grid-cols-3 gap-1">
              <button 
                onClick={() => setShowNewConfirm(true)}
                className="flex flex-col items-center justify-center gap-0.5 p-1.5 border border-black/10 hover:bg-black/5 rounded-lg transition-colors"
                title="開新專案"
              >
                <FilePlus size={14} />
                <span className="text-[11px] uppercase font-bold">新建</span>
              </button>
              <button 
                onClick={handleSaveProject}
                className="flex flex-col items-center justify-center gap-0.5 p-1.5 border border-black/10 hover:bg-black/5 rounded-lg transition-colors"
                title="另存專案"
              >
                <Save size={14} />
                <span className="text-[11px] uppercase font-bold">另存</span>
              </button>
              <label className="flex flex-col items-center justify-center gap-0.5 p-1.5 border border-black/10 hover:bg-black/5 rounded-lg transition-colors cursor-pointer" title="讀取專案">
                <FolderOpen size={14} />
                <span className="text-[11px] uppercase font-bold">讀取</span>
                <input type="file" accept=".json" className="hidden" onChange={handleLoadProject} />
              </label>
            </div>

            {/* Excel Actions moved here */}
            <div className="grid grid-cols-2 gap-1 mt-1">
              <div className="flex flex-col gap-0.5">
                <label className="flex items-center justify-center gap-1.5 p-1.5 border border-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer text-[11px] font-bold uppercase tracking-wider h-[32px]">
                  <Upload size={12} />
                  匯入 Excel
                  <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                </label>
                <button 
                  onClick={downloadExcelTemplate}
                  className="text-[9px] text-center uppercase tracking-tighter opacity-50 hover:opacity-100 transition-opacity underline"
                >
                  下載範例檔
                </button>
              </div>
              <div className="flex flex-col gap-0.5">
                <button 
                  onClick={() => exportToExcel(employees, orgName, versionDate, settings.departments, settings.titles)}
                  className="flex items-center justify-center gap-1.5 p-1.5 border border-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer text-[11px] font-bold uppercase tracking-wider h-[32px]"
                >
                  <Download size={12} />
                  匯出 Excel
                </button>
              </div>
            </div>

          {/* Actions */}
          <div className="space-y-2">
            <div className="flex flex-col gap-1">
              <div className="mb-0.5">
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 block mb-0.5">指定匯出頁面</label>
                <select 
                  value={exportViewId}
                  onChange={(e) => setExportViewId(e.target.value)}
                  className="w-full p-1 text-[10px] border border-black/10 rounded bg-white/50 outline-none"
                >
                  <option value="current">目前畫面</option>
                  <option value="all">匯出全部頁面</option>
                  <option value="table">人員設定總表</option>
                  <option value="main">首頁 (Page 1)</option>
                  {departmentManagers.map((m, idx) => (
                    <option key={m.id} value={m.id}>子分頁: {m.name} {m.department} (Page {idx + 2})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button 
                  onClick={handleExportPPT}
                  className="flex items-center justify-center gap-1.5 p-1.5 border border-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer text-[11px] font-bold uppercase tracking-wider h-[32px]"
                >
                  <Download size={12} />
                  匯出 PPT
                </button>
                <button 
                  onClick={handleExportPDF}
                  disabled={isExportingPDF}
                  className={`flex items-center justify-center gap-1.5 p-1.5 border border-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer text-[11px] font-bold uppercase tracking-wider h-[32px] ${isExportingPDF ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isExportingPDF ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                  匯出 PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Bottom Section: Add Subordinate, Member Attributes */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-gray-50/30">
          <AnimatePresence mode="wait">
            {selectedEmployee ? (
              <motion.div 
                key={selectedEmployee.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                <div className="flex gap-1">
                  <button 
                    onClick={handleAddEmployee}
                    className="flex-1 flex items-center justify-center gap-1.5 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all shadow-lg shadow-indigo-200 font-bold uppercase tracking-widest text-[11px]"
                  >
                    <Plus size={14} />
                    新增部屬
                  </button>
                  <select
                    value={defaultAddType}
                    onChange={(e) => setDefaultAddType(e.target.value)}
                    className="w-20 p-1 text-[10px] border border-black/10 rounded bg-white/50 outline-none font-bold"
                    title="設定新增部屬的預設類型"
                  >
                    {settings.memberTypes.map(mt => (
                      <option key={mt.name} value={mt.name}>{mt.name}</option>
                    ))}
                  </select>
                </div>

                <button 
                  onClick={() => setIsSwapMode(!isSwapMode)}
                  className={`w-full flex items-center justify-center gap-1.5 p-2 rounded-lg transition-all shadow-lg font-bold uppercase tracking-widest text-[11px] ${
                    isSwapMode 
                      ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-200 animate-pulse' 
                      : 'bg-white border border-black/10 hover:bg-black/5 text-black/70'
                  }`}
                >
                  <RefreshCw size={14} className={isSwapMode ? 'animate-spin' : ''} />
                  調整順序
                </button>

                <div className="space-y-1.5 pt-3 border-t border-black/10">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-50">成員個人屬性</h3>
                    <button 
                      onClick={() => handleDeleteEmployee(selectedEmployee.id)}
                      className="text-red-500 hover:text-red-700 transition-colors p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex gap-3 items-start">
                    <div className="relative group shrink-0">
                      <div className="w-16 h-16 rounded-full bg-gray-100 border border-black/5 overflow-hidden flex items-center justify-center relative">
                        {selectedEmployee.photo ? (
                          <img src={selectedEmployee.photo} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <ImageIcon className="text-black/20" size={24} />
                        )}
                        <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                          <Upload className="text-white" size={16} />
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                        </label>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="space-y-0">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">姓名</label>
                        <input 
                          type="text" 
                          value={selectedEmployee.name}
                          onChange={e => handleUpdateEmployee({ name: e.target.value })}
                          className="w-full p-0.5 border-b border-black/10 focus:border-black outline-none bg-transparent text-[13px]"
                          placeholder="未設定"
                        />
                      </div>
                      <div className="space-y-0">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">工號</label>
                        <input 
                          type="text" 
                          value={selectedEmployee.employeeId || ''}
                          onChange={e => handleUpdateEmployee({ employeeId: e.target.value })}
                          className="w-full p-0.5 border-b border-black/10 focus:border-black outline-none bg-transparent text-[13px]"
                          placeholder="未設定"
                        />
                      </div>
                      <div className="space-y-0">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">職稱</label>
                        <select 
                          value={selectedEmployee.title}
                          onChange={e => handleUpdateEmployee({ title: e.target.value })}
                          className="w-full p-0.5 border-b border-black/10 focus:border-black outline-none bg-transparent appearance-none text-[13px]"
                        >
                          {settings.titles.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">部門</label>
                      <select 
                        value={selectedEmployee.department}
                        onChange={e => handleUpdateEmployee({ department: e.target.value })}
                        className="w-full p-0.5 border-b border-black/10 focus:border-black outline-none bg-transparent appearance-none text-[13px]"
                      >
                        {settings.departments.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-0">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">部門代號</label>
                      <input 
                        type="text" 
                        value={selectedEmployee.departmentCode || ''}
                        readOnly
                        className="w-full p-0.5 border-b border-black/10 focus:border-black outline-none bg-gray-50 text-gray-500 text-[13px]"
                        placeholder="自動連動"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">類型</label>
                      <select 
                        value={selectedEmployee.memberType || ''}
                        onChange={e => handleUpdateEmployee({ memberType: e.target.value })}
                        className="w-full p-0.5 border-b border-black/10 focus:border-black outline-none bg-transparent appearance-none text-[13px]"
                      >
                        <option value="">請選擇類型</option>
                        {settings.memberTypes.map(mt => (
                          <option key={mt.name} value={mt.name}>{mt.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-0">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">直屬主管</label>
                      <select 
                        value={selectedEmployee.parentId || ''}
                        onChange={e => handleUpdateEmployee({ parentId: e.target.value || undefined })}
                        className="w-full p-0.5 border-b border-black/10 focus:border-black outline-none bg-transparent appearance-none text-[13px]"
                      >
                        <option value="">無 (頂層)</option>
                        {employees
                          .filter(e => {
                            if (e.id === selectedEmployee.id) return false;
                            if (viewMode.type === 'sub') {
                              const subTree = buildOrgTree(employees, viewMode);
                              if (subTree) {
                                const descendantIds = new Set<string>();
                                const collectIds = (node: OrgNode) => {
                                  descendantIds.add(node.id);
                                  node.children?.forEach(collectIds);
                                };
                                collectIds(subTree);
                                return descendantIds.has(e.id);
                              }
                            }
                            return true;
                          })
                          .map(e => (
                            <option key={e.id} value={e.id}>{e.name} ({e.title})</option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 py-1">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="isExecutive"
                        checked={selectedEmployee.isExecutive || false}
                        onChange={e => handleUpdateEmployee({ isExecutive: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#141414]"
                      />
                      <label htmlFor="isExecutive" className="text-[11px] font-bold uppercase tracking-widest opacity-60 cursor-pointer">
                        經營階層
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="canBeProxy"
                        checked={selectedEmployee.canBeProxy || false}
                        onChange={e => handleUpdateEmployee({ canBeProxy: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#141414]"
                      />
                      <label htmlFor="canBeProxy" className="text-[11px] font-bold uppercase tracking-widest opacity-60 cursor-pointer">
                        代理人資料庫
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="isManagerLabel"
                        checked={selectedEmployee.isManagerLabel || false}
                        onChange={e => handleUpdateEmployee({ isManagerLabel: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#141414]"
                      />
                      <label htmlFor="isManagerLabel" className="text-[11px] font-bold uppercase tracking-widest opacity-60 cursor-pointer">
                        主管標籤
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="isSubPage"
                        checked={selectedEmployee.isSubPage || false}
                        onChange={e => {
                          const checked = e.target.checked;
                          handleUpdateEmployee({ 
                            isSubPage: checked, 
                            proxyId: checked ? selectedEmployee.proxyId : undefined
                          });
                        }}
                        className="w-3.5 h-3.5 accent-[#141414]"
                      />
                      <label htmlFor="isSubPage" className="text-[11px] font-bold uppercase tracking-widest opacity-60 cursor-pointer">
                        展開子分頁
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="isSpecialAssistant"
                        disabled={(() => {
                          if (!selectedEmployee.parentId) return true;
                          const parent = employees.find(e => e.id === selectedEmployee.parentId);
                          if (!parent?.isManagerLabel) return true;
                          // Check if has subordinates
                          return employees.some(e => e.parentId === selectedEmployee.id);
                        })()}
                        checked={selectedEmployee.isSpecialAssistant || false}
                        onChange={e => handleUpdateEmployee({ isSpecialAssistant: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#141414] disabled:opacity-30"
                      />
                      <label htmlFor="isSpecialAssistant" className={`text-[11px] font-bold uppercase tracking-widest opacity-60 cursor-pointer ${(() => {
                        if (!selectedEmployee.parentId) return true;
                        const parent = employees.find(e => e.id === selectedEmployee.parentId);
                        if (!parent?.isManagerLabel) return true;
                        return employees.some(e => e.parentId === selectedEmployee.id);
                      })() ? 'cursor-not-allowed opacity-30' : ''}`}>
                        擔任特助
                      </label>
                    </div>
                  </div>

                  {selectedEmployee.isManagerLabel && (
                    <div className="space-y-1 mt-0.5 p-1.5 bg-black/5 rounded-lg border border-black/5">
                      <div className="space-y-0">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">代理人 (Proxy)</label>
                        <select 
                          value={selectedEmployee.proxyId || ''}
                          onChange={e => handleUpdateEmployee({ proxyId: e.target.value || undefined })}
                          className="w-full p-0.5 text-[12px] border-b border-black/10 focus:border-black outline-none bg-transparent appearance-none"
                        >
                          <option value="">無代理人</option>
                          {employees
                            .filter(e => e.canBeProxy && e.id !== selectedEmployee.id)
                            .map(e => (
                              <option key={e.id} value={e.id}>{e.name} ({e.title})</option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-0">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">部屬排列人數 (每列)</label>
                        <select 
                          value={selectedEmployee.subordinatesPerRow || 5}
                          onChange={e => handleUpdateEmployee({ subordinatesPerRow: parseInt(e.target.value) })}
                          className="w-full p-0.5 text-[12px] border-b border-black/10 focus:border-black outline-none bg-transparent appearance-none"
                        >
                          {[1, 2, 3, 4, 5, 6].map(num => (
                            <option key={num} value={num}>{num} 人</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="nav-menu"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Navigation Menu */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40">導覽選單</h3>
                    <button 
                      onClick={handleRefresh}
                      className="p-1 hover:bg-black/5 rounded transition-colors opacity-40 hover:opacity-100"
                      title="重新整理所有組織表"
                    >
                      <RefreshCw key={refreshKey} size={10} className={refreshKey > 0 ? 'animate-spin-once' : ''} />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <div className="space-y-1">
                      <button 
                        onClick={() => setViewMode({ type: 'table' })}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg transition-all text-[13px] ${
                          viewMode.type === 'table' 
                            ? 'bg-[#141414] text-white shadow-lg' 
                            : 'bg-white border border-black/5 hover:bg-black/5 text-black/70'
                        }`}
                      >
                        <LayoutGrid size={14} />
                        <span className="font-medium">人員設定總表</span>
                      </button>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => setViewMode({ type: 'main' })}
                          className={`flex-1 flex items-center gap-2 p-2 rounded-lg transition-all text-[13px] ${
                            viewMode.type === 'main' 
                              ? 'bg-[#141414] text-white shadow-lg' 
                              : 'bg-white border border-black/5 hover:bg-black/5 text-black/70'
                          }`}
                        >
                          <LayoutGrid size={14} />
                          <span className="font-medium">首頁</span>
                        </button>
                        <input 
                          type="text"
                          value={settings.companyName || ''}
                          onChange={(e) => setSettings(prev => ({ ...prev, companyName: e.target.value }))}
                          placeholder="公司名稱"
                          className="w-24 p-1.5 text-[11px] border border-black/10 rounded outline-none focus:border-black/30 bg-white text-black shadow-sm"
                          title="設定顯示在首頁右上角的公司名稱"
                        />
                      </div>
                    </div>
                    
                    {managerTree.length > 0 && (
                      <div className="pl-3 space-y-1 border-l-2 border-black/5 ml-3 mt-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-30 mb-1">子分頁</p>
                        {managerTree.map(manager => (
                          <ManagerNavItem 
                            key={manager.id} 
                            manager={manager} 
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-3 bg-gray-50 border-t border-[#141414]">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest opacity-50">
            <span>Total Members</span>
            <span>{uniqueEmployeeCount}</span>
          </div>
        </div>
      </div>
    </aside>

      {/* Resizable Divider */}
      <div 
        className={`w-1 hover:w-1.5 bg-transparent hover:bg-indigo-500/30 transition-all cursor-col-resize z-50 relative group ${isResizing ? 'bg-indigo-500/50 w-1.5' : ''}`}
        onMouseDown={startResizing}
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>

      {/* Main View */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div 
          id="org-chart-container" 
          ref={containerRef}
          className="flex-1 relative overflow-auto bg-gray-100/50 custom-scrollbar"
        >
          <div className={`${viewMode.type === 'table' ? 'p-0' : 'p-12'} min-h-full w-fit h-fit`}>
            <div 
              id="org-chart-canvas"
              className={`relative bg-white shadow-2xl border border-black/5 shrink-0 origin-top-left transition-transform duration-300 ease-in-out ${viewMode.type === 'table' ? 'min-h-full overflow-hidden' : 'overflow-visible'}`}
              style={{ 
                width: viewMode.type === 'table' ? '100%' : `${settings.canvasWidth * CM_TO_PX}px`, 
                height: viewMode.type === 'table' ? 'auto' : `${settings.canvasHeight * CM_TO_PX}px`,
                transform: viewMode.type === 'table' ? 'none' : `scale(${zoom})`,
              }}
            >
            {/* Annotation Layer */}
            <div className="absolute inset-0 pointer-events-none z-10">
              {annotations.map(note => (
                <motion.div
                  key={note.id}
                  drag
                  dragMomentum={false}
                  onDragEnd={(_, info) => {
                    // Update state with final position
                    updateAnnotation(note.id, { 
                      x: note.x + info.offset.x, 
                      y: note.y + info.offset.y 
                    });
                  }}
                  // Use x/y for transform-based positioning which is smoother with drag
                  initial={{ x: note.x, y: note.y }}
                  animate={{ x: note.x, y: note.y }}
                  className="absolute pointer-events-auto group"
                >
                  <div className="relative">
                    {isEraserMode && (
                      <button 
                        onClick={() => deleteAnnotation(note.id)}
                        className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg z-30 hover:scale-110 transition-transform"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <div className={`flex items-center gap-2 p-3 rounded-xl min-w-[160px] transition-colors ${isEraserMode ? 'bg-red-50/90 border border-red-200' : ''}`}>
                      <div className="cursor-grab active:cursor-grabbing p-1 hover:bg-black/5 rounded">
                        <GripHorizontal size={14} className="text-black/30" />
                      </div>
                      <input 
                        type="text"
                        value={note.text}
                        onChange={(e) => updateAnnotation(note.id, { text: e.target.value })}
                        className="bg-transparent border-none outline-none text-sm font-serif italic w-full placeholder:text-black/20"
                        placeholder="輸入補充資訊..."
                        disabled={isEraserMode}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {viewMode.type === 'table' ? (
              <EmployeeTable 
                employees={employees}
                setEmployees={setEmployees}
                departments={settings.departments}
                titles={settings.titles}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                onGoHome={() => setViewMode({ type: 'main' })}
              />
            ) : orgTree ? (
              <OrgChart 
                key={`${viewMode.type}-${viewMode.rootId || 'main'}-${refreshKey}`}
                data={orgTree} 
                employees={employees}
                memberTypes={settings.memberTypes}
                onNodeClick={handleNodeClick} 
                onViewSubChart={(nodeId) => setViewMode({ type: 'sub', rootId: nodeId })}
                selectedId={selectedId}
                onDeselect={() => setSelectedId(null)}
                width={settings.canvasWidth * CM_TO_PX}
                height={settings.canvasHeight * CM_TO_PX}
                showDepartmentCodes={settings.showDepartmentCodes}
                showEmployeeIds={settings.showEmployeeIds}
                isSubChart={viewMode.type === 'sub'}
                companyName={settings.companyName}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/50 rounded-xl border-2 border-dashed border-black/10">
                <p className="text-sm font-medium uppercase tracking-widest opacity-30">查無組織資料</p>
              </div>
            )}
          </div>
        </div>
      </div>

        {/* Total Count Badge (Top Left) */}
        {(viewMode.type === 'main' || viewMode.type === 'sub') && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-black/10">
            <Users size={14} className="text-indigo-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">總人數:</span>
            <span className="text-sm font-serif italic font-bold text-indigo-600">{uniqueEmployeeCount}</span>
          </div>
        )}

        {/* Floating Toolbar */}
        {(viewMode.type === 'main' || viewMode.type === 'sub') && (
          <motion.div 
            drag
            dragMomentum={false}
            className="absolute bottom-4 left-4 z-30 flex flex-col gap-2 bg-white/90 backdrop-blur-md p-2 rounded-2xl shadow-2xl border border-black/10 cursor-default"
          >
            <div className="px-2 py-1 border-b border-black/5 mb-1 flex items-center justify-between gap-4 cursor-grab active:cursor-grabbing">
              <p className="text-[8px] font-bold uppercase tracking-widest opacity-30">工具</p>
              <GripHorizontal size={12} className="opacity-20" />
            </div>
            <button 
              onClick={addAnnotation}
              className={`p-3 rounded-xl transition-all ${!isEraserMode ? 'hover:bg-black/5 text-[#141414]' : 'text-gray-400 cursor-not-allowed'}`}
              title="新增文字方塊"
              disabled={isEraserMode}
            >
              <Type size={20} />
            </button>
            <button 
              onClick={() => setIsEraserMode(!isEraserMode)}
              className={`p-3 rounded-xl transition-all ${isEraserMode ? 'bg-red-500 text-white shadow-lg' : 'hover:bg-black/5 text-[#141414]'}`}
              title="橡皮擦模式"
            >
              <Eraser size={20} />
            </button>
            <button 
              onClick={handleRefresh}
              className="p-3 rounded-xl hover:bg-black/5 text-[#141414] transition-all"
              title="重新整理組織圖"
            >
              <RefreshCw key={refreshKey} size={20} className={refreshKey > 0 ? 'animate-spin-once' : ''} />
            </button>
          </motion.div>
        )}

        {/* Zoom Controls (Bottom Right) */}
        {viewMode.type !== 'table' && (
          <motion.div 
          drag
          dragMomentum={false}
          className="absolute bottom-6 right-6 z-40 flex items-center gap-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-2xl border border-black/10 cursor-move"
        >
          <div className="p-1 opacity-30">
            <GripHorizontal size={14} />
          </div>
          
          <button 
            onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
            className="p-1 hover:bg-black/5 rounded-lg transition-colors cursor-pointer"
            title="縮小"
          >
            <Minus size={16} />
          </button>
          
          <div className="flex flex-col items-center min-w-[100px] cursor-default">
            <input 
              type="range"
              min="0.1"
              max="2"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <span className="text-[10px] font-mono font-bold mt-1">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <button 
            onClick={() => setZoom(Math.min(2, zoom + 0.1))}
            className="p-1 hover:bg-black/5 rounded-lg transition-colors cursor-pointer"
            title="放大"
          >
            <Plus size={16} />
          </button>

          <div className="w-px h-4 bg-black/10 mx-1" />

          <button 
            onClick={fitToWindow}
            className="p-2 hover:bg-black/5 rounded-xl transition-all flex items-center gap-2 group cursor-pointer"
            title="依目前視窗調整"
          >
            <Maximize size={16} className="group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-bold uppercase tracking-widest">配合視窗</span>
          </button>
        </motion.div>
        )}
      </main>

      {/* New Project Confirmation Modal */}
      <AnimatePresence>
        {showNewConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-black/10 p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <FilePlus size={32} className="text-red-500" />
              </div>
              <h3 className="text-xl font-serif italic font-bold mb-2">建立新專案？</h3>
              <p className="text-sm text-gray-500 mb-8">
                確定要開新專案嗎？這將會清除目前所有的組織圖資料與備註，且無法復原。
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowNewConfirm(false)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-widest hover:bg-gray-200 transition-all rounded-xl"
                >
                  取消
                </button>
                <button 
                  onClick={handleNewProject}
                  className="flex-1 px-6 py-3 bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-red-700 transition-all rounded-xl shadow-lg shadow-red-200"
                >
                  確認新建
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Storage Manager Modal */}
      <AnimatePresence>
        {showStorage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-black/10"
            >
              <div className="p-6 border-b border-black/10 flex justify-between items-center bg-gray-50">
                <div>
                  <h3 className="text-lg font-serif italic font-bold">存儲管理員</h3>
                  <p className="text-[10px] uppercase tracking-widest opacity-50">Storage Manager</p>
                </div>
                <button onClick={() => setShowStorage(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between p-4 bg-black/5 rounded-2xl border border-black/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-xl shadow-sm">
                      <Database size={20} className="text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider">當前佔用空間</p>
                      <p className="text-[10px] opacity-50">LocalStorage Usage</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-mono font-bold">{getStorageSize()}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-indigo-600 rounded-full" />
                    <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-60">存儲狀態</h4>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="opacity-50">最後保存時間</span>
                      <span className="font-mono">{new Date().toLocaleTimeString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="opacity-50">自動保存</span>
                      <span className="text-green-600 font-bold uppercase tracking-tighter">已啟用</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                  <button 
                    onClick={() => {
                      if (window.confirm('確定要清除所有存儲資料嗎？這將無法復原。')) {
                        clearLocalStorage();
                        window.location.reload();
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all border border-red-100 group"
                  >
                    <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-widest">清除存儲並重置</span>
                  </button>
                  <p className="text-[9px] text-center opacity-40 italic">
                    清除存儲會刪除所有本地保存的資料，並恢復為初始狀態。
                  </p>
                </div>
              </div>

              <div className="p-6 border-t border-black/10 bg-gray-50 flex justify-end">
                <button 
                  onClick={() => setShowStorage(false)}
                  className="px-8 py-3 bg-[#141414] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-opacity-90 transition-all rounded-xl shadow-lg"
                >
                  關閉
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-black/10 flex justify-between items-center bg-gray-50">
                <h2 className="text-xl font-serif italic font-bold">系統設定</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest opacity-50">部門清單</label>
                    <button 
                      onClick={() => setTempSettings({
                        ...tempSettings,
                        departments: [...tempSettings.departments, { name: '', code: '' }]
                      })}
                      className="p-1 hover:bg-black/5 rounded-full text-indigo-600"
                      title="新增部門"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {tempSettings.departments.map((dept, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input 
                          type="text"
                          className="flex-1 p-2 border border-black/10 rounded-lg focus:border-black outline-none text-sm"
                          placeholder="部門名稱"
                          value={dept.name}
                          onChange={(e) => {
                            const newDepts = [...tempSettings.departments];
                            newDepts[idx].name = e.target.value;
                            setTempSettings({ ...tempSettings, departments: newDepts });
                          }}
                        />
                        <input 
                          type="text"
                          className="w-24 p-2 border border-black/10 rounded-lg focus:border-black outline-none text-sm font-mono"
                          placeholder="代號"
                          value={dept.code}
                          onChange={(e) => {
                            const newDepts = [...tempSettings.departments];
                            newDepts[idx].code = e.target.value;
                            setTempSettings({ ...tempSettings, departments: newDepts });
                          }}
                        />
                        <button 
                          onClick={() => {
                            const newDepts = tempSettings.departments.filter((_, i) => i !== idx);
                            setTempSettings({ ...tempSettings, departments: newDepts });
                          }}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest opacity-50">職稱清單</label>
                    <button 
                      onClick={() => setTempSettings({
                        ...tempSettings,
                        titles: [...tempSettings.titles, '']
                      })}
                      className="p-1 hover:bg-black/5 rounded-full text-indigo-600"
                      title="新增職稱"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {tempSettings.titles.map((title, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input 
                          type="text"
                          className="flex-1 p-2 border border-black/10 rounded-lg focus:border-black outline-none text-sm"
                          placeholder="職稱名稱"
                          value={title}
                          onChange={(e) => {
                            const newTitles = [...tempSettings.titles];
                            newTitles[idx] = e.target.value;
                            setTempSettings({ ...tempSettings, titles: newTitles });
                          }}
                        />
                        <button 
                          onClick={() => {
                            const newTitles = tempSettings.titles.filter((_, i) => i !== idx);
                            setTempSettings({ ...tempSettings, titles: newTitles });
                          }}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest opacity-50">類型與背景顏色</label>
                    <button 
                      onClick={() => setTempSettings({
                        ...tempSettings,
                        memberTypes: [...tempSettings.memberTypes, { name: '', color: '#FFFFFF' }]
                      })}
                      className="p-1 hover:bg-black/5 rounded-full text-indigo-600"
                      title="新增類型"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {tempSettings.memberTypes.map((mt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input 
                          type="text"
                          className="flex-1 p-2 border border-black/10 rounded-lg focus:border-black outline-none text-sm"
                          placeholder="類型名稱"
                          value={mt.name}
                          onChange={(e) => {
                            const newTypes = [...tempSettings.memberTypes];
                            newTypes[idx].name = e.target.value;
                            setTempSettings({ ...tempSettings, memberTypes: newTypes });
                          }}
                        />
                        <div className="relative w-10 h-10 shrink-0">
                          <input 
                            type="color"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            value={mt.color}
                            onChange={(e) => {
                              const newTypes = [...tempSettings.memberTypes];
                              newTypes[idx].color = e.target.value;
                              setTempSettings({ ...tempSettings, memberTypes: newTypes });
                            }}
                          />
                          <div 
                            className="w-full h-full rounded-lg border border-black/10 shadow-sm"
                            style={{ backgroundColor: mt.color }}
                          />
                        </div>
                        <button 
                          onClick={() => {
                            const newTypes = tempSettings.memberTypes.filter((_, i) => i !== idx);
                            setTempSettings({ ...tempSettings, memberTypes: newTypes });
                          }}
                          className="p-2 text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest opacity-50">畫布寬度 (公分)</label>
                    <input 
                      type="number"
                      step="0.001"
                      className="w-full p-3 border border-black/10 rounded-xl focus:border-black outline-none font-mono text-sm"
                      value={tempSettings.canvasWidth}
                      onChange={(e) => setTempSettings({ ...tempSettings, canvasWidth: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest opacity-50">畫布高度 (公分)</label>
                    <input 
                      type="number"
                      step="0.001"
                      className="w-full p-3 border border-black/10 rounded-xl focus:border-black outline-none font-mono text-sm"
                      value={tempSettings.canvasHeight}
                      onChange={(e) => setTempSettings({ ...tempSettings, canvasHeight: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-black/5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40">顯示設定</h3>
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={tempSettings.showDepartmentCodes}
                          onChange={(e) => setTempSettings({ ...tempSettings, showDepartmentCodes: e.target.checked })}
                        />
                        <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-[#141414] transition-colors"></div>
                        <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-transform"></div>
                      </div>
                      <span className="text-xs font-medium text-black/70 group-hover:text-black transition-colors">顯示部門代號</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={tempSettings.showEmployeeIds}
                          onChange={(e) => setTempSettings({ ...tempSettings, showEmployeeIds: e.target.checked })}
                        />
                        <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-[#141414] transition-colors"></div>
                        <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-transform"></div>
                      </div>
                      <span className="text-xs font-medium text-black/70 group-hover:text-black transition-colors">顯示工號</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-black/10 bg-gray-50 flex justify-end">
                <button 
                  onClick={handleSaveSettings}
                  className="px-6 py-2 bg-[#141414] text-white text-xs font-bold uppercase tracking-widest hover:bg-opacity-90 transition-all"
                >
                  完成設定
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

