import * as XLSX from 'xlsx';
import { Employee } from '../types';

export interface ExcelImportResult {
  employees: Employee[];
  orgName?: string;
  versionDate?: string;
  departments?: { name: string; code: string }[];
  titles?: string[];
}

export const parseExcel = async (file: File): Promise<ExcelImportResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Parse Employees
        const employeeSheetName = workbook.SheetNames.find(name => 
          name === '員工名單' || name === 'Employees' || name === 'Sheet1'
        ) || workbook.SheetNames[0];
        const employeeWorksheet = workbook.Sheets[employeeSheetName];
        const employeeJson = XLSX.utils.sheet_to_json(employeeWorksheet) as any[];

        const employees: Employee[] = employeeJson.map((row, index) => ({
          id: row.ID?.toString() || row.id?.toString() || row['編號']?.toString() || `emp-${index}`,
          employeeId: row.EmployeeID?.toString() || row.employeeId?.toString() || row['工號']?.toString() || undefined,
          name: row.Name || row.name || row['姓名'] || 'Unknown',
          title: row.Title || row.title || row['職稱'] || 'Staff',
          department: row.Department || row.department || row['部門'] || 'General',
          departmentCode: row.DepartmentCode?.toString() || row.departmentCode?.toString() || row['部門代號']?.toString() || undefined,
          parentId: row.ParentID?.toString() || row.parentId?.toString() || row['上級編號']?.toString() || undefined,
          isSubPage: row.IsSubPage === 'TRUE' || row.isSubPage === true || row['子分頁'] === '是' || row['子分頁'] === true || row['子分頁'] === 'V',
          isManagerLabel: row.IsManagerLabel === 'TRUE' || row.isManagerLabel === true || row['主管標籤'] === '是' || row['主管標籤'] === true || row['主管標籤'] === 'V',
          isSpecialAssistant: row.IsSpecialAssistant === 'TRUE' || row.isSpecialAssistant === true || row['是否為特助'] === '是' || row['是否為特助'] === true || row['是否為特助'] === 'V',
          isExecutive: row.IsExecutive === 'TRUE' || row.isExecutive === true || row['是否為經營階層'] === '是' || row['是否為經營階層'] === true || row['是否為經營階層'] === 'V',
          proxyId: row.ProxyID?.toString() || row.proxyId?.toString() || row['代理人編號']?.toString() || undefined,
          canBeProxy: row.CanBeProxy === 'TRUE' || row.canBeProxy === true || row['可作為代理人'] === '是' || row['可作為代理人'] === true || row['可作為代理人'] === 'V',
          photo: row.Photo || row.photo || row['照片'] || undefined,
          notes: row.Notes || row.notes || row['備註'] || undefined,
        }));

        // Validation
        const ids = new Set<string>();
        const empIds = new Set<string>();
        let executiveCount = 0;
        const duplicateIds: string[] = [];
        const duplicateEmpIds: string[] = [];

        employees.forEach(emp => {
          if (ids.has(emp.id)) duplicateIds.push(emp.id);
          ids.add(emp.id);

          if (emp.employeeId) {
            if (empIds.has(emp.employeeId)) duplicateEmpIds.push(emp.employeeId);
            empIds.add(emp.employeeId);
          }

          if (emp.isExecutive) executiveCount++;
        });

        if (duplicateIds.length > 0) {
          throw new Error(`編號 (ID) 重複: ${[...new Set(duplicateIds)].join(', ')}`);
        }
        if (duplicateEmpIds.length > 0) {
          throw new Error(`工號重複: ${[...new Set(duplicateEmpIds)].join(', ')}`);
        }
        if (executiveCount > 1) {
          throw new Error(`經營階層只能有 1 位，目前偵測到 ${executiveCount} 位。`);
        }

        // Parse Project Info if exists
        let orgName: string | undefined;
        let versionDate: string | undefined;
        const infoSheetName = workbook.SheetNames.find(name => name === '專案資訊' || name === 'Project Info');
        if (infoSheetName) {
          const infoWorksheet = workbook.Sheets[infoSheetName];
          const infoJson = XLSX.utils.sheet_to_json(infoWorksheet) as any[];
          infoJson.forEach(row => {
            if (row['項目'] === '組織名稱' || row['Item'] === 'Org Name') orgName = row['內容'] || row['Content'];
            if (row['項目'] === '版本日期' || row['Item'] === 'Version Date') versionDate = row['內容'] || row['Content'];
          });
        }

        // Parse Departments if exists
        let departments: { name: string; code: string }[] | undefined;
        const deptSheetName = workbook.SheetNames.find(name => name === '部門對照表' || name === 'Departments');
        if (deptSheetName) {
          const deptWorksheet = workbook.Sheets[deptSheetName];
          const deptJson = XLSX.utils.sheet_to_json(deptWorksheet) as any[];
          departments = deptJson.map(row => ({
            name: row['部門名稱'] || row.Name || '',
            code: row['部門代號'] || row.Code || ''
          })).filter(d => d.name !== '');
        }

        // Parse Titles if exists
        let titles: string[] | undefined;
        const titleSheetName = workbook.SheetNames.find(name => name === '職稱清單' || name === 'Titles');
        if (titleSheetName) {
          const titleWorksheet = workbook.Sheets[titleSheetName];
          const titleJson = XLSX.utils.sheet_to_json(titleWorksheet) as any[];
          titles = titleJson.map(row => row['職稱名稱'] || row.Title || '').filter(t => t !== '');
        }

        resolve({ employees, orgName, versionDate, departments, titles });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

