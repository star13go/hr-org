import { Employee, Annotation, AppSettings } from '../types';

export interface ProjectData {
  version: string;
  employees: Employee[];
  annotations: Annotation[];
  settings?: AppSettings;
  orgName?: string;
  versionDate?: string;
  lastModified: string;
}

export const saveProject = (
  employees: Employee[], 
  annotations: Annotation[], 
  settings: AppSettings,
  orgName: string, 
  versionDate: string, 
  filename: string = 'OrgChart_Project.json'
) => {
  const projectData: ProjectData = {
    version: '1.3',
    employees,
    annotations,
    settings,
    orgName,
    versionDate,
    lastModified: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const loadProject = async (file: File): Promise<ProjectData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.employees || !Array.isArray(data.employees)) {
          throw new Error('無效的專案格式');
        }
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};
