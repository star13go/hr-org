import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Employee, DepartmentInfo } from '../types';
import { Trash2, UserPlus, Search, Filter, GripVertical, Home } from 'lucide-react';

interface EmployeeTableProps {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  departments: DepartmentInfo[];
  titles: string[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onGoHome: () => void;
}

const Resizer = ({ colKey, onMouseDown }: { colKey: string; onMouseDown: (key: string, e: React.MouseEvent) => void }) => (
  <div 
    onMouseDown={(e) => onMouseDown(colKey, e)}
    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-400/50 transition-colors z-20"
  />
);

const FilterInput = ({ 
  colKey, 
  placeholder, 
  value, 
  onChange, 
  onEnter 
}: { 
  colKey: string; 
  placeholder: string; 
  value: string;
  onChange: (val: string) => void;
  onEnter: () => void;
}) => (
  <div className="mt-1 relative group/filter">
    <Filter size={8} className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-20 group-focus-within/filter:opacity-50" />
    <input 
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          onEnter();
        }
      }}
      className="w-full pl-4 pr-1 py-0.5 text-[9px] bg-white/50 border border-black/5 rounded focus:outline-none focus:border-indigo-300 focus:bg-white transition-all font-normal normal-case"
    />
  </div>
);

const FilterSelect = ({ 
  options, 
  value, 
  onChange 
}: { 
  options: string[]; 
  value: string;
  onChange: (val: string) => void;
}) => (
  <div className="mt-1 relative group/filter">
    <Filter size={8} className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-20 group-focus-within/filter:opacity-50 pointer-events-none" />
    <select 
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full pl-4 pr-1 py-0.5 text-[9px] bg-white/50 border border-black/5 rounded focus:outline-none focus:border-indigo-300 focus:bg-white transition-all font-normal normal-case cursor-pointer"
    >
      <option value="">全部</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

const EmployeeTable: React.FC<EmployeeTableProps> = ({ 
  employees, 
  setEmployees, 
  departments, 
  titles,
  selectedId,
  setSelectedId,
  onGoHome
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tempSearchTerm, setTempSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    level: 60,
    id: 120,
    empId: 100,
    name: 250,
    title: 150,
    dept: 150,
    parent: 150,
    exec: 60,
    asst: 60,
    subPage: 60,
    mgrLabel: 60,
    canProxy: 60,
    proxy: 150,
    notes: 200,
    actions: 80
  });

  const [filters, setFilters] = useState<Record<string, string>>({
    level: '',
    id: '',
    empId: '',
    name: '',
    title: '',
    dept: '',
    parent: '',
    proxy: '',
    notes: ''
  });

  const [tempFilters, setTempFilters] = useState<Record<string, string>>({
    level: '',
    id: '',
    empId: '',
    name: '',
    title: '',
    dept: '',
    parent: '',
    proxy: '',
    notes: ''
  });

  const resizingCol = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const onMouseDown = (key: string, e: React.MouseEvent) => {
    resizingCol.current = {
      key,
      startX: e.pageX,
      startWidth: colWidths[key]
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingCol.current) return;
    const { key, startX, startWidth } = resizingCol.current;
    const delta = e.pageX - startX;
    setColWidths(prev => ({
      ...prev,
      [key]: Math.max(50, startWidth + delta)
    }));
  }, []);

  const onMouseUp = useCallback(() => {
    resizingCol.current = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'default';
  }, [onMouseMove]);

  const handleUpdate = (id: string, updates: Partial<Employee>) => {
    const currentEmp = employees.find(e => e.id === id);
    
    // Prevent unchecking the only executive
    if (updates.isExecutive === false && currentEmp?.isExecutive) {
      alert('經營階層必須存在一位，請透過勾選其他人員來更換經營階層');
      return;
    }

    let finalUpdates = { ...updates };

    // Role mutual exclusivity logic
    if (updates.isSpecialAssistant === true) {
      finalUpdates.isSubPage = false;
      finalUpdates.isExecutive = false;
    } else if (updates.isSubPage === true || updates.isExecutive === true || updates.isManagerLabel === true) {
      finalUpdates.isSpecialAssistant = false;

      // Sync logic: if checking Executive or Sub-page, also check Proxy and Manager Label
      if (updates.isExecutive === true || updates.isSubPage === true) {
        finalUpdates.canBeProxy = true;
        finalUpdates.isManagerLabel = true;
      }
    }

    // Enforce synchronization: if Executive or Sub-page is currently true, Proxy and Manager Label must remain true
    if (currentEmp) {
      const isExec = updates.isExecutive !== undefined ? updates.isExecutive : currentEmp.isExecutive;
      const isSub = updates.isSubPage !== undefined ? updates.isSubPage : currentEmp.isSubPage;
      
      if (isExec || isSub) {
        finalUpdates.canBeProxy = true;
        finalUpdates.isManagerLabel = true;
      }
    }

    setEmployees(prev => prev.map(emp => {
      if (emp.id === id) {
        const updated = { ...emp, ...finalUpdates };
        // Rule: If manager label is removed, clear proxy
        if (updated.isManagerLabel === false) {
          updated.proxyId = undefined;
        }
        return updated;
      }
      
      // Rule: If the employee's manager label is removed, 
      // any children who are special assistants must be unchecked
      if (updates.isManagerLabel === false && emp.parentId === id) {
        return { ...emp, isSpecialAssistant: false };
      }

      // Single Executive logic: if we are setting a new executive, unset others
      if (updates.isExecutive === true) {
        return { ...emp, isExecutive: false };
      }
      return emp;
    }));
  };

  const handleDelete = (id: string) => {
    const emp = employees.find(e => e.id === id);
    if (emp?.isExecutive) {
      alert('經營階層為唯一且無法刪除');
      return;
    }
    if (window.confirm('確定要刪除此成員嗎？')) {
      setEmployees(prev => prev.filter(emp => emp.id !== id));
    }
  };

  const handleAdd = () => {
    if (!selectedId) {
      alert('請先點選一位員工作為上級主管');
      return;
    }
    const selectedEmployee = employees.find(e => e.id === selectedId);
    if (!selectedEmployee) return;

    const newId = `emp-${Date.now()}`;
    const newEmployee: Employee = {
      id: newId,
      name: '新成員',
      title: titles[0] || '專員',
      department: selectedEmployee.department,
      departmentCode: selectedEmployee.departmentCode,
      parentId: selectedId,
    };
    setEmployees(prev => [...prev, newEmployee]);
  };

  // Hierarchical sorting logic
  const getHierarchicalList = () => {
    const result: (Employee & { depth: number })[] = [];
    const visited = new Set<string>();

    const traverse = (parentId: string | undefined, depth: number) => {
      const children = employees.filter(e => e.parentId === parentId);
      
      children.sort((a, b) => {
        if (a.isExecutive !== b.isExecutive) return a.isExecutive ? -1 : 1;
        if (a.isSpecialAssistant !== b.isSpecialAssistant) return a.isSpecialAssistant ? -1 : 1;
        if (a.isSubPage !== b.isSubPage) return a.isSubPage ? -1 : 1;
        return a.id.localeCompare(b.id);
      });

      children.forEach(child => {
        if (!visited.has(child.id)) {
          visited.add(child.id);
          result.push({ ...child, depth });
          traverse(child.id, depth + 1);
        }
      });
    };

    const roots = employees.filter(e => !e.parentId || !employees.find(p => p.id === e.parentId));
    
    roots.sort((a, b) => {
      if (a.isExecutive !== b.isExecutive) return a.isExecutive ? -1 : 1;
      if (a.isSpecialAssistant !== b.isSpecialAssistant) return a.isSpecialAssistant ? -1 : 1;
      if (a.isSubPage !== b.isSubPage) return a.isSubPage ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    roots.forEach(root => {
      if (!visited.has(root.id)) {
        visited.add(root.id);
        const startDepth = root.isExecutive ? 0 : -1;
        result.push({ ...root, depth: startDepth });
        traverse(root.id, startDepth + 1);
      }
    });

    // Handle any orphaned nodes just in case
    employees.forEach(e => {
      if (!visited.has(e.id)) {
        visited.add(e.id);
        result.push({ ...e, depth: 0 });
      }
    });

    return result;
  };

  const sortedEmployees = useMemo(() => getHierarchicalList(), [employees]);

  const filteredEmployees = useMemo(() => {
    return sortedEmployees.filter(emp => {
      const levelStr = `L${emp.depth + 1}`;
      
      const matchesSearch = searchTerm === '' || 
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.title.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilters = Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        const val = (value as string).toLowerCase();
        switch(key) {
          case 'level': return levelStr.toLowerCase() === val;
          case 'id': return emp.id.toLowerCase().includes(val);
          case 'empId': return (emp.employeeId || '').toLowerCase().includes(val);
          case 'name': return emp.name.toLowerCase().includes(val);
          case 'title': return emp.title.toLowerCase().includes(val);
          case 'dept': return emp.department.toLowerCase().includes(val);
          case 'parent': return (emp.parentId || '').toLowerCase().includes(val);
          case 'proxy': return (emp.proxyId || '').toLowerCase().includes(val);
          case 'notes': return (emp.notes || '').toLowerCase().includes(val);
          default: return true;
        }
      });

      return matchesSearch && matchesFilters;
    });
  }, [sortedEmployees, searchTerm, filters]);

  const availableLevels = useMemo(() => {
    const levels = new Set<string>();
    sortedEmployees.forEach(emp => levels.add(`L${emp.depth + 1}`));
    return Array.from(levels).sort((a, b) => {
      const numA = parseInt(a.substring(1));
      const numB = parseInt(b.substring(1));
      return numA - numB;
    });
  }, [sortedEmployees]);

  const totalPages = useMemo(() => Math.ceil(filteredEmployees.length / pageSize), [filteredEmployees.length, pageSize]);
  const paginatedEmployees = useMemo(() => filteredEmployees.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filteredEmployees, currentPage, pageSize]);

  return (
    <div className="flex flex-col h-full bg-white select-none">
      <div className="p-4 border-b border-black/5 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-4 flex-1">
          <button 
            onClick={onGoHome}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-black/10 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-black/5 transition-all shadow-sm"
          >
            <Home size={14} />
            首頁
          </button>
          <h2 className="text-sm font-bold uppercase tracking-widest opacity-60 ml-2">人員設定總表</h2>
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
            <input 
              type="text" 
              placeholder="快速搜尋姓名、編號、部門或職稱 (按 Enter 啟用)..." 
              value={tempSearchTerm}
              onChange={e => setTempSearchTerm(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setSearchTerm(tempSearchTerm);
                  setCurrentPage(1);
                }
              }}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-white border border-black/10 rounded-full focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-60">
            <span>顯示筆數:</span>
            <select 
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border border-black/10 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-1.5 rounded hover:bg-black/5 disabled:opacity-20 transition-colors"
            >
              <Search size={14} className="rotate-180" />
            </button>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
              第 {currentPage} / {totalPages || 1} 頁
            </span>
            <button 
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-1.5 rounded hover:bg-black/5 disabled:opacity-20 transition-colors"
            >
              <Search size={14} />
            </button>
          </div>

          <button 
            onClick={handleAdd}
            className={`flex items-center gap-2 px-4 py-1.5 text-white text-xs font-bold uppercase tracking-widest rounded-full transition-all shadow-lg ${
              selectedId 
                ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' 
                : 'bg-gray-400 cursor-not-allowed shadow-none opacity-50'
            }`}
          >
            <UserPlus size={14} />
            新增部屬
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-scroll custom-scrollbar bg-gray-50/30">
        <table className="w-full text-left border-collapse table-fixed min-h-full">
          <thead className="sticky top-0 bg-gray-100 z-30 shadow-sm">
            <tr className="text-[10px] font-bold uppercase tracking-widest opacity-60 border-b border-black/10">
              <th className="px-3 py-3 relative border-r border-black/5" style={{ width: colWidths.level }}>
                層級
                <FilterSelect 
                  options={availableLevels}
                  value={tempFilters.level}
                  onChange={val => {
                    setTempFilters(prev => ({ ...prev, level: val }));
                    setFilters(prev => ({ ...prev, level: val }));
                    setCurrentPage(1);
                  }}
                />
                <Resizer colKey="level" onMouseDown={onMouseDown} />
              </th>
              <th className="px-3 py-3 relative border-r border-black/5" style={{ width: colWidths.id }}>
                編號 (ID)
                <FilterInput 
                  colKey="id" 
                  placeholder="Enter 篩選" 
                  value={tempFilters.id}
                  onChange={val => setTempFilters(prev => ({ ...prev, id: val }))}
                  onEnter={() => {
                    setFilters(prev => ({ ...prev, id: tempFilters.id }));
                    setCurrentPage(1);
                  }}
                />
                <Resizer colKey="id" onMouseDown={onMouseDown} />
              </th>
              <th className="px-3 py-3 relative border-r border-black/5" style={{ width: colWidths.empId }}>
                工號
                <FilterInput 
                  colKey="empId" 
                  placeholder="Enter 篩選" 
                  value={tempFilters.empId}
                  onChange={val => setTempFilters(prev => ({ ...prev, empId: val }))}
                  onEnter={() => {
                    setFilters(prev => ({ ...prev, empId: tempFilters.empId }));
                    setCurrentPage(1);
                  }}
                />
                <Resizer colKey="empId" onMouseDown={onMouseDown} />
              </th>
              <th className="px-3 py-3 relative border-r border-black/5" style={{ width: colWidths.name }}>
                姓名
                <FilterInput 
                  colKey="name" 
                  placeholder="Enter 篩選" 
                  value={tempFilters.name}
                  onChange={val => setTempFilters(prev => ({ ...prev, name: val }))}
                  onEnter={() => {
                    setFilters(prev => ({ ...prev, name: tempFilters.name }));
                    setCurrentPage(1);
                  }}
                />
                <Resizer colKey="name" onMouseDown={onMouseDown} />
              </th>
              <th className="px-3 py-3 relative border-r border-black/5" style={{ width: colWidths.title }}>
                職稱
                <FilterInput 
                  colKey="title" 
                  placeholder="Enter 篩選" 
                  value={tempFilters.title}
                  onChange={val => setTempFilters(prev => ({ ...prev, title: val }))}
                  onEnter={() => {
                    setFilters(prev => ({ ...prev, title: tempFilters.title }));
                    setCurrentPage(1);
                  }}
                />
                <Resizer colKey="title" onMouseDown={onMouseDown} />
              </th>
              <th className="px-3 py-3 relative border-r border-black/5" style={{ width: colWidths.dept }}>
                部門
                <FilterInput 
                  colKey="dept" 
                  placeholder="Enter 篩選" 
                  value={tempFilters.dept}
                  onChange={val => setTempFilters(prev => ({ ...prev, dept: val }))}
                  onEnter={() => {
                    setFilters(prev => ({ ...prev, dept: tempFilters.dept }));
                    setCurrentPage(1);
                  }}
                />
                <Resizer colKey="dept" onMouseDown={onMouseDown} />
              </th>
              <th className="px-3 py-3 relative border-r border-black/5" style={{ width: colWidths.parent }}>
                上級編號
                <FilterInput 
                  colKey="parent" 
                  placeholder="Enter 篩選" 
                  value={tempFilters.parent}
                  onChange={val => setTempFilters(prev => ({ ...prev, parent: val }))}
                  onEnter={() => {
                    setFilters(prev => ({ ...prev, parent: tempFilters.parent }));
                    setCurrentPage(1);
                  }}
                />
                <Resizer colKey="parent" onMouseDown={onMouseDown} />
              </th>
              <th className="px-1 py-3 relative border-r border-black/5 text-center" style={{ width: colWidths.exec }}>
                經營
                <Resizer colKey="exec" onMouseDown={onMouseDown} />
              </th>
              <th className="px-1 py-3 relative border-r border-black/5 text-center" style={{ width: colWidths.asst }}>
                特助
                <Resizer colKey="asst" onMouseDown={onMouseDown} />
              </th>
              <th className="px-1 py-3 relative border-r border-black/5 text-center" style={{ width: colWidths.subPage }}>
                子分頁
                <Resizer colKey="subPage" onMouseDown={onMouseDown} />
              </th>
              <th className="px-1 py-3 relative border-r border-black/5 text-center" style={{ width: colWidths.mgrLabel }}>
                標籤
                <Resizer colKey="mgrLabel" onMouseDown={onMouseDown} />
              </th>
              <th className="px-1 py-3 relative border-r border-black/5 text-center" style={{ width: colWidths.canProxy }}>
                代理
                <Resizer colKey="canProxy" onMouseDown={onMouseDown} />
              </th>
              <th className="px-3 py-3 relative border-r border-black/5" style={{ width: colWidths.proxy }}>
                代理人編號
                <FilterInput 
                  colKey="proxy" 
                  placeholder="Enter 篩選" 
                  value={tempFilters.proxy}
                  onChange={val => setTempFilters(prev => ({ ...prev, proxy: val }))}
                  onEnter={() => {
                    setFilters(prev => ({ ...prev, proxy: tempFilters.proxy }));
                    setCurrentPage(1);
                  }}
                />
                <Resizer colKey="proxy" onMouseDown={onMouseDown} />
              </th>
              <th className="px-3 py-3 relative border-r border-black/5" style={{ width: colWidths.notes }}>
                備註
                <FilterInput 
                  colKey="notes" 
                  placeholder="Enter 篩選" 
                  value={tempFilters.notes}
                  onChange={val => setTempFilters(prev => ({ ...prev, notes: val }))}
                  onEnter={() => {
                    setFilters(prev => ({ ...prev, notes: tempFilters.notes }));
                    setCurrentPage(1);
                  }}
                />
                <Resizer colKey="notes" onMouseDown={onMouseDown} />
              </th>
              <th className="px-3 py-3 relative" style={{ width: colWidths.actions }}>
                操作
                <Resizer colKey="actions" onMouseDown={onMouseDown} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 bg-white">
            {paginatedEmployees.map(emp => {
              const isSelected = emp.id === selectedId;
              return (
                <tr 
                  key={emp.id} 
                  onClick={() => setSelectedId(isSelected ? null : emp.id)}
                  className={`transition-colors group select-text cursor-pointer ${
                    isSelected 
                      ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-500 z-10 relative' 
                      : 'hover:bg-indigo-50/30'
                  }`}
                >
                  <td className="px-3 py-2 text-center border-r border-black/5">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${emp.isExecutive ? 'bg-indigo-600 text-white' : emp.depth === -1 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 opacity-50'}`}>
                    L{emp.depth + 1}
                  </span>
                </td>
                <td className="px-3 py-2 border-r border-black/5">
                  <input 
                    type="text" 
                    value={emp.id} 
                    onChange={e => handleUpdate(emp.id, { id: e.target.value })}
                    className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-200 rounded text-xs font-mono px-1"
                  />
                </td>
                <td className="px-3 py-2 border-r border-black/5">
                  <input 
                    type="text" 
                    value={emp.employeeId || ''} 
                    onChange={e => handleUpdate(emp.id, { employeeId: e.target.value })}
                    placeholder="-"
                    className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-200 rounded text-xs px-1"
                  />
                </td>
                <td className="px-3 py-2 border-r border-black/5">
                  <div className="flex items-center gap-2" style={{ paddingLeft: `${Math.max(0, emp.depth + 1) * 20}px` }}>
                    {(emp.depth > 0 || (emp.depth === 0 && !emp.isExecutive)) && (
                      <div className="w-3 h-px bg-black/10 flex-shrink-0" />
                    )}
                    <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[7px] font-bold ${emp.photo ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                      {emp.photo ? '有' : '無'}
                    </div>
                    <input 
                      type="text" 
                      value={emp.name} 
                      onChange={e => handleUpdate(emp.id, { name: e.target.value })}
                      className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-200 rounded text-xs font-bold px-1"
                    />
                  </div>
                </td>
                <td className="px-3 py-2 border-r border-black/5">
                  <select 
                    value={emp.title} 
                    onChange={e => handleUpdate(emp.id, { title: e.target.value })}
                    className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-200 rounded text-xs appearance-none cursor-pointer px-1"
                  >
                    {titles.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 border-r border-black/5">
                  <select 
                    value={emp.department} 
                    onChange={e => handleUpdate(emp.id, { department: e.target.value })}
                    className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-200 rounded text-xs appearance-none cursor-pointer px-1"
                  >
                    {departments.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 border-r border-black/5">
                  <select 
                    value={emp.parentId || ''} 
                    onChange={e => handleUpdate(emp.id, { parentId: e.target.value || undefined })}
                    className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-200 rounded text-xs appearance-none cursor-pointer px-1"
                  >
                    <option value="">(無上級)</option>
                    {employees.filter(e => e.id !== emp.id).map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.id})</option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-2 text-center border-r border-black/5">
                  <input 
                    type="checkbox" 
                    checked={emp.isExecutive || false} 
                    onChange={e => handleUpdate(emp.id, { isExecutive: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                  />
                </td>
                <td className="px-1 py-2 text-center border-r border-black/5">
                  <input 
                    type="checkbox" 
                    checked={emp.isSpecialAssistant || false} 
                    disabled={(() => {
                      if (!emp.parentId) return true;
                      const parent = employees.find(e => e.id === emp.parentId);
                      return !parent?.isManagerLabel;
                    })()}
                    onChange={e => handleUpdate(emp.id, { isSpecialAssistant: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3 disabled:opacity-30"
                  />
                </td>
                <td className="px-1 py-2 text-center border-r border-black/5">
                  <input 
                    type="checkbox" 
                    checked={emp.isSubPage || false} 
                    onChange={e => handleUpdate(emp.id, { isSubPage: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                  />
                </td>
                <td className="px-1 py-2 text-center border-r border-black/5">
                  <input 
                    type="checkbox" 
                    checked={emp.isManagerLabel || false} 
                    disabled={emp.isExecutive || emp.isSubPage}
                    onChange={e => handleUpdate(emp.id, { isManagerLabel: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3 disabled:opacity-50"
                  />
                </td>
                <td className="px-1 py-2 text-center border-r border-black/5">
                  <input 
                    type="checkbox" 
                    checked={emp.canBeProxy || false} 
                    disabled={emp.isExecutive || emp.isSubPage}
                    onChange={e => handleUpdate(emp.id, { canBeProxy: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3 disabled:opacity-50"
                  />
                </td>
                <td className="px-3 py-2 border-r border-black/5">
                  <select 
                    value={emp.proxyId || ''} 
                    disabled={!emp.isManagerLabel}
                    onChange={e => handleUpdate(emp.id, { proxyId: e.target.value || undefined })}
                    className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-200 rounded text-xs appearance-none cursor-pointer px-1 disabled:opacity-30"
                  >
                    <option value="">(無代理人)</option>
                    {employees.filter(e => e.id !== emp.id && e.canBeProxy).map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.id})</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 border-r border-black/5">
                  <input 
                    type="text" 
                    value={emp.notes || ''} 
                    onChange={e => handleUpdate(emp.id, { notes: e.target.value })}
                    placeholder="輸入備註..."
                    className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-200 rounded text-xs px-1 italic opacity-70 focus:opacity-100"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <button 
                    onClick={() => handleDelete(emp.id)}
                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredEmployees.length === 0 && (
          <div className="p-20 text-center opacity-30">
            <Search size={48} className="mx-auto mb-4" />
            <p className="text-sm font-medium uppercase tracking-widest">查無符合條件的人員</p>
          </div>
        )}
      </div>
      
      <div className="p-4 bg-gray-50 border-t border-black/5 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest opacity-40">
        <div>總計: {employees.length} 位成員 (篩選後: {filteredEmployees.length})</div>
        <div className="flex gap-4">
          <span>提示: 拖曳標題邊緣可調整寬度</span>
          <span>按 Enter 啟用篩選</span>
          <span>點擊欄位即可直接編輯</span>
        </div>
      </div>
    </div>
  );
};

export default EmployeeTable;