export const exportToExcel = (employees: Employee[], orgName: string, versionDate: string, departments: { name: string; code: string }[], titles: string[]) => {
  const employeeData = employees.map(emp => ({
    '編號': emp.id,
    '工號': emp.employeeId || '',
    '姓名': emp.name,
    '職稱': emp.title,
    '部門': emp.department,
    '部門代號': emp.departmentCode || '',
    '上級編號': emp.parentId || '',
    '子分頁': emp.isSubPage ? '是' : '否',
    '主管標籤': emp.isManagerLabel ? '是' : '否',
    '是否為特助': emp.isSpecialAssistant ? '是' : '否',
    '是否為經營階層': emp.isExecutive ? '是' : '否',
    '可作為代理人': emp.canBeProxy ? '是' : '否',
    '代理人編號': emp.proxyId || '',
    '照片': emp.photo || '',
    '備註': emp.notes || ''
  }));

  const deptData = departments.map(d => ({
    '部門名稱': d.name,
    '部門代號': d.code
  }));

  const titleData = titles.map(t => ({
    '職稱名稱': t
  }));

  const projectInfo = [
    { '項目': '組織名稱', '內容': orgName },
    { '項目': '版本日期', '內容': versionDate },
    { '項目': '匯出時間', '內容': new Date().toLocaleString() },
    { '項目': '總人數', '內容': employees.length }
  ];

  const workbook = XLSX.utils.book_new();
  
  const employeeSheet = XLSX.utils.json_to_sheet(employeeData);
  XLSX.utils.book_append_sheet(workbook, employeeSheet, "員工名單");

  const deptSheet = XLSX.utils.json_to_sheet(deptData);
  XLSX.utils.book_append_sheet(workbook, deptSheet, "部門對照表");

  const titleSheet = XLSX.utils.json_to_sheet(titleData);
  XLSX.utils.book_append_sheet(workbook, titleSheet, "職稱清單");

  const infoSheet = XLSX.utils.json_to_sheet(projectInfo);
  XLSX.utils.book_append_sheet(workbook, infoSheet, "專案資訊");

  // Generate buffer and download
  XLSX.writeFile(workbook, `${orgName}_組織圖數據.xlsx`);
};
