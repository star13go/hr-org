export interface Employee {
  id: string;
  employeeId?: string;
  name: string;
  title: string;
  department: string;
  departmentCode?: string;
  photo?: string; // Base64 or URL
  parentId?: string;
  isSubPage?: boolean;
  isSpecialAssistant?: boolean;
  isExecutive?: boolean;
  isManagerLabel?: boolean;
  proxyId?: string;
  canBeProxy?: boolean;
  notes?: string;
  subordinatesPerRow?: number; // 1 to 6
  memberType?: string;
  sortOrder?: number;
}

export interface OrgNode extends Employee {
  children?: OrgNode[];
  subordinateCount?: number;
  isVirtual?: boolean;
}

export interface DepartmentInfo {
  name: string;
  code: string;
}

export interface MemberType {
  name: string;
  color: string;
}

export interface AppSettings {
  departments: DepartmentInfo[];
  titles: string[];
  canvasWidth: number;
  canvasHeight: number;
  showDepartmentCodes: boolean;
  showEmployeeIds: boolean;
  memberTypes: MemberType[];
}

export interface Annotation {
  id: string;
  text: string;
  x: number;
  y: number;
}
